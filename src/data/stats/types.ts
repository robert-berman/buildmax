// The aggregated-stats data model. A BuildStat is exactly what a GROUP BY over
// match-v5 participants (filtered by champion / role / patch / rank) produces,
// so the seed provider and a real Riot-ingestion provider share this schema.

export type Role = "TOP" | "JUNGLE" | "MIDDLE" | "BOTTOM" | "SUPPORT";

export const ROLES: Role[] = ["TOP", "JUNGLE", "MIDDLE", "BOTTOM", "SUPPORT"];

export type RankBracket =
  | "ALL"
  | "GOLD_PLUS"
  | "PLATINUM_PLUS"
  | "EMERALD_PLUS"
  | "DIAMOND_PLUS"
  | "MASTER_PLUS";

export type GameStage = "EARLY" | "MID" | "LATE";

/** A single aggregated core-item build for a champion+role in a patch+bracket. */
export interface BuildStat {
  id: string;
  champion: string; // championId, e.g. "Hecarim"
  role: Role;
  patch: string; // e.g. "16.17"
  rank: RankBracket;
  region: string; // "world" for the global aggregate
  items: number[]; // completed core items, in build order
  boots: number | null; // boots item id (tracked separately from core items)
  games: number; // sample size
  wins: number;
  pickRate: number; // 0..1 — share of this champion+role's games running this build
  gameStage: GameStage; // when the build is typically online / its power spike
}

/** Champion+role headline aggregate (used to pick a default role and context). */
export interface ChampionRoleAgg {
  champion: string;
  role: Role;
  patch: string;
  rank: RankBracket;
  games: number;
  wins: number;
  pickRate: number; // share of games this champion is played in this role
  banRate?: number;
}

/** Observed pairwise item co-occurrence (real synergy signal from matches). */
export interface ItemPairStat {
  champion: string;
  role: Role;
  patch: string;
  rank: RankBracket;
  itemA: number;
  itemB: number;
  games: number;
  wins: number;
}

export interface StatsQuery {
  champion: string;
  role?: Role;
  patch?: string;
  rank?: RankBracket;
}

export interface StatsMeta {
  provider: string;
  patch: string;
  rank: RankBracket;
  /** Human note about where the numbers come from (shown in the UI). */
  sampleNote: string;
  live: boolean; // true for real ingested data, false for seed/representative data
}

/**
 * The data-access contract. Swapping the seed provider for a Postgres/Drizzle
 * provider (fed by real Riot ingestion) requires no engine or UI changes.
 */
export interface StatsProvider {
  readonly name: string;
  getBuilds(query: StatsQuery): Promise<BuildStat[]>;
  getChampionRoleAggs(champion: string, patch?: string, rank?: RankBracket): Promise<ChampionRoleAgg[]>;
  getMeta(): Promise<StatsMeta>;
}
