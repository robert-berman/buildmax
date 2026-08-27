// Postgres-backed StatsProvider (Drizzle). Serves whatever the ingestion
// pipeline wrote and does not hard-code a rank bracket, so the engine and UI
// work unchanged on real data. Patches stay strictly separate (no bucketing);
// per champion, observed builds resolve to the freshest patch that actually has
// them, so a brand-new patch with few games doesn't hide the previous patch's
// data. Reads precomputed aggregate tables only -- never aggregates at query time.

import { and, eq } from "drizzle-orm";
import { PATCH } from "@/data/ddragon";
import { getDb } from "@/db/client";
import { buildStats, championRoleAgg } from "@/db/schema";
import type {
  BuildStat, ChampionRoleAgg, GameStage, RankBracket, Role, StatsMeta, StatsProvider, StatsQuery,
} from "./types";

/** Numeric major.minor comparison so "16.17" > "16.9". */
function patchRank(p: string): number {
  const [maj, min] = p.split(".").map(Number);
  return (maj || 0) * 1000 + (min || 0);
}

function toBuildStat(r: typeof buildStats.$inferSelect): BuildStat {
  return {
    id: r.id, champion: r.champion, role: r.role as Role, patch: r.patch,
    rank: r.rank as RankBracket, region: r.region, items: r.items, boots: r.boots ?? null,
    games: r.games, wins: r.wins, pickRate: r.pickRate, gameStage: r.gameStage as GameStage,
  };
}

class PostgresStatsProvider implements StatsProvider {
  readonly name = "postgres";

  private async latest(): Promise<{ patch: string; rank: string } | null> {
    const db = getDb();
    const patches = await db.selectDistinct({ patch: buildStats.patch }).from(buildStats);
    if (!patches.length) return null;
    const patch = patches.map((p) => p.patch).sort((a, b) => patchRank(b) - patchRank(a))[0];
    const rankRow = await db.select({ rank: buildStats.rank }).from(buildStats).where(eq(buildStats.patch, patch)).limit(1);
    return { patch, rank: rankRow[0]?.rank ?? "ALL" };
  }

  private buildRows(champion: string, patch: string, role?: Role) {
    const db = getDb();
    const conds = [eq(buildStats.champion, champion), eq(buildStats.patch, patch)];
    if (role) conds.push(eq(buildStats.role, role));
    return db.select().from(buildStats).where(and(...conds));
  }

  /**
   * Freshest patch that actually has aggregated builds for this champion(+role).
   * Patches stay strictly separate (no bucketing), but a brand-new patch with
   * almost no games shouldn't hide the previous patch's real data -- so observed
   * builds fall back to the most recent patch that has them.
   */
  private async freshestPatchWithBuilds(champion: string, role?: Role): Promise<string | null> {
    const db = getDb();
    const conds = [eq(buildStats.champion, champion)];
    if (role) conds.push(eq(buildStats.role, role));
    const rows = await db.selectDistinct({ patch: buildStats.patch }).from(buildStats).where(and(...conds));
    if (!rows.length) return null;
    return rows.map((r) => r.patch).sort((a, b) => patchRank(b) - patchRank(a))[0];
  }

  async getBuilds(query: StatsQuery): Promise<BuildStat[]> {
    const preferred = query.patch ?? (await this.latest())?.patch ?? PATCH;
    let rows = await this.buildRows(query.champion, preferred, query.role);
    if (!rows.length) {
      const fresh = await this.freshestPatchWithBuilds(query.champion, query.role);
      if (fresh && fresh !== preferred) rows = await this.buildRows(query.champion, fresh, query.role);
    }
    return rows.map(toBuildStat);
  }

  async getChampionRoleAggs(champion: string, patch?: string): Promise<ChampionRoleAgg[]> {
    const db = getDb();
    const preferred = patch ?? (await this.latest())?.patch ?? PATCH;
    const aggRows = (p: string) =>
      db.select().from(championRoleAgg).where(and(eq(championRoleAgg.champion, champion), eq(championRoleAgg.patch, p)));
    let rows = await aggRows(preferred);
    if (!rows.length) {
      const fresh = await this.freshestPatchWithBuilds(champion);
      if (fresh && fresh !== preferred) rows = await aggRows(fresh);
    }
    return rows.map((r) => ({
      champion: r.champion, role: r.role as Role, patch: r.patch, rank: r.rank as RankBracket,
      games: r.games, wins: r.wins, pickRate: r.pickRate, banRate: r.banRate ?? undefined,
    }));
  }

  async getMeta(): Promise<StatsMeta> {
    const latest = await this.latest();
    return {
      provider: this.name,
      patch: latest?.patch ?? PATCH,
      rank: (latest?.rank as RankBracket) ?? "EMERALD_PLUS",
      live: true,
      sampleNote: latest
        ? `Live data ingested from the Riot Match-V5 API (ranked solo, ${latest.rank.replace("_", " ").toLowerCase()}, patch ${latest.patch}).`
        : "No ingested data yet - run `npm run ingest` with a Riot API key.",
    };
  }
}

let singleton: PostgresStatsProvider | null = null;
export function getPostgresProvider(): StatsProvider {
  return (singleton ??= new PostgresStatsProvider());
}
