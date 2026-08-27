// Representative aggregated build data, authored in the exact shape a real
// match-v5 aggregation would produce. Numbers are plausible (win rates, sample
// sizes, build orders for the current meta) but are NOT live-ingested data --
// the UI labels them as representative. Swapping in the Postgres provider fed by
// the Riot ingestion pipeline replaces this file with real rows, nothing else.
//
// Item ids below are the real Data Dragon ids for patch 16.17 (verified against
// the synced items.json), so icons, names, tags and stats all resolve correctly.

import type { GameStage, Role } from "./types";

export interface SeedBuild {
  champion: string;
  role: Role;
  gameStage: GameStage;
  items: number[]; // completed core items in build order
  boots: number | null;
  games: number;
  winRate: number; // 0..1
}

// Item id shorthands for readability.
const TRINITY = 3078;
const HEARTSTEEL = 3084;
const STERAKS = 3053;
const BLACK_CLEAVER = 3071;
const DEADMANS = 3742;
const SUNDERED_SKY = 6610;
const SPIRIT_VISAGE = 3065;
const FORCE_OF_NATURE = 4401;
const THORNMAIL = 3075;
const JAKSHO = 6665;
const HULLBREAKER = 3181;
const TITANIC = 3748;
const RANDUINS = 3143;
const SUNFIRE = 3068;
const STRIDEBREAKER = 6631;
const ICEBORN = 6662;
const OVERLORD = 2501;

const IE = 3031;
const KRAKEN = 6672;
const YUN_TAL = 3032;
const PHANTOM_DANCER = 3046;
const BORK = 3153;
const GUINSOO = 3124;
const WITS_END = 3091;
const BLOODTHIRSTER = 3072;
const DEATHS_DANCE = 6333;
const TERMINUS = 3302;

// Boots
const PLATED = 3047;
const MERCS = 3111;
const BERSERKERS = 3006;

export const SEED_BUILDS: SeedBuild[] = [
  // ---------- Hecarim — Jungle ----------
  { champion: "Hecarim", role: "JUNGLE", gameStage: "MID", items: [TRINITY, BLACK_CLEAVER, STERAKS, SPIRIT_VISAGE], boots: PLATED, games: 32140, winRate: 0.516 },
  { champion: "Hecarim", role: "JUNGLE", gameStage: "MID", items: [TRINITY, BLACK_CLEAVER, DEADMANS], boots: PLATED, games: 15220, winRate: 0.508 },
  { champion: "Hecarim", role: "JUNGLE", gameStage: "LATE", items: [HEARTSTEEL, STERAKS, SPIRIT_VISAGE, FORCE_OF_NATURE], boots: MERCS, games: 4210, winRate: 0.538 },
  { champion: "Hecarim", role: "JUNGLE", gameStage: "MID", items: [SUNDERED_SKY, HEARTSTEEL, STERAKS], boots: PLATED, games: 1830, winRate: 0.529 },
  { champion: "Hecarim", role: "JUNGLE", gameStage: "MID", items: [TRINITY, HEARTSTEEL, STERAKS], boots: PLATED, games: 2640, winRate: 0.521 },
  { champion: "Hecarim", role: "JUNGLE", gameStage: "LATE", items: [HEARTSTEEL, DEADMANS, STERAKS, THORNMAIL], boots: MERCS, games: 1490, winRate: 0.511 },
  { champion: "Hecarim", role: "JUNGLE", gameStage: "LATE", items: [HEARTSTEEL, TITANIC, STERAKS], boots: PLATED, games: 880, winRate: 0.546 },
  { champion: "Hecarim", role: "JUNGLE", gameStage: "MID", items: [STRIDEBREAKER, BLACK_CLEAVER, STERAKS], boots: PLATED, games: 6010, winRate: 0.502 },
  { champion: "Hecarim", role: "JUNGLE", gameStage: "MID", items: [SUNDERED_SKY, BLACK_CLEAVER, STERAKS], boots: PLATED, games: 5020, winRate: 0.511 },
  { champion: "Hecarim", role: "JUNGLE", gameStage: "MID", items: [TRINITY, SUNDERED_SKY, STERAKS], boots: PLATED, games: 3020, winRate: 0.524 },
  { champion: "Hecarim", role: "JUNGLE", gameStage: "LATE", items: [JAKSHO, SPIRIT_VISAGE, FORCE_OF_NATURE], boots: MERCS, games: 2010, winRate: 0.495 },
  { champion: "Hecarim", role: "JUNGLE", gameStage: "LATE", items: [HEARTSTEEL, RANDUINS, SPIRIT_VISAGE, FORCE_OF_NATURE], boots: MERCS, games: 760, winRate: 0.534 },

  // ---------- Master Yi — Jungle ----------
  { champion: "MasterYi", role: "JUNGLE", gameStage: "MID", items: [KRAKEN, BORK, GUINSOO, WITS_END], boots: BERSERKERS, games: 14030, winRate: 0.512 },
  { champion: "MasterYi", role: "JUNGLE", gameStage: "LATE", items: [IE, PHANTOM_DANCER, YUN_TAL, BLOODTHIRSTER], boots: BERSERKERS, games: 9040, winRate: 0.504 },
  { champion: "MasterYi", role: "JUNGLE", gameStage: "MID", items: [KRAKEN, IE, BORK], boots: BERSERKERS, games: 3520, winRate: 0.518 },
  { champion: "MasterYi", role: "JUNGLE", gameStage: "LATE", items: [IE, KRAKEN, PHANTOM_DANCER], boots: BERSERKERS, games: 2210, winRate: 0.523 },
  { champion: "MasterYi", role: "JUNGLE", gameStage: "LATE", items: [IE, KRAKEN, YUN_TAL], boots: BERSERKERS, games: 1180, winRate: 0.531 },
  { champion: "MasterYi", role: "JUNGLE", gameStage: "MID", items: [KRAKEN, BORK, TERMINUS], boots: BERSERKERS, games: 4020, winRate: 0.509 },
  { champion: "MasterYi", role: "JUNGLE", gameStage: "LATE", items: [IE, YUN_TAL, PHANTOM_DANCER, DEATHS_DANCE], boots: BERSERKERS, games: 2610, winRate: 0.498 },
  { champion: "MasterYi", role: "JUNGLE", gameStage: "MID", items: [KRAKEN, GUINSOO, BORK, BLOODTHIRSTER], boots: BERSERKERS, games: 3010, winRate: 0.515 },

  // ---------- Warwick — Jungle ----------
  { champion: "Warwick", role: "JUNGLE", gameStage: "MID", items: [BORK, TRINITY, STERAKS], boots: MERCS, games: 12010, winRate: 0.515 },
  { champion: "Warwick", role: "JUNGLE", gameStage: "MID", items: [BORK, TITANIC, STERAKS], boots: PLATED, games: 6020, winRate: 0.510 },
  { champion: "Warwick", role: "JUNGLE", gameStage: "MID", items: [SUNDERED_SKY, BORK, SPIRIT_VISAGE], boots: MERCS, games: 4010, winRate: 0.506 },
  { champion: "Warwick", role: "JUNGLE", gameStage: "MID", items: [TRINITY, BLACK_CLEAVER, STERAKS], boots: PLATED, games: 5030, winRate: 0.502 },
  { champion: "Warwick", role: "JUNGLE", gameStage: "MID", items: [BORK, WITS_END, STERAKS], boots: MERCS, games: 2520, winRate: 0.518 },
  { champion: "Warwick", role: "JUNGLE", gameStage: "LATE", items: [TITANIC, TRINITY, FORCE_OF_NATURE], boots: PLATED, games: 1210, winRate: 0.522 },
  { champion: "Warwick", role: "JUNGLE", gameStage: "LATE", items: [JAKSHO, SPIRIT_VISAGE, FORCE_OF_NATURE], boots: MERCS, games: 1010, winRate: 0.494 },
  { champion: "Warwick", role: "JUNGLE", gameStage: "MID", items: [BORK, HEARTSTEEL, STERAKS], boots: MERCS, games: 940, winRate: 0.527 },

  // ---------- Darius — Top ----------
  { champion: "Darius", role: "TOP", gameStage: "MID", items: [TRINITY, STERAKS, BLACK_CLEAVER], boots: PLATED, games: 20110, winRate: 0.510 },
  { champion: "Darius", role: "TOP", gameStage: "MID", items: [STRIDEBREAKER, BLACK_CLEAVER, STERAKS], boots: PLATED, games: 9030, winRate: 0.505 },
  { champion: "Darius", role: "TOP", gameStage: "MID", items: [TRINITY, BLACK_CLEAVER, DEADMANS], boots: PLATED, games: 7020, winRate: 0.501 },
  { champion: "Darius", role: "TOP", gameStage: "MID", items: [SUNDERED_SKY, STERAKS, BLACK_CLEAVER], boots: PLATED, games: 5010, winRate: 0.513 },
  { champion: "Darius", role: "TOP", gameStage: "LATE", items: [TRINITY, STERAKS, SPIRIT_VISAGE, FORCE_OF_NATURE], boots: MERCS, games: 4020, winRate: 0.517 },
  { champion: "Darius", role: "TOP", gameStage: "MID", items: [STRIDEBREAKER, STERAKS, SPIRIT_VISAGE], boots: MERCS, games: 3010, winRate: 0.508 },
  { champion: "Darius", role: "TOP", gameStage: "LATE", items: [HEARTSTEEL, STERAKS, TRINITY], boots: PLATED, games: 1520, winRate: 0.520 },
  { champion: "Darius", role: "TOP", gameStage: "MID", items: [OVERLORD, STERAKS, BLACK_CLEAVER], boots: PLATED, games: 1010, winRate: 0.512 },

  // ---------- Jarvan IV — Jungle ----------
  { champion: "JarvanIV", role: "JUNGLE", gameStage: "MID", items: [TRINITY, BLACK_CLEAVER, STERAKS], boots: PLATED, games: 11020, winRate: 0.514 },
  { champion: "JarvanIV", role: "JUNGLE", gameStage: "MID", items: [TRINITY, STERAKS, DEADMANS], boots: PLATED, games: 4010, winRate: 0.509 },
  { champion: "JarvanIV", role: "JUNGLE", gameStage: "LATE", items: [ICEBORN, JAKSHO, SPIRIT_VISAGE], boots: MERCS, games: 3020, winRate: 0.507 },
  { champion: "JarvanIV", role: "JUNGLE", gameStage: "MID", items: [SUNDERED_SKY, BLACK_CLEAVER, STERAKS], boots: PLATED, games: 2510, winRate: 0.511 },
  { champion: "JarvanIV", role: "JUNGLE", gameStage: "LATE", items: [BLACK_CLEAVER, STERAKS, FORCE_OF_NATURE], boots: MERCS, games: 1510, winRate: 0.503 },
  { champion: "JarvanIV", role: "JUNGLE", gameStage: "LATE", items: [JAKSHO, SPIRIT_VISAGE, THORNMAIL], boots: MERCS, games: 1010, winRate: 0.496 },
];
