// Drizzle schema. The build_stats table is the analytical core: item arrays with
// a GIN index so "builds that contain item X" is an indexed containment query
// (items @> ARRAY[x]), and a btree index on the champion/role/patch/rank lookup.

import { boolean, doublePrecision, index, integer, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const champions = pgTable("champions", {
  id: text("id").primaryKey(), // e.g. "Hecarim"
  key: text("key").notNull(),
  name: text("name").notNull(),
  title: text("title").notNull(),
  tags: jsonb("tags").$type<string[]>().notNull(),
  partype: text("partype").notNull(),
});

export const items = pgTable("items", {
  id: integer("id").primaryKey(),
  name: text("name").notNull(),
  tags: jsonb("tags").$type<string[]>().notNull(),
  stats: jsonb("stats").$type<Record<string, number>>().notNull(),
  goldTotal: integer("gold_total").notNull(),
  isBoots: boolean("is_boots").notNull(),
  isCompleted: boolean("is_completed").notNull(),
});

export const buildStats = pgTable(
  "build_stats",
  {
    id: text("id").primaryKey(),
    champion: text("champion").notNull(),
    role: text("role").notNull(),
    patch: text("patch").notNull(),
    rank: text("rank").notNull(),
    region: text("region").notNull().default("world"),
    items: integer("items").array().notNull(), // core items, build order preserved
    boots: integer("boots"),
    games: integer("games").notNull(),
    wins: integer("wins").notNull(),
    pickRate: doublePrecision("pick_rate").notNull(),
    gameStage: text("game_stage").notNull(),
  },
  (t) => [
    index("build_champ_role_idx").on(t.champion, t.role, t.patch, t.rank),
    index("build_items_gin").using("gin", t.items),
  ],
);

export const championRoleAgg = pgTable(
  "champion_role_agg",
  {
    id: text("id").primaryKey(), // `${champion}|${role}|${patch}|${rank}`
    champion: text("champion").notNull(),
    role: text("role").notNull(),
    patch: text("patch").notNull(),
    rank: text("rank").notNull(),
    games: integer("games").notNull(),
    wins: integer("wins").notNull(),
    pickRate: doublePrecision("pick_rate").notNull(),
    banRate: doublePrecision("ban_rate"),
  },
  (t) => [index("agg_champ_idx").on(t.champion, t.patch, t.rank)],
);

export const itemPairStats = pgTable(
  "item_pair_stats",
  {
    id: text("id").primaryKey(),
    champion: text("champion").notNull(),
    role: text("role").notNull(),
    patch: text("patch").notNull(),
    rank: text("rank").notNull(),
    itemA: integer("item_a").notNull(),
    itemB: integer("item_b").notNull(),
    games: integer("games").notNull(),
    wins: integer("wins").notNull(),
  },
  (t) => [index("pair_champ_role_idx").on(t.champion, t.role, t.patch, t.rank)],
);

// Raw per-participant extracts from ingested matches. This is the durable source
// layer: aggregates (build_stats etc.) are recomputed from here, so we can
// re-tune grouping/thresholds WITHOUT re-crawling the API. Stores the full core
// item set; the aggregator decides how to bucket it.
export const rawParticipants = pgTable(
  "raw_participants",
  {
    id: text("id").primaryKey(), // `${matchId}:${participantIndex}`
    matchId: text("match_id").notNull(),
    patch: text("patch").notNull(),
    champion: text("champion").notNull(),
    role: text("role").notNull(),
    win: boolean("win").notNull(),
    items: integer("items").array().notNull(),
    boots: integer("boots"),
  },
  (t) => [index("raw_patch_idx").on(t.patch), index("raw_match_idx").on(t.matchId)],
);

// Dedupe ledger: match ids we've already pulled, so repeat/incremental runs never
// re-spend the API rate budget on the same matches.
export const processedMatches = pgTable("processed_matches", {
  matchId: text("match_id").primaryKey(),
  patch: text("patch").notNull(),
  ingestedAt: timestamp("ingested_at").defaultNow().notNull(),
});
