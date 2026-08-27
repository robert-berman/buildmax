// Postgres-backed StatsProvider (Drizzle). Serves whatever the ingestion
// pipeline wrote: it auto-selects the newest patch present and does not hard-code
// a rank bracket, so the engine and UI work unchanged on real data. Reads
// precomputed aggregate tables only -- never aggregates raw matches at query time.

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

  async getBuilds(query: StatsQuery): Promise<BuildStat[]> {
    const db = getDb();
    const patch = query.patch ?? (await this.latest())?.patch ?? PATCH;
    const conds = [eq(buildStats.champion, query.champion), eq(buildStats.patch, patch)];
    if (query.role) conds.push(eq(buildStats.role, query.role));
    const rows = await db.select().from(buildStats).where(and(...conds));
    return rows.map(toBuildStat);
  }

  async getChampionRoleAggs(champion: string, patch?: string): Promise<ChampionRoleAgg[]> {
    const db = getDb();
    const usePatch = patch ?? (await this.latest())?.patch ?? PATCH;
    const rows = await db
      .select()
      .from(championRoleAgg)
      .where(and(eq(championRoleAgg.champion, champion), eq(championRoleAgg.patch, usePatch)));
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
