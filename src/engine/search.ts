// Search orchestrator: parse -> fetch candidate builds -> filter by required
// items/archetype -> score on BOTH axes (observed Wilson strength + synergy) ->
// rank -> return 5..10 results with provenance and highlighted requested items.

import { getItem, itemIconUrl, type ItemStatic } from "@/data/ddragon";
import { getStatsProvider } from "@/data/stats";
import type { BuildStat, Role } from "@/data/stats/types";
import { parseQuery } from "./parse";
import { explainBuild } from "./explain";
import { wilsonLowerBound, winRate } from "./rank";
import {
  getChampionProfile,
  itemEffects,
  recommendBuilds,
  scoreBuildSynergy,
  type ChampionProfile,
  type EffectTag,
} from "./synergy";
import type { Archetype, ParsedQuery, ResultItem, SearchResponse, SearchResult } from "./types";

const MAX_OBSERVED = 7;
const MAX_RESULTS = 10;

function toResultItem(id: number, requestedIds: number[], isBoots: boolean): ResultItem | null {
  const item = getItem(id);
  if (!item) return null;
  return {
    id,
    name: item.name,
    iconUrl: itemIconUrl(id),
    requested: requestedIds.includes(id),
    isBoots,
  };
}

function itemsFromIds(ids: number[]): ItemStatic[] {
  return ids.map(getItem).filter((x): x is ItemStatic => Boolean(x));
}

function buildMatchesArchetype(items: number[], boots: number | null, arch: Archetype): boolean {
  if (!arch) return true;
  const all = itemsFromIds([...items, ...(boots != null ? [boots] : [])]);
  const hasEffect = (e: EffectTag) => all.some((i) => itemEffects(i).has(e));
  const durabilityCount = all.filter((i) =>
    (["health", "armor", "mr"] as EffectTag[]).some((e) => itemEffects(i).has(e)),
  ).length;
  switch (arch) {
    case "crit":
      return hasEffect("crit") || hasEffect("critamp");
    case "onhit":
      return hasEffect("onhit");
    case "lethality":
      return hasEffect("armorpen");
    case "attackspeed":
      return all.some((i) => (i.stats.PercentAttackSpeedMod ?? 0) > 0);
    case "ap_burst":
      return hasEffect("ap");
    case "tank":
      return durabilityCount >= 2;
    case "bruiser":
      return hasEffect("ad") && durabilityCount >= 1;
    default:
      return true;
  }
}

function observedResult(build: BuildStat, parsed: ParsedQuery, profile: ChampionProfile): SearchResult {
  const path = build.items
    .map((id) => toResultItem(id, parsed.requiredItemIds, false))
    .filter((x): x is ResultItem => Boolean(x));
  const boots = build.boots != null ? toResultItem(build.boots, parsed.requiredItemIds, true) : null;
  const synergy = scoreBuildSynergy(build.items, profile);
  const explanation = explainBuild(build.champion, build.items, build.boots);
  const matched = parsed.requiredItemIds.filter((id) => build.items.includes(id) || build.boots === id);

  return {
    id: build.id,
    provenance: "observed",
    champion: build.champion,
    championName: profile.name,
    role: build.role,
    patch: build.patch,
    rank: build.rank,
    region: build.region,
    path,
    boots,
    games: build.games,
    wins: build.wins,
    winRate: winRate(build.wins, build.games),
    pickRate: build.pickRate,
    observedScore: wilsonLowerBound(build.wins, build.games),
    gameStage: build.gameStage,
    synergyScore: synergy.score,
    synergyReasons: explanation.topReasons,
    explanation,
    matchedRequiredItemIds: matched,
  };
}

function recommendedResult(
  rec: { items: number[]; boots: number | null; synergy: { score: number; reasons: string[] } },
  parsed: ParsedQuery,
  profile: ChampionProfile,
  role: Role,
  patch: string,
  idx: number,
): SearchResult {
  const path = rec.items
    .map((id) => toResultItem(id, parsed.requiredItemIds, false))
    .filter((x): x is ResultItem => Boolean(x));
  const boots = rec.boots != null ? toResultItem(rec.boots, parsed.requiredItemIds, true) : null;
  const explanation = explainBuild(parsed.championId as string, rec.items, rec.boots);
  const matched = parsed.requiredItemIds.filter((id) => rec.items.includes(id) || rec.boots === id);

  return {
    id: `rec-${idx}`,
    provenance: "recommended",
    champion: parsed.championId as string,
    championName: profile.name,
    role,
    patch,
    rank: "ALL",
    region: "world",
    path,
    boots,
    games: null,
    wins: null,
    winRate: null,
    pickRate: null,
    observedScore: null,
    gameStage: null,
    synergyScore: rec.synergy.score,
    synergyReasons: explanation.topReasons,
    explanation,
    matchedRequiredItemIds: matched,
  };
}

function mostCommonRole(builds: BuildStat[]): Role {
  const counts = new Map<Role, number>();
  for (const b of builds) counts.set(b.role, (counts.get(b.role) ?? 0) + b.games);
  let best: Role = builds[0]?.role ?? "MIDDLE";
  let bestN = -1;
  for (const [role, n] of counts) if (n > bestN) ((bestN = n), (best = role));
  return best;
}

export async function search(raw: string): Promise<SearchResponse> {
  const parsed = parseQuery(raw);
  const provider = await getStatsProvider();
  const meta = await provider.getMeta();
  const notes: string[] = [];

  if (!parsed.championId) {
    notes.push(
      'I could not identify a champion in that query. Try including a champion name, e.g. "Hecarim jungle Heartsteel".',
    );
    return {
      parsed,
      meta: { ...meta, championName: null, roleResolved: null, roleInferred: false },
      results: [],
      observedCount: 0,
      recommendedCount: 0,
      notes,
    };
  }

  const profile = getChampionProfile(parsed.championId);

  // Resolve role: explicit -> champion's most-played role -> from returned builds.
  let role = parsed.role;
  const roleInferred = !parsed.role;
  if (!role) {
    const aggs = await provider.getChampionRoleAggs(parsed.championId, meta.patch, meta.rank);
    if (aggs.length) role = [...aggs].sort((a, b) => b.games - a.games)[0].role;
  }

  const builds = await provider.getBuilds({
    champion: parsed.championId,
    role: role ?? undefined,
    patch: meta.patch,
    rank: meta.rank,
  });
  if (!role && builds.length) role = mostCommonRole(builds);
  const displayRole: Role = role ?? "MIDDLE";

  // Observed builds may resolve to an older patch than the current one (a fresh
  // patch often has too few games). Say so plainly rather than showing nothing.
  const observedPatch = builds[0]?.patch ?? null;
  if (observedPatch && observedPatch !== meta.patch) {
    notes.push(
      `Observed builds are from patch ${observedPatch}, the most recent with enough ${profile.name} games. Synergy picks reflect the current patch (${meta.patch}).`,
    );
  }

  // Observed: require all requested items to be present in the build.
  let observed = builds.filter((b) =>
    parsed.requiredItemIds.every((id) => b.items.includes(id) || b.boots === id),
  );

  // When no specific items were requested, an archetype narrows the field.
  if (parsed.archetype && parsed.requiredItemIds.length === 0) {
    const matches = observed.filter((b) => buildMatchesArchetype(b.items, b.boots, parsed.archetype));
    if (matches.length >= 3) observed = matches;
  }

  observed.sort((a, b) => {
    if (parsed.archetype && parsed.requiredItemIds.length > 0) {
      const am = buildMatchesArchetype(a.items, a.boots, parsed.archetype) ? 1 : 0;
      const bm = buildMatchesArchetype(b.items, b.boots, parsed.archetype) ? 1 : 0;
      if (am !== bm) return bm - am;
    }
    const sa = wilsonLowerBound(a.wins, a.games);
    const sb = wilsonLowerBound(b.wins, b.games);
    if (sb !== sa) return sb - sa;
    return b.games - a.games;
  });

  const observedResults = observed.slice(0, MAX_OBSERVED).map((b) => observedResult(b, parsed, profile));

  // Synergy recommendations (independent of win rate), de-duped vs observed sets.
  const observedSignatures = new Set(builds.map((b) => [...b.items].sort((x, y) => x - y).join(",")));
  const recommendedResults: SearchResult[] = [];
  const recs = recommendBuilds(parsed.championId, parsed.requiredItemIds, 2);
  recs.forEach((rec, idx) => {
    const sig = [...rec.items].sort((x, y) => x - y).join(",");
    if (observedSignatures.has(sig)) return;
    recommendedResults.push(recommendedResult(rec, parsed, profile, displayRole, meta.patch, idx));
  });

  if (parsed.requiredItemIds.length > 0 && observed.length === 0) {
    notes.push(
      `No observed builds for ${profile.name} ${displayRole.toLowerCase()} include ${parsed.requiredItemNames.join(
        " + ",
      )} in this dataset. Showing synergy-based recommendations that do.`,
    );
  }
  if (!builds.length) {
    notes.push(
      `No observed sample for ${profile.name} in the current dataset — showing synergy recommendations built from item/champion fit.`,
    );
  }

  const results = [...observedResults, ...recommendedResults].slice(0, MAX_RESULTS);

  return {
    parsed,
    meta: {
      provider: meta.provider,
      patch: meta.patch,
      rank: meta.rank,
      live: meta.live,
      sampleNote: meta.sampleNote,
      championName: profile.name,
      roleResolved: role ?? null,
      roleInferred,
    },
    results,
    observedCount: observedResults.length,
    recommendedCount: recommendedResults.length,
    notes,
  };
}
