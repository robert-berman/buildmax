// Postgres-backed StatsProvider (Drizzle). Identical contract to the seed
// provider, so the engine and UI are unaware of which one is serving data.
// Reads precomputed aggregate tables -- it never aggregates raw matches at
// query time. Populate the tables with `npm run db:seed` (or the future Riot
// ingestion pipeline).

import { and, eq } from "drizzle-orm";
import { PATCH } from "@/data/ddragon";
import { getDb } from "@/db/client";
import { buildStats, championRoleAgg } from "@/db/schema";
import type {
  BuildStat,
  ChampionRoleAgg,
  GameStage,
  RankBracket,
  Role,
  StatsMeta,
  StatsProvider,
  StatsQuery,
} from "./types";

const DEFAULT_RANK: RankBracket = "EMERALD_PLUS";

function toBuildStat(r: typeof buildStats.$inferSelect): BuildStat {
  return {
    id: r.id,
    champion: r.champion,
    role: r.role as Role,
    patch: r.patch,
    rank: r.rank as RankBracket,
    region: r.region,
    items: r.items,
    boots: r.boots ?? null,
    games: r.games,
    wins: r.wins,
    pickRate: r.pickRate,
    gameStage: r.gameStage as GameStage,
  };
}

class PostgresStatsProvider implements StatsProvider {
  readonly name = "postgres";

  async getBuilds(query: StatsQuery): Promise<BuildStat[]> {
    const db = getDb();
    const patch = query.patch ?? PATCH;
    const rank = query.rank ?? DEFAULT_RANK;
    const conds = [
      eq(buildStats.champion, query.champion),
      eq(buildStats.patch, patch),
      eq(buildStats.rank, rank),
    ];
    if (query.role) conds.push(eq(buildStats.role, query.role));
    const rows = await db.select().from(buildStats).where(and(...conds));
    return rows.map(toBuildStat);
  }

  async getChampionRoleAggs(
    champion: string,
    patch: string = PATCH,
    rank: RankBracket = DEFAULT_RANK,
  ): Promise<ChampionRoleAgg[]> {
    const db = getDb();
    const rows = await db
      .select()
      .from(championRoleAgg)
      .where(
        and(
          eq(championRoleAgg.champion, champion),
          eq(championRoleAgg.patch, patch),
          eq(championRoleAgg.rank, rank),
        ),
      );
    return rows.map((r) => ({
      champion: r.champion,
      role: r.role as Role,
      patch: r.patch,
      rank: r.rank as RankBracket,
      games: r.games,
      wins: r.wins,
      pickRate: r.pickRate,
      banRate: r.banRate ?? undefined,
    }));
  }

  async getMeta(): Promise<StatsMeta> {
    return {
      provider: this.name,
      patch: PATCH,
      rank: DEFAULT_RANK,
      live: true,
      sampleNote:
        "Served from Postgres via Drizzle. Swap the seed job for the Riot ingestion pipeline to make these numbers fully live.",
    };
  }
}

let singleton: PostgresStatsProvider | null = null;

export function getPostgresProvider(): StatsProvider {
  return (singleton ??= new PostgresStatsProvider());
}
