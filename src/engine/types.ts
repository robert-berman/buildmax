import type { GameStage, RankBracket, Role } from "@/data/stats/types";

export type Archetype =
  | "crit"
  | "onhit"
  | "lethality"
  | "attackspeed"
  | "ap_burst"
  | "tank"
  | "bruiser"
  | null;

export interface ParsedQuery {
  raw: string;
  championId: string | null;
  championName: string | null;
  championScore: number; // 1 = exact/alias match, <1 = fuzzy
  role: Role | null;
  requiredItemIds: number[];
  requiredItemNames: string[];
  archetype: Archetype;
  unmatchedTokens: string[];
  confidence: number; // 0..1 overall parse confidence
}

export interface ResultItem {
  id: number;
  name: string;
  iconUrl: string;
  requested: boolean; // one of the user's requested items -> highlight it
  isBoots: boolean;
}

export type Provenance = "observed" | "recommended";

/** Per-item "why" (item -> champion ability/stat and item -> item interactions). */
export interface ItemWhy {
  itemId: number;
  name: string;
  reasons: string[];
}

/** Layered synergy explanation for a whole build. */
export interface BuildExplanation {
  summary: string; // build identity
  topReasons: string[]; // best 3-4 build-level reasons
  perItem: ItemWhy[];
}

export interface SearchResult {
  id: string;
  provenance: Provenance;
  champion: string;
  championName: string;
  role: Role;
  patch: string;
  rank: RankBracket;
  region: string;

  path: ResultItem[]; // core items, in build order
  boots: ResultItem | null;

  // Observed statistics (null for synergy-only recommendations).
  games: number | null;
  wins: number | null;
  winRate: number | null; // 0..1
  pickRate: number | null; // 0..1
  observedScore: number | null; // Wilson lower bound, 0..1
  gameStage: GameStage | null;

  // Synergy axis (always present).
  synergyScore: number; // 0..1
  synergyReasons: string[]; // = explanation.topReasons (kept for compact display)
  explanation: BuildExplanation;

  matchedRequiredItemIds: number[];
}

export interface SearchResponseMeta {
  provider: string;
  patch: string;
  rank: RankBracket;
  live: boolean;
  sampleNote: string;
  championName: string | null;
  roleResolved: Role | null;
  roleInferred: boolean;
}

export interface SearchResponse {
  parsed: ParsedQuery;
  meta: SearchResponseMeta;
  results: SearchResult[];
  observedCount: number;
  recommendedCount: number;
  notes: string[];
}
