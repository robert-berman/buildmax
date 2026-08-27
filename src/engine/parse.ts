// Deterministic natural-language query parser. Turns free text like
// "Master Yi crit build with Infinity Edge + Kraken Slayer" into a structured
// ParsedQuery { champion, role, requiredItems, archetype }. No LLM required --
// it is fast, offline, and explainable, and can be swapped for an LLM later
// behind the same ParsedQuery contract.

import { resolveChampionPhrase, resolveItemPhrase } from "@/data/ddragon";
import { tokenize } from "@/lib/text";
import type { Role } from "@/data/stats/types";
import type { Archetype, ParsedQuery } from "./types";

const ROLE_KEYWORDS: Record<string, Role> = {
  jungle: "JUNGLE", jgl: "JUNGLE", jg: "JUNGLE", jung: "JUNGLE", jngl: "JUNGLE",
  top: "TOP", toplane: "TOP",
  mid: "MIDDLE", middle: "MIDDLE", midlane: "MIDDLE",
  adc: "BOTTOM", bot: "BOTTOM", bottom: "BOTTOM", botlane: "BOTTOM", marksman: "BOTTOM",
  support: "SUPPORT", supp: "SUPPORT", sup: "SUPPORT",
};

const ARCHETYPE_KEYWORDS: { archetype: Exclude<Archetype, null>; words: string[] }[] = [
  { archetype: "crit", words: ["crit", "critical"] },
  { archetype: "onhit", words: ["onhit", "on hit"] }, // "on-hit" normalizes to "on hit"
  { archetype: "lethality", words: ["lethality", "lethal"] },
  { archetype: "attackspeed", words: ["attackspeed", "attack speed"] },
  { archetype: "ap_burst", words: ["ap", "burst"] },
  { archetype: "tank", words: ["tank", "tanky"] },
  { archetype: "bruiser", words: ["bruiser", "juggernaut"] },
];

const STOPWORDS = new Set([
  "build", "builds", "with", "and", "best", "top", "highest", "win", "winrate", "rate",
  "for", "the", "a", "an", "items", "item", "on", "good", "using", "use", "that", "include",
  "includes", "including", "path", "runes", "full", "strongest", "vs", "against", "meta",
]);

function range(start: number, len: number): number[] {
  return Array.from({ length: len }, (_, i) => start + i);
}

function detectRole(tokens: string[], consumed: boolean[]): Role | null {
  for (let i = 0; i < tokens.length; i++) {
    if (consumed[i]) continue;
    const role = ROLE_KEYWORDS[tokens[i]];
    if (role) {
      consumed[i] = true;
      return role;
    }
  }
  return null;
}

function detectChampion(
  tokens: string[],
  consumed: boolean[],
): { championId: string | null; championName: string | null; score: number } {
  let best: { id: string; name: string; score: number; start: number; len: number } | null = null;

  for (let len = Math.min(3, tokens.length); len >= 1; len--) {
    for (let i = 0; i + len <= tokens.length; i++) {
      const span = range(i, len);
      if (span.some((idx) => consumed[idx])) continue;
      const phrase = span.map((idx) => tokens[idx]).join(" ");
      if (span.every((idx) => STOPWORDS.has(tokens[idx]))) continue;
      const minScore = len === 1 ? 0.9 : 0.84;
      const res = resolveChampionPhrase(phrase, minScore);
      if (res && (!best || res.score > best.score || (res.score === best.score && len > best.len))) {
        best = { id: res.match.id, name: res.match.name, score: res.score, start: i, len };
      }
    }
    // A perfect (alias/exact) longer match wins; stop early once found.
    if (best && best.score >= 1) break;
  }

  if (!best) return { championId: null, championName: null, score: 0 };
  for (const idx of range(best.start, best.len)) consumed[idx] = true;
  return { championId: best.id, championName: best.name, score: best.score };
}

function detectItems(
  tokens: string[],
  consumed: boolean[],
): { ids: number[]; names: string[] } {
  const ids: number[] = [];
  const names: string[] = [];

  // Greedy multi-pass: consume the best item phrase each pass until none remain.
  for (;;) {
    let best: { id: number; name: string; score: number; start: number; len: number } | null = null;
    for (let len = Math.min(4, tokens.length); len >= 1; len--) {
      for (let i = 0; i + len <= tokens.length; i++) {
        const span = range(i, len);
        if (span.some((idx) => consumed[idx])) continue;
        if (span.every((idx) => STOPWORDS.has(tokens[idx]))) continue;
        const phrase = span.map((idx) => tokens[idx]).join(" ");
        const minScore = len === 1 ? 0.9 : 0.86;
        const res = resolveItemPhrase(phrase, minScore);
        if (res && (!best || res.score > best.score || (res.score === best.score && len > best.len))) {
          best = { id: res.match.id, name: res.match.name, score: res.score, start: i, len };
        }
      }
    }
    if (!best) break;
    for (const idx of range(best.start, best.len)) consumed[idx] = true;
    if (!ids.includes(best.id)) {
      ids.push(best.id);
      names.push(best.name);
    }
  }
  return { ids, names };
}

function detectArchetype(tokens: string[], consumed: boolean[]): Archetype {
  for (const { archetype, words } of ARCHETYPE_KEYWORDS) {
    for (const w of words) {
      const parts = w.split(" ");
      for (let i = 0; i + parts.length <= tokens.length; i++) {
        const span = range(i, parts.length);
        if (span.some((idx) => consumed[idx])) continue;
        if (parts.every((p, k) => tokens[i + k] === p)) {
          for (const idx of span) consumed[idx] = true;
          return archetype;
        }
      }
    }
  }
  return null;
}

export function parseQuery(raw: string): ParsedQuery {
  const tokens = tokenize(raw);
  const consumed = new Array<boolean>(tokens.length).fill(false);

  const role = detectRole(tokens, consumed);
  const champion = detectChampion(tokens, consumed);
  const items = detectItems(tokens, consumed);
  const archetype = detectArchetype(tokens, consumed);

  const unmatchedTokens = tokens.filter((t, i) => !consumed[i] && !STOPWORDS.has(t));

  // Confidence: champion match quality dominates, role + items add certainty.
  let confidence = 0;
  if (champion.championId) confidence += 0.55 * champion.score;
  if (role) confidence += 0.2;
  if (items.ids.length) confidence += 0.2;
  if (archetype) confidence += 0.05;
  confidence = Math.max(0, Math.min(1, confidence));

  return {
    raw,
    championId: champion.championId,
    championName: champion.championName,
    championScore: champion.score,
    role,
    requiredItemIds: items.ids,
    requiredItemNames: items.names,
    archetype,
    unmatchedTokens,
    confidence,
  };
}
