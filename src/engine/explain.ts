// The "why" generator: turns champion knowledge + item mechanics into layered,
// human-readable explanations for a build:
//   - item -> champion ability/stat ("Black Cleaver's AD feeds Rampage (Q)...")
//   - item -> item ("armor shred makes Trinity Force's damage hit harder")
//   - build identity summary
// Used for BOTH observed and recommended builds.

import {
  getChampionKnowledge,
  humanizeTag,
  itemProfileById,
  type ChampionKnowledge,
  type ItemEffect,
  type ItemProfile,
  type Want,
} from "./knowledge";
import type { BuildExplanation, ItemWhy } from "./types";

const cap = (s: string): string => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
const dedup = (arr: string[]): string[] => [...new Set(arr.filter(Boolean))];

function listPhrase(arr: string[]): string {
  if (arr.length <= 1) return arr[0] ?? "";
  return arr.slice(0, -1).join(", ") + " and " + arr[arr.length - 1];
}

/** The interesting passive angle: tie an item's special effect to the champion's kit. */
function effectChampionReason(
  effect: ItemEffect,
  item: ItemProfile,
  k: ChampionKnowledge,
  wantByTag: Map<string, Want>,
): string | null {
  const name = k.name;
  const m = item.mechanic ?? "";
  switch (effect) {
    case "healthScaling":
      return wantByTag.has("health") ? `${item.name} ${m} — ideal on ${name}, who stacks health anyway.` : null;
    case "bonusADConvert":
      return wantByTag.has("health") ? `${item.name} ${m}, turning ${name}'s bulk into extra damage.` : null;
    case "critAmp":
      return wantByTag.has("crit") ? `${item.name} ${m}, magnifying every crit ${name} lands.` : null;
    case "critToOnHit":
      return wantByTag.has("onHit") || wantByTag.has("crit") ? `${item.name} ${m}, which suits ${name}'s on-hit attacks.` : null;
    case "onHitTrue":
    case "percentHP":
      return wantByTag.has("onHit") || wantByTag.has("attackSpeed") ? `${item.name} ${m} — ${name} applies it on every attack.` : null;
    case "spellblade":
      return k.abilities.length > 0 || wantByTag.has("abilityHaste") ? `${item.name}'s Spellblade rewards ${name}'s frequent ability casts.` : null;
    case "healAmp":
      return wantByTag.has("sustain") ? `${item.name} ${m}, amplifying ${name}'s own healing.` : null;
    default:
      return null;
  }
}

function championReasons(item: ItemProfile, k: ChampionKnowledge, wantByTag: Map<string, Want>): string[] {
  const out: string[] = [];

  for (const eff of item.effects) {
    const r = effectChampionReason(eff, item, k, wantByTag);
    if (r) {
      out.push(r);
      break; // at most one effect-based reason
    }
  }

  const statMatches = item.provides
    .map((t) => wantByTag.get(t))
    .filter((w): w is Want => Boolean(w))
    .sort((a, b) => b.weight - a.weight);
  for (const w of statMatches) {
    if (out.length >= 2) break;
    const line = `${item.name}'s ${humanizeTag(w.tag)} ${w.why}.`;
    if (!out.includes(line)) out.push(line);
  }

  if (out.length === 0 && item.mechanic) out.push(`${cap(item.name)} ${item.mechanic}.`);
  return out.slice(0, 2);
}

const provides = (p: ItemProfile, t: string) => p.provides.includes(t as never);
const hasEffect = (p: ItemProfile, e: ItemEffect) => p.effects.includes(e);

/** Directional item -> item interaction (a's effect acting on b). */
function pairReason(a: ItemProfile, b: ItemProfile): string | null {
  if (a.id === b.id) return null;
  if (hasEffect(a, "healthScaling") && provides(b, "health"))
    return `the health from ${b.name} increases ${a.name}'s health-based damage.`;
  if (hasEffect(a, "critAmp") && provides(b, "crit"))
    return `${a.name} amplifies the critical strikes from ${b.name}.`;
  if ((hasEffect(a, "onHitTrue") || provides(a, "onHit")) && provides(b, "attackSpeed"))
    return `attack speed from ${b.name} makes ${a.name}'s on-hit trigger more often.`;
  if (hasEffect(a, "armorShred") && (provides(b, "bonusAD") || provides(b, "onHit") || provides(b, "attackSpeed")))
    return `${a.name} shreds armor so ${b.name}'s physical damage hits harder.`;
  if (hasEffect(a, "healAmp") && (provides(b, "lifesteal") || provides(b, "sustain") || hasEffect(b, "shield") || hasEffect(b, "healthScaling")))
    return `${a.name} boosts the healing and shielding from ${b.name}.`;
  if (hasEffect(a, "spellblade") && provides(b, "abilityHaste"))
    return `ability haste from ${b.name} means more ${a.name} Spellblade procs.`;
  return null;
}

function bestWantWeight(p: ItemProfile, wantByTag: Map<string, Want>): number {
  let best = p.effects.length ? 0.3 : 0; // a curated passive is at least mildly notable
  for (const t of p.provides) {
    const w = wantByTag.get(t);
    if (w && w.weight > best) best = w.weight;
  }
  return best;
}

export function explainBuild(championId: string, coreItemIds: number[], bootsId?: number | null): BuildExplanation {
  const k = getChampionKnowledge(championId);
  const wantByTag = new Map<string, Want>(k.wants.map((w) => [w.tag, w]));
  const profs = coreItemIds
    .map((id) => itemProfileById(id))
    .filter((p): p is ItemProfile => Boolean(p));

  const pairFor = (p: ItemProfile): string | null => {
    for (const q of profs) {
      const r = pairReason(p, q);
      if (r) return r;
    }
    return null;
  };

  const perItem: ItemWhy[] = profs.map((p) => {
    const champ = championReasons(p, k, wantByTag);
    const pair = pairFor(p);
    const reasons = dedup([champ[0], pair, champ[1]].filter((x): x is string => Boolean(x))).slice(0, 3);
    return { itemId: p.id, name: p.name, reasons };
  });

  // Build-identity summary from coverage of the champion's wants.
  const provided = new Set<string>();
  for (const p of profs) for (const t of p.provides) provided.add(t);
  const covered = k.wants
    .filter((w) => provided.has(w.tag))
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 3)
    .map((w) => humanizeTag(w.tag));
  const summary = covered.length
    ? `${cap(k.identity)} build for ${k.name}: it covers ${listPhrase(covered)}. ${cap(k.notes)}.`
    : `${cap(k.identity)} build for ${k.name}. ${cap(k.notes)}.`;

  // All distinct item <-> item interactions, for the build-level list.
  const allPairs: string[] = [];
  for (let i = 0; i < profs.length; i++) {
    for (let j = 0; j < profs.length; j++) {
      if (i === j) continue;
      const r = pairReason(profs[i], profs[j]);
      if (r && !allPairs.includes(r)) allPairs.push(r);
    }
  }

  // Top reasons: best champion reason from the most relevant items, then a pair.
  const byImportance = [...profs].sort((a, b) => bestWantWeight(b, wantByTag) - bestWantWeight(a, wantByTag));
  const top: string[] = [];
  for (const p of byImportance) {
    const cr = championReasons(p, k, wantByTag)[0];
    if (cr && !top.includes(cr)) top.push(cr);
    if (top.length >= 3) break;
  }
  for (const pr of allPairs) {
    if (top.length >= 4) break;
    if (!top.includes(pr)) top.push(pr);
  }

  return {
    summary,
    topReasons: dedup(top).slice(0, 4).map(cap),
    perItem: perItem.map((w) => ({ ...w, reasons: w.reasons.map(cap) })),
  };
}
