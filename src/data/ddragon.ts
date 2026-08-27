// Typed access layer over the real static data synced from Riot's Data Dragon
// (see scripts/sync-ddragon.mjs). Everything here is patch-versioned game data:
// champions, items, their stats/tags, icon URLs, and fuzzy name resolution.

import itemsJsonRaw from "./generated/items.json";
import championsJsonRaw from "./generated/champions.json";
import versionJson from "./generated/version.json";
import { CHAMPION_ALIASES, ITEM_ALIASES } from "./aliases";
import { normalize, similarity } from "@/lib/text";

export interface ItemStatic {
  id: number;
  name: string;
  tags: string[];
  stats: Record<string, number>;
  goldTotal: number;
  from: number[];
  into: number[];
  depth: number;
  isBoots: boolean;
  isCompleted: boolean;
}

export interface ChampionStatic {
  id: string; // e.g. "Hecarim"
  key: string; // numeric id as string
  name: string; // e.g. "Hecarim"
  title: string;
  tags: string[]; // Fighter, Tank, Assassin, Marksman, Mage, Support
  partype: string; // Mana, Energy, Grit, ...
}

interface RawItem {
  id: string;
  name: string;
  tags: string[];
  stats: Record<string, number>;
  goldTotal: number;
  from: string[];
  into: string[];
  depth: number;
  isBoots: boolean;
  isCompleted: boolean;
}

const rawItems = itemsJsonRaw as unknown as Record<string, RawItem>;
const rawChampions = championsJsonRaw as unknown as Record<string, ChampionStatic>;

export const DDRAGON_VERSION: string = versionJson.version;
export const PATCH: string = versionJson.patch;
const CDN = `https://ddragon.leagueoflegends.com/cdn/${DDRAGON_VERSION}`;

// ---- Indexes -------------------------------------------------------------

const itemsById = new Map<number, ItemStatic>();
const itemByNormName = new Map<string, ItemStatic>();

for (const raw of Object.values(rawItems)) {
  const item: ItemStatic = {
    id: Number(raw.id),
    name: raw.name,
    tags: raw.tags ?? [],
    stats: raw.stats ?? {},
    goldTotal: raw.goldTotal ?? 0,
    from: (raw.from ?? []).map(Number),
    into: (raw.into ?? []).map(Number),
    depth: raw.depth ?? 1,
    isBoots: raw.isBoots ?? false,
    isCompleted: raw.isCompleted ?? false,
  };
  itemsById.set(item.id, item);
  itemByNormName.set(normalize(item.name), item);
}

const championsById = new Map<string, ChampionStatic>();
const championByNormName = new Map<string, ChampionStatic>();
for (const c of Object.values(rawChampions)) {
  championsById.set(c.id, c);
  championByNormName.set(normalize(c.name), c);
}

// ---- Accessors -----------------------------------------------------------

export function getItem(id: number): ItemStatic | undefined {
  return itemsById.get(id);
}

export function getItems(ids: readonly number[]): ItemStatic[] {
  return ids.map((id) => itemsById.get(id)).filter((x): x is ItemStatic => Boolean(x));
}

export function getChampion(id: string): ChampionStatic | undefined {
  return championsById.get(id);
}

export function allItems(): ItemStatic[] {
  return [...itemsById.values()];
}

export function allChampions(): ChampionStatic[] {
  return [...championsById.values()];
}

export function completedItems(): ItemStatic[] {
  return allItems().filter((i) => i.isCompleted);
}

export function bootItems(): ItemStatic[] {
  return allItems().filter((i) => i.isBoots);
}

// ---- Icon URLs -----------------------------------------------------------

export function itemIconUrl(id: number): string {
  return `${CDN}/img/item/${id}.png`;
}

export function championIconUrl(championId: string): string {
  return `${CDN}/img/champion/${championId}.png`;
}

// ---- Name resolution (for the NL parser) ---------------------------------

export interface ResolveResult<T> {
  match: T;
  score: number; // 1 = exact/alias, <1 = fuzzy
}

/** Resolve a phrase like "ie", "kraken", "sterak's gage" to an item. */
export function resolveItemPhrase(phrase: string, minScore = 0.86): ResolveResult<ItemStatic> | null {
  const norm = normalize(phrase);
  if (!norm) return null;

  const aliasId = ITEM_ALIASES[norm];
  if (aliasId !== undefined) {
    const item = itemsById.get(aliasId);
    if (item) return { match: item, score: 1 };
  }

  const exact = itemByNormName.get(norm);
  if (exact) return { match: exact, score: 1 };

  let best: ResolveResult<ItemStatic> | null = null;
  for (const item of itemsById.values()) {
    const score = similarity(norm, normalize(item.name));
    if (score >= minScore && (!best || score > best.score)) {
      best = { match: item, score };
    }
  }
  return best;
}

/** Resolve a phrase like "yi", "master yi", "hec" to a champion. */
export function resolveChampionPhrase(phrase: string, minScore = 0.86): ResolveResult<ChampionStatic> | null {
  const norm = normalize(phrase);
  if (!norm) return null;

  const aliasId = CHAMPION_ALIASES[norm];
  if (aliasId) {
    const champ = championsById.get(aliasId);
    if (champ) return { match: champ, score: 1 };
  }

  const exact = championByNormName.get(norm);
  if (exact) return { match: exact, score: 1 };

  let best: ResolveResult<ChampionStatic> | null = null;
  for (const champ of championsById.values()) {
    const score = similarity(norm, normalize(champ.name));
    if (score >= minScore && (!best || score > best.score)) {
      best = { match: champ, score };
    }
  }
  return best;
}

// ---- Display helpers -----------------------------------------------------

export interface ItemView {
  id: number;
  name: string;
  iconUrl: string;
  tags: string[];
  goldTotal: number;
  isBoots: boolean;
}

export function itemView(id: number): ItemView | null {
  const item = itemsById.get(id);
  if (!item) return null;
  return {
    id: item.id,
    name: item.name,
    iconUrl: itemIconUrl(item.id),
    tags: item.tags,
    goldTotal: item.goldTotal,
    isBoots: item.isBoots,
  };
}
