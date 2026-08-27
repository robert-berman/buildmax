// Synergy engine: recommends items based on champion kit + item interactions,
// INDEPENDENTLY of win rate. This is the "we think these work well together"
// axis. Every score comes with human-readable reasons so the UI can explain WHY.
//
// Inputs are grounded in real Data Dragon stats/tags, augmented by a small
// curated knowledge base of item passives that Data Dragon does not expose
// cleanly (e.g. "Heartsteel damage scales with max health").

import { completedItems, getChampion, getItem, type ItemStatic } from "@/data/ddragon";

export type StatKey =
  | "health" | "ad" | "ap" | "attackspeed" | "crit" | "armor" | "mr" | "lifesteal" | "movespeed" | "abilityhaste";

export type EffectTag =
  | "health" | "armor" | "mr" | "ad" | "ap" | "attackspeed" | "crit" | "lifesteal"
  | "movespeed" | "abilityhaste" | "armorpen" | "magicpen" | "onhit" | "tenacity"
  | "sustain" | "shield" | "healthscaling" | "bonusad" | "critamp" | "crittoonhit"
  | "healamp" | "spellblade" | "anticrit" | "antiheal";

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

// ---- Item stat magnitudes (normalized 0..1 vs a per-stat reference max) -----

// abilityhaste has no Data Dragon stat field, so it never contributes a stat
// magnitude; it is kept in the union so champion profiles can express the
// preference (which also surfaces via the "abilityhaste" effect tag).
const STAT_REFERENCE_MAX: Record<StatKey, number> = {
  health: 1000, ad: 80, ap: 120, attackspeed: 0.5, crit: 0.25, armor: 80, mr: 80, lifesteal: 0.2, movespeed: 60, abilityhaste: 30,
};

function statMagnitudes(item: ItemStatic): Partial<Record<StatKey, number>> {
  const s = item.stats;
  const out: Partial<Record<StatKey, number>> = {};
  const add = (k: StatKey, v: number | undefined) => {
    if (v) out[k] = Math.min(1, (out[k] ?? 0) + v / STAT_REFERENCE_MAX[k]);
  };
  add("health", s.FlatHPPoolMod);
  add("ad", s.FlatPhysicalDamageMod);
  add("ap", s.FlatMagicDamageMod);
  add("attackspeed", s.PercentAttackSpeedMod);
  add("crit", s.FlatCritChanceMod);
  add("armor", s.FlatArmorMod);
  add("mr", s.FlatSpellBlockMod);
  add("lifesteal", s.PercentLifeStealMod);
  add("movespeed", s.FlatMovementSpeedMod);
  if (s.PercentMovementSpeedMod) {
    out.movespeed = Math.min(1, (out.movespeed ?? 0) + s.PercentMovementSpeedMod / 0.06);
  }
  return out;
}

// ---- Item effects (Data Dragon tags + curated passive knowledge) ------------

const TAG_TO_EFFECT: Record<string, EffectTag> = {
  Health: "health", Armor: "armor", SpellBlock: "mr", Damage: "ad", SpellDamage: "ap",
  AttackSpeed: "attackspeed", CriticalStrike: "crit", LifeSteal: "lifesteal", OnHit: "onhit",
  CooldownReduction: "abilityhaste", AbilityHaste: "abilityhaste", ArmorPenetration: "armorpen",
  MagicPenetration: "magicpen", Tenacity: "tenacity", SpellVamp: "sustain", HealthRegen: "sustain",
};

// Curated passive effects Data Dragon does not tag cleanly. Keyed by item id.
const ITEM_EFFECT_OVERRIDES: Record<number, EffectTag[]> = {
  3084: ["healthscaling"], // Heartsteel — damage scales with max health
  3053: ["healthscaling", "bonusad", "shield"], // Sterak's Gage — HP-scaling shield + bonus AD
  3031: ["critamp"], // Infinity Edge — amplifies crit damage
  3124: ["crittoonhit", "onhit"], // Guinsoo's Rageblade
  3078: ["spellblade", "bonusad"], // Trinity Force
  3748: ["healthscaling", "onhit"], // Titanic Hydra
  3083: ["sustain"], // Warmog's Armor
  6610: ["spellblade", "healamp"], // Sundered Sky
  4633: ["healthscaling", "sustain"], // Riftmaker
  3065: ["healamp"], // Spirit Visage
  3075: ["antiheal"], // Thornmail
  3143: ["anticrit"], // Randuin's Omen
  3153: ["onhit"], // Blade of The Ruined King — %current-HP on-hit
  3072: ["shield"], // Bloodthirster
  3302: ["armorpen", "magicpen", "onhit"], // Terminus
  6662: ["spellblade"], // Iceborn Gauntlet
  2501: ["healthscaling", "bonusad"], // Overlord's Bloodmail — AD scales with bonus HP
  6631: ["bonusad"], // Stridebreaker
};

const effectCache = new Map<number, Set<EffectTag>>();

export function itemEffects(item: ItemStatic): Set<EffectTag> {
  const cached = effectCache.get(item.id);
  if (cached) return cached;
  const set = new Set<EffectTag>();
  for (const t of item.tags) {
    const e = TAG_TO_EFFECT[t];
    if (e) set.add(e);
  }
  for (const e of ITEM_EFFECT_OVERRIDES[item.id] ?? []) set.add(e);
  effectCache.set(item.id, set);
  return set;
}

const has = (item: ItemStatic, e: EffectTag) => itemEffects(item).has(e);
const isDamageItem = (i: ItemStatic) =>
  ["ad", "ap", "attackspeed", "crit", "onhit"].some((e) => has(i, e as EffectTag));
const isDurabilityItem = (i: ItemStatic) => ["health", "armor", "mr"].some((e) => has(i, e as EffectTag));
const isPureDefense = (i: ItemStatic) => isDurabilityItem(i) && !isDamageItem(i);

type DamageType = "physical" | "magic" | "mixed";

/** Physical vs magic classification of an item's offensive stats. */
function itemDamageType(item: ItemStatic): "physical" | "magic" | "neutral" {
  const e = itemEffects(item);
  const ap = e.has("ap");
  const phys = e.has("ad") || e.has("crit");
  if (ap && !phys) return "magic";
  if (phys && !ap) return "physical";
  return "neutral";
}

function resolveDamageType(tags: string[]): DamageType {
  const t = new Set(tags);
  if (t.has("Mage")) return "magic";
  if (t.has("Marksman") || t.has("Assassin") || t.has("Fighter")) return "physical";
  if (t.has("Tank") || t.has("Support")) return "mixed";
  return "physical";
}

/** True when an item's damage type is the opposite of what the champion uses. */
function isOffType(item: ItemStatic, dmg: DamageType): boolean {
  if (dmg === "mixed") return false;
  const dt = itemDamageType(item);
  return dt !== "neutral" && dt !== dmg;
}

// ---- Champion profiles ------------------------------------------------------

export interface ChampionProfile {
  championId: string;
  name: string;
  identity: "carry" | "bruiser" | "tank" | "burst";
  statWeights: Partial<Record<StatKey, number>>;
  desiredEffects: Partial<Record<EffectTag, number>>;
  wantsCrit: boolean;
  wantsAttackSpeed: boolean;
  notes: string;
  damageType: "physical" | "magic" | "mixed";
}

type ProfileSpec = Omit<ChampionProfile, "championId" | "name" | "damageType">;

const CURATED_PROFILES: Record<string, ProfileSpec> = {
  Hecarim: {
    identity: "bruiser",
    statWeights: { health: 0.9, ad: 0.6, armor: 0.5, mr: 0.5, abilityhaste: 0.5, movespeed: 0.7, attackspeed: 0.15 },
    desiredEffects: { healthscaling: 0.8, bonusad: 0.6, spellblade: 0.6, healamp: 0.4, armorpen: 0.4, movespeed: 0.5, health: 0.5 },
    wantsCrit: false,
    wantsAttackSpeed: false,
    notes: "diving bruiser whose Q scales with bonus AD and who gains damage from movement speed, so it wants durability, health scaling and sustained fighting",
  },
  MasterYi: {
    identity: "carry",
    statWeights: { attackspeed: 0.9, ad: 0.8, crit: 0.7, lifesteal: 0.5, armor: 0.2, health: 0.3 },
    desiredEffects: { onhit: 0.9, attackspeed: 0.9, crit: 0.7, critamp: 0.6, lifesteal: 0.5, armorpen: 0.5 },
    wantsCrit: true,
    wantsAttackSpeed: true,
    notes: "auto-attack carry with Alpha Strike and on-hit scaling that wants attack speed, crit or on-hit damage, and lifesteal to sustain in fights",
  },
  Warwick: {
    identity: "bruiser",
    statWeights: { attackspeed: 0.7, ad: 0.5, health: 0.7, armor: 0.4, mr: 0.4, lifesteal: 0.5, abilityhaste: 0.3 },
    desiredEffects: { onhit: 0.8, attackspeed: 0.7, healthscaling: 0.4, healamp: 0.6, lifesteal: 0.5, bonusad: 0.3 },
    wantsCrit: false,
    wantsAttackSpeed: true,
    notes: "on-hit bruiser whose Q heals and scales with the target's max health, so it loves attack speed plus healing amplification",
  },
  Darius: {
    identity: "bruiser",
    statWeights: { ad: 0.8, health: 0.8, armor: 0.5, mr: 0.4, abilityhaste: 0.5, attackspeed: 0.25 },
    desiredEffects: { bonusad: 0.7, healthscaling: 0.5, armorpen: 0.6, spellblade: 0.3, healamp: 0.3 },
    wantsCrit: false,
    wantsAttackSpeed: false,
    notes: "AD bruiser with a bleed-and-execute kit that wants bonus AD, durability and armor penetration",
  },
  JarvanIV: {
    identity: "bruiser",
    statWeights: { ad: 0.6, health: 0.8, armor: 0.6, mr: 0.5, abilityhaste: 0.6, attackspeed: 0.25 },
    desiredEffects: { bonusad: 0.5, spellblade: 0.4, armorpen: 0.5, healthscaling: 0.4, health: 0.5 },
    wantsCrit: false,
    wantsAttackSpeed: false,
    notes: "engage bruiser built around his EQ combo that wants durability, ability haste and enough AD to threaten",
  },
};

function deriveProfileFromTags(tags: string[]): ProfileSpec {
  const t = new Set(tags);
  if (t.has("Marksman")) {
    return {
      identity: "carry",
      statWeights: { attackspeed: 0.8, ad: 0.8, crit: 0.8, lifesteal: 0.4, armor: 0.15 },
      desiredEffects: { crit: 0.8, critamp: 0.7, attackspeed: 0.7, onhit: 0.5, lifesteal: 0.4 },
      wantsCrit: true,
      wantsAttackSpeed: true,
      notes: "ranged carry that scales with attack damage, attack speed and critical strike",
    };
  }
  if (t.has("Mage")) {
    return {
      identity: "burst",
      statWeights: { ap: 0.9, abilityhaste: 0.6, health: 0.3, mr: 0.2 },
      desiredEffects: { ap: 0.9, abilityhaste: 0.6, magicpen: 0.7, healthscaling: 0.2 },
      wantsCrit: false,
      wantsAttackSpeed: false,
      notes: "ability-based caster that scales with ability power, magic penetration and ability haste",
    };
  }
  if (t.has("Assassin")) {
    return {
      identity: "burst",
      statWeights: { ad: 0.85, abilityhaste: 0.5, attackspeed: 0.3, health: 0.3 },
      desiredEffects: { ad: 0.8, armorpen: 0.8, bonusad: 0.5, abilityhaste: 0.4 },
      wantsCrit: false,
      wantsAttackSpeed: false,
      notes: "burst assassin that wants lethality/armor penetration and ability haste to delete priority targets",
    };
  }
  if (t.has("Tank")) {
    return {
      identity: "tank",
      statWeights: { health: 0.9, armor: 0.7, mr: 0.7, abilityhaste: 0.4 },
      desiredEffects: { health: 0.8, healthscaling: 0.5, healamp: 0.4, anticrit: 0.3, antiheal: 0.3 },
      wantsCrit: false,
      wantsAttackSpeed: false,
      notes: "frontline tank that wants health, resistances and utility to survive and peel",
    };
  }
  if (t.has("Support")) {
    return {
      identity: "tank",
      statWeights: { health: 0.6, armor: 0.5, mr: 0.5, abilityhaste: 0.7 },
      desiredEffects: { abilityhaste: 0.7, health: 0.5, healamp: 0.5 },
      wantsCrit: false,
      wantsAttackSpeed: false,
      notes: "support that wants ability haste and utility to enable its team",
    };
  }
  // Fighter / default
  return {
    identity: "bruiser",
    statWeights: { ad: 0.7, health: 0.7, armor: 0.45, mr: 0.4, abilityhaste: 0.45, attackspeed: 0.3 },
    desiredEffects: { bonusad: 0.5, healthscaling: 0.4, armorpen: 0.4, onhit: 0.3, health: 0.4 },
    wantsCrit: false,
    wantsAttackSpeed: false,
    notes: "bruiser that wants a mix of damage and durability for extended fights",
  };
}

export function getChampionProfile(championId: string): ChampionProfile {
  const champ = getChampion(championId);
  const tags = champ?.tags ?? [];
  const spec = CURATED_PROFILES[championId] ?? deriveProfileFromTags(tags);
  return { championId, name: champ?.name ?? championId, damageType: resolveDamageType(tags), ...spec };
}

// ---- Single-item fit --------------------------------------------------------

export function itemFit(item: ItemStatic, profile: ChampionProfile): number {
  const mags = statMagnitudes(item);
  let statScore = 0;
  let wSum = 0;
  for (const key of Object.keys(mags) as StatKey[]) {
    const w = profile.statWeights[key] ?? 0.05;
    statScore += w * (mags[key] ?? 0);
    wSum += w;
  }
  const statComp = wSum > 0 ? statScore / wSum : 0;

  let effScore = 0;
  for (const e of itemEffects(item)) effScore += profile.desiredEffects[e] ?? 0;
  const effComp = Math.min(1, effScore / 1.5);

  return clamp01(0.55 * statComp + 0.45 * effComp);
}

// ---- Pairwise synergy -------------------------------------------------------

interface PairHit {
  score: number;
  reason: string;
}

function pairSynergy(a: ItemStatic, b: ItemStatic): PairHit | null {
  const ea = itemEffects(a);
  const eb = itemEffects(b);
  const asA = (statMagnitudes(a).attackspeed ?? 0) > 0;
  const asB = (statMagnitudes(b).attackspeed ?? 0) > 0;

  // Returns [source, target] in the direction that matches (e1 on src, e2 on tgt).
  const dir = (e1: EffectTag, e2: EffectTag): [ItemStatic, ItemStatic] | null => {
    if (ea.has(e1) && eb.has(e2)) return [a, b];
    if (eb.has(e1) && ea.has(e2)) return [b, a];
    return null;
  };

  let best: PairHit | null = null;
  const consider = (hit: PairHit | null) => {
    if (hit && (!best || hit.score > best.score)) best = hit;
  };

  const critAmp = dir("critamp", "crit");
  if (critAmp) consider({ score: 0.9, reason: `${critAmp[0].name} amplifies the critical strikes from ${critAmp[1].name}.` });

  const hpScale = dir("healthscaling", "health");
  if (hpScale && hpScale[0].id !== hpScale[1].id) {
    consider({ score: 0.72, reason: `The bonus health from ${hpScale[1].name} increases ${hpScale[0].name}'s health-based damage and shielding.` });
  }

  if (ea.has("onhit") && asB) consider({ score: 0.62, reason: `Attack speed from ${b.name} makes ${a.name}'s on-hit effect trigger more often.` });
  if (eb.has("onhit") && asA) consider({ score: 0.62, reason: `Attack speed from ${a.name} makes ${b.name}'s on-hit effect trigger more often.` });

  if (ea.has("onhit") && eb.has("onhit")) consider({ score: 0.5, reason: `${a.name} and ${b.name} stack multiple on-hit effects for heavy sustained damage.` });

  const healAmp = dir("healamp", "lifesteal") ?? dir("healamp", "sustain") ?? dir("healamp", "shield") ?? dir("healamp", "healthscaling");
  if (healAmp) consider({ score: 0.6, reason: `${healAmp[0].name} boosts the healing and shielding from ${healAmp[1].name}.` });

  const adStack = dir("bonusad", "ad");
  if (adStack && adStack[0].id !== adStack[1].id) consider({ score: 0.42, reason: `${adStack[0].name} adds bonus AD that ${adStack[1].name} builds on top of.` });

  const bPhys = (statMagnitudes(b).ad ?? 0) > 0 || eb.has("onhit") || asB;
  const aPhys = (statMagnitudes(a).ad ?? 0) > 0 || ea.has("onhit") || asA;
  if (ea.has("armorpen") && bPhys) consider({ score: 0.45, reason: `Armor penetration from ${a.name} makes ${b.name}'s physical damage hit harder.` });
  if (eb.has("armorpen") && aPhys) consider({ score: 0.45, reason: `Armor penetration from ${b.name} makes ${a.name}'s physical damage hit harder.` });

  const spellblade = dir("spellblade", "abilityhaste");
  if (spellblade) consider({ score: 0.35, reason: `Ability haste lets ${spellblade[0].name}'s Spellblade proc fire more frequently.` });

  return best;
}

// ---- Whole-build synergy ----------------------------------------------------

export interface SynergyBreakdown {
  score: number; // 0..1
  reasons: string[];
  components: { fit: number; pair: number; coverage: number; penalty: number };
}

function coverageScore(items: ItemStatic[], profile: ChampionProfile): number {
  const n = items.length || 1;
  const dmg = items.filter(isDamageItem).length;
  const def = items.filter(isDurabilityItem).length;
  if (profile.identity === "carry" || profile.identity === "burst") {
    const enough = dmg >= Math.min(3, n);
    return clamp01((dmg / n) * (enough ? 1 : 0.7));
  }
  if (profile.identity === "tank") return clamp01(def / n);
  const balance = 1 - Math.abs(dmg - def) / n;
  return clamp01(0.5 + 0.5 * balance);
}

function antiSynergyPenalty(items: ItemStatic[], profile: ChampionProfile): number {
  let p = 0;
  const critItems = items.filter((i) => has(i, "crit")).length;
  if (!profile.wantsCrit && critItems > 0) p += 0.12 * critItems;
  const asItems = items.filter((i) => (statMagnitudes(i).attackspeed ?? 0) > 0).length;
  if (!profile.wantsAttackSpeed && asItems > 1) p += 0.06 * (asItems - 1);
  if (profile.identity === "carry" || profile.identity === "burst") {
    const def = items.filter(isPureDefense).length;
    if (def > 1) p += 0.1 * (def - 1);
  }
  const offType = items.filter((i) => isOffType(i, profile.damageType)).length;
  p += 0.25 * offType;
  return Math.min(0.6, p);
}

export function scoreBuildSynergy(itemIds: number[], profile: ChampionProfile): SynergyBreakdown {
  const items = itemIds.map(getItem).filter((x): x is ItemStatic => Boolean(x));
  if (!items.length) return { score: 0, reasons: [], components: { fit: 0, pair: 0, coverage: 0, penalty: 0 } };

  const fit = mean(items.map((i) => itemFit(i, profile)));

  const hits: PairHit[] = [];
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      const hit = pairSynergy(items[i], items[j]);
      if (hit) hits.push(hit);
    }
  }
  const pairTotal = hits.reduce((s, h) => s + h.score, 0);
  const pair = clamp01(pairTotal / Math.max(2, items.length));
  const coverage = coverageScore(items, profile);
  const penalty = antiSynergyPenalty(items, profile);
  const score = clamp01(0.4 * fit + 0.4 * pair + 0.2 * coverage - penalty);

  const seen = new Set<string>();
  const reasons: string[] = [];
  for (const h of hits.sort((x, y) => y.score - x.score)) {
    if (seen.has(h.reason)) continue;
    seen.add(h.reason);
    reasons.push(h.reason);
    if (reasons.length >= 3) break;
  }
  if (reasons.length === 0) {
    reasons.push(`A coherent ${profile.identity} setup for ${profile.name}: ${profile.notes}.`);
  }

  return { score, reasons, components: { fit, pair, coverage, penalty } };
}

// ---- Build recommendation ---------------------------------------------------

const BOOTS_BERSERKERS = 3006;
const BOOTS_PLATED = 3047;
const BOOTS_MERCS = 3111;

function pickBoots(profile: ChampionProfile): number {
  if (profile.wantsAttackSpeed) return BOOTS_BERSERKERS;
  return profile.identity === "tank" ? BOOTS_MERCS : BOOTS_PLATED;
}

export interface RecommendedBuild {
  items: number[];
  boots: number | null;
  synergy: SynergyBreakdown;
}

/**
 * Greedily assemble a synergy-optimal build around the required items. This is a
 * recommendation, not observed data — it may differ from what wins most in games.
 */
export function recommendBuild(
  championId: string,
  requiredIds: number[],
  targetCore = 5,
  exclude: Set<number> = new Set(),
): RecommendedBuild {
  const profile = getChampionProfile(championId);

  const requiredCore: number[] = [];
  let requiredBoots: number | null = null;
  for (const id of requiredIds) {
    const item = getItem(id);
    if (!item) continue;
    if (item.isBoots) requiredBoots = id;
    else if (!requiredCore.includes(id)) requiredCore.push(id);
  }

  const chosen = [...requiredCore];
  const pool = completedItems().filter(
    (i) => !chosen.includes(i.id) && !exclude.has(i.id) && !isOffType(i, profile.damageType),
  );

  while (chosen.length < targetCore) {
    let bestId = -1;
    let bestScore = -Infinity;
    for (const item of pool) {
      if (chosen.includes(item.id)) continue;
      const marginal = scoreBuildSynergy([...chosen, item.id], profile).score + 0.15 * itemFit(item, profile);
      if (marginal > bestScore) {
        bestScore = marginal;
        bestId = item.id;
      }
    }
    if (bestId < 0) break;
    chosen.push(bestId);
  }

  return {
    items: chosen,
    boots: requiredBoots ?? pickBoots(profile),
    synergy: scoreBuildSynergy(chosen, profile),
  };
}

/**
 * Produce up to `count` DISTINCT synergy recommendations. Each subsequent build
 * bans one non-required item from the previous one to force meaningful variety
 * (e.g. a damage-leaning vs a more durable interpretation of the same request).
 */
export function recommendBuilds(
  championId: string,
  requiredIds: number[],
  count = 2,
  targetCore = 5,
): RecommendedBuild[] {
  const out: RecommendedBuild[] = [];
  const banned = new Set<number>();
  const seen = new Set<string>();

  for (let n = 0; n < count; n++) {
    const build = recommendBuild(championId, requiredIds, targetCore, banned);
    if (!build.items.length) break;
    const signature = [...build.items].sort((a, b) => a - b).join(",");
    if (seen.has(signature)) break;
    seen.add(signature);
    out.push(build);

    const nonRequired = build.items.filter((id) => !requiredIds.includes(id));
    if (!nonRequired.length) break;
    banned.add(nonRequired[nonRequired.length - 1]);
  }
  return out;
}
