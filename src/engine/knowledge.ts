// Knowledge base powering the "why": champion ability/scaling facts and item
// mechanics. This is BuildMax's differentiator -- it lets us explain, in plain
// language, why an item feeds a champion's kit and why items work together.
//
// Prose convention (so generated sentences read naturally):
//   - a Want.why is a verb-first clause that follows "<Item>'s <stat> ..."
//       e.g. why: "feeds Rampage (Q)..." -> "Black Cleaver's attack damage feeds Rampage (Q)..."
//   - an ItemMechanic.mechanic is a verb phrase with the item as implicit subject
//       e.g. "grants ..." -> "Sterak's Gage grants ..."
//
// Curated for top champions/items; everything else falls back to a class-based
// profile derived from Data Dragon tags. Raw stat provision is derived from Data
// Dragon; we only hand-author the passives/scalings Data Dragon doesn't expose.

import { getChampion, getItem, type ItemStatic } from "@/data/ddragon";
import championKnowledgeRaw from "@/data/generated/champion-knowledge.json";
import type { ChampionKnowledge, ItemMechanic, ItemProfile, ScaleTag } from "./knowledge-types";

// Types live in ./knowledge-types (no data imports) so the offline derivation
// script can share them without an import cycle. Re-exported here so existing
// consumers keep importing them from "./knowledge".
export type {
  Ability,
  ChampionKnowledge,
  ItemEffect,
  ItemMechanic,
  ItemProfile,
  ScaleTag,
  Want,
} from "./knowledge-types";

// ---- Curated champion knowledge ------------------------------------------

const CHAMPIONS: Record<string, Omit<ChampionKnowledge, "championId" | "name" | "curated">> = {
  Hecarim: {
    identity: "bruiser",
    damageType: "physical",
    abilities: [
      { slot: "P", name: "Warpath", damageType: "none", scalesWith: ["moveSpeed", "bonusAD"], blurb: "converts a share of bonus move speed into bonus attack damage" },
      { slot: "Q", name: "Rampage", damageType: "physical", scalesWith: ["bonusAD", "abilityHaste"], blurb: "his main, low-cooldown damage; scales with bonus AD" },
      { slot: "W", name: "Spirit of Dread", damageType: "magic", scalesWith: ["health", "sustain"], blurb: "heals him based on damage enemies take near him" },
      { slot: "E", name: "Devastating Charge", damageType: "physical", scalesWith: ["moveSpeed", "bonusAD"], blurb: "an empowered charge whose damage grows with distance and move speed" },
      { slot: "R", name: "Onslaught of Shadows", damageType: "magic", scalesWith: [], blurb: "a long dash that fears enemies for the dive" },
    ],
    wants: [
      { tag: "bonusAD", weight: 0.9, why: "feeds Rampage (Q), his main damage, and his passive converts move speed into even more of it" },
      { tag: "health", weight: 0.8, why: "lets him dive the backline and survive the follow-up" },
      { tag: "moveSpeed", weight: 0.7, why: "is what his passive turns into attack damage, and it powers Devastating Charge (E)" },
      { tag: "abilityHaste", weight: 0.55, why: "cuts Rampage (Q)'s cooldown so he casts it far more often" },
      { tag: "armor", weight: 0.5, why: "keeps him alive after he dives in" },
      { tag: "magicResist", weight: 0.5, why: "keeps him alive after he dives in" },
      { tag: "sustain", weight: 0.4, why: "fuels Spirit of Dread (W)'s healing through extended fights" },
    ],
    notes: "a fast bruiser-diver who turns move speed into AD, spams Rampage, and crashes into the backline before surviving the aftermath",
  },
  MasterYi: {
    identity: "carry",
    damageType: "physical",
    abilities: [
      { slot: "P", name: "Double Strike", damageType: "physical", scalesWith: ["attackSpeed", "onHit"], blurb: "every few attacks strikes twice, rewarding attack speed and on-hit" },
      { slot: "Q", name: "Alpha Strike", damageType: "physical", scalesWith: ["bonusAD", "onHit", "crit"], blurb: "a multi-hit strike that applies on-hit effects and can crit" },
      { slot: "E", name: "Wuju Style", damageType: "true", scalesWith: ["bonusAD"], blurb: "adds bonus TRUE damage to every attack" },
      { slot: "W", name: "Meditate", damageType: "none", scalesWith: ["sustain"], blurb: "channels a heal with damage reduction" },
      { slot: "R", name: "Highlander", damageType: "none", scalesWith: ["attackSpeed"], blurb: "bonus move and attack speed that resets on takedowns" },
    ],
    wants: [
      { tag: "attackSpeed", weight: 0.9, why: "lets more attacks trigger Double Strike (passive) and on-hit effects, ramping his damage fast" },
      { tag: "onHit", weight: 0.85, why: "lands on every swing through his autos and Alpha Strike (Q)" },
      { tag: "bonusAD", weight: 0.7, why: "scales Alpha Strike (Q) and every attack" },
      { tag: "crit", weight: 0.7, why: "makes Alpha Strike (Q) and his autos crit for burst" },
      { tag: "lifesteal", weight: 0.55, why: "sustains him as a melee carry diving into the fight" },
      { tag: "armorPen", weight: 0.5, why: "lets his sustained damage cut through the tanks he's forced to attack" },
    ],
    notes: "a snowballing auto-attack carry: attack speed plus on-hit or crit fuels Double Strike and Alpha Strike, with lifesteal to survive diving the backline",
  },
  Darius: {
    identity: "bruiser",
    damageType: "physical",
    abilities: [
      { slot: "P", name: "Hemorrhage", damageType: "physical", scalesWith: ["bonusAD"], blurb: "attacks and abilities stack a bleed that ramps his damage" },
      { slot: "Q", name: "Decimate", damageType: "physical", scalesWith: ["bonusAD", "sustain"], blurb: "a spinning strike that heals him when the blade's edge connects" },
      { slot: "E", name: "Apprehend", damageType: "none", scalesWith: ["armorPen"], blurb: "pulls enemies in and passively grants armor penetration" },
      { slot: "R", name: "Noxian Guillotine", damageType: "true", scalesWith: ["bonusAD"], blurb: "a true-damage execute that grows with bleed stacks and resets on kills" },
    ],
    wants: [
      { tag: "bonusAD", weight: 0.85, why: "scales Decimate (Q) and the Noxian Guillotine (R) execute" },
      { tag: "health", weight: 0.75, why: "keeps him alive to keep swinging as a melee juggernaut" },
      { tag: "armorPen", weight: 0.6, why: "stacks with his Apprehend (E) shred so his AD still hurts tanks" },
      { tag: "abilityHaste", weight: 0.5, why: "adds more Decimate (Q) casts for extra bleed and healing" },
      { tag: "armor", weight: 0.45, why: "helps him win extended melee trades" },
      { tag: "sustain", weight: 0.4, why: "extends the healing from Decimate (Q)" },
    ],
    notes: "an AD juggernaut who stacks a bleed and executes low targets; he wants bonus AD, durability and penetration",
  },
};

const CLASS_FALLBACKS: Record<string, Omit<ChampionKnowledge, "championId" | "name" | "abilities" | "curated">> = {
  Marksman: {
    identity: "carry", damageType: "physical",
    wants: [
      { tag: "attackSpeed", weight: 0.85, why: "drives most of a ranged carry's damage through repeated attacks" },
      { tag: "crit", weight: 0.85, why: "is the main damage scaling for a ranged carry" },
      { tag: "bonusAD", weight: 0.7, why: "raises every auto-attack" },
      { tag: "lifesteal", weight: 0.4, why: "sustains it through drawn-out fights" },
    ],
    notes: "a ranged carry that scales with attack speed, critical strike and attack damage",
  },
  Mage: {
    identity: "burst", damageType: "magic",
    wants: [
      { tag: "ap", weight: 0.9, why: "is its core damage scaling" },
      { tag: "abilityHaste", weight: 0.6, why: "lets it cast its damaging spells more often" },
      { tag: "magicPen", weight: 0.7, why: "makes its magic damage land through resistances" },
      { tag: "health", weight: 0.3, why: "adds survivability against divers" },
    ],
    notes: "an ability-based caster that scales with ability power, magic penetration and ability haste",
  },
  Assassin: {
    identity: "burst", damageType: "physical",
    wants: [
      { tag: "bonusAD", weight: 0.85, why: "raises its burst combo" },
      { tag: "armorPen", weight: 0.8, why: "lets it delete squishy targets" },
      { tag: "abilityHaste", weight: 0.5, why: "shortens cooldowns between kill attempts" },
    ],
    notes: "a burst assassin that wants lethality/penetration and ability haste to delete priority targets",
  },
  Tank: {
    identity: "tank", damageType: "mixed",
    wants: [
      { tag: "health", weight: 0.9, why: "is the foundation of its durability and often its damage" },
      { tag: "armor", weight: 0.7, why: "lets it survive physical damage to peel and engage" },
      { tag: "magicResist", weight: 0.7, why: "lets it survive magic damage to peel and engage" },
      { tag: "abilityHaste", weight: 0.4, why: "enables more frequent engage and crowd control" },
    ],
    notes: "a frontline tank that wants health and resistances to engage, peel and survive",
  },
  Support: {
    identity: "enchanter", damageType: "magic",
    wants: [
      { tag: "abilityHaste", weight: 0.7, why: "keeps its shields, heals and utility available" },
      { tag: "health", weight: 0.5, why: "adds survivability while it enables the team" },
      { tag: "sustain", weight: 0.5, why: "powers its healing and shielding output" },
    ],
    notes: "a support that wants ability haste and utility to enable its team",
  },
  Fighter: {
    identity: "bruiser", damageType: "physical",
    wants: [
      { tag: "bonusAD", weight: 0.7, why: "raises its damage in extended fights" },
      { tag: "health", weight: 0.7, why: "gives durability to trade and survive as a frontliner" },
      { tag: "abilityHaste", weight: 0.45, why: "enables more ability rotations in a fight" },
      { tag: "armor", weight: 0.4, why: "adds durability in melee trades" },
    ],
    notes: "a bruiser that wants a blend of damage and durability for extended fights",
  },
};

// Derived knowledge for the whole roster (scripts/derive-knowledge.ts).
const DERIVED = championKnowledgeRaw as unknown as Record<string, ChampionKnowledge>;

export function getChampionKnowledge(championId: string): ChampionKnowledge {
  const champ = getChampion(championId);
  const name = champ?.name ?? championId;

  // 1) Hand-curated overrides win (precise signature passives for top champs).
  const curated = CHAMPIONS[championId];
  if (curated) return { championId, name, curated: true, ...curated };

  // 2) Derived-from-Data-Dragon base covers the rest of the roster.
  const derived = DERIVED[championId];
  if (derived) return { ...derived, championId, name, curated: false };

  // 3) Class-based safety net if a champion is somehow missing from both.
  const tags = champ?.tags ?? [];
  const order = ["Marksman", "Mage", "Assassin", "Tank", "Support", "Fighter"];
  const primary = order.find((t) => tags.includes(t)) ?? "Fighter";
  const spec = CLASS_FALLBACKS[primary];
  return { championId, name, curated: false, abilities: [], ...spec };
}

// ---- Curated item mechanics (verb phrases; item is the implicit subject) ---

export const ITEM_MECHANICS: Record<number, ItemMechanic> = {
  3161: { mechanic: "ramps up your ability damage the more you cast, so rapid-fire spells hit harder and harder", effects: ["abilityAmp"] },
  3084: { mechanic: "stacks permanent health, and its charged attack deals bonus damage based on your maximum health", effects: ["healthScaling"] },
  3053: { mechanic: "grants bonus AD from your base AD and a lifeline shield that scales with your maximum health", effects: ["shield", "healthScaling", "bonusADConvert"] },
  3078: { mechanic: "turns each ability cast into a bonus-damage attack (Spellblade), and adds attack speed, move speed and ability haste", effects: ["spellblade"] },
  3071: { mechanic: "shreds the target's armor as you deal physical damage (up to ~30%) and grants you move speed", effects: ["armorShred"] },
  3748: { mechanic: "makes your attacks deal bonus damage from your maximum health and cleave the area", effects: ["healthScaling"] },
  3083: { mechanic: "grants a huge health pool and rapidly regenerates you out of combat past a health threshold", effects: [] },
  6610: { mechanic: "makes your first strike on a target a guaranteed crit that heals you based on your maximum health", effects: ["spellblade", "healthScaling", "healAmp"] },
  3065: { mechanic: "increases all healing and shielding you receive, on top of health, magic resist and health regen", effects: ["healAmp"] },
  4401: { mechanic: "grants heavy magic resist and ramping move speed as you take magic damage", effects: [] },
  3075: { mechanic: "applies Grievous Wounds (anti-heal) and reflects damage to attackers, on top of heavy armor", effects: ["antiHeal"] },
  6665: { mechanic: "stacks resistances in combat, then converts to a burst of bonus resistances and damage at full stacks", effects: [] },
  3143: { mechanic: "reduces the critical strike damage you take and can slow attackers, with armor and health", effects: ["antiCrit"] },
  3742: { mechanic: "builds momentum move speed, and your next attack after moving slows and deals bonus damage", effects: [] },
  3068: { mechanic: "burns nearby enemies continuously, with extra burn when you hit them with attacks or abilities", effects: [] },
  6631: { mechanic: "cleaves and slows with its attacks and a dash, alongside AD, attack speed and health", effects: [] },
  6662: { mechanic: "drops a slowing frost field on its Spellblade proc, with armor and health for bruisers", effects: ["spellblade"] },
  2501: { mechanic: "converts part of your bonus health into attack damage and heals you when you damage champions", effects: ["healthScaling", "bonusADConvert"] },
  3181: { mechanic: "grants bonus resistances and empowered minions while you fight alone, with health and AD for split-pushing", effects: [] },
  3031: { mechanic: "massively amplifies your critical strike damage", effects: ["critAmp"] },
  6672: { mechanic: "makes every third attack deal bonus true damage that ramps against low-health targets", effects: ["onHitTrue"] },
  3032: { mechanic: "adds a crit-scaling bleed to your attacks, with crit chance and attack speed", effects: [] },
  3046: { mechanic: "grants crit, attack speed and move speed, plus a ghosting burst while you attack", effects: [] },
  3153: { mechanic: "deals a percentage of the target's current health on-hit and heals you, which excels into high-health targets", effects: ["percentHP"] },
  3124: { mechanic: "converts crit chance into guaranteed on-hit stacks, then applies bonus on-hits periodically", effects: ["critToOnHit"] },
  3091: { mechanic: "adds on-hit magic damage with attack speed, magic resist and tenacity", effects: [] },
  3072: { mechanic: "turns overhealing into a shield, on top of attack damage and lifesteal", effects: ["shield"] },
  6333: { mechanic: "spreads the damage you take into a bleed and heals on takedown, with AD, armor and ability haste", effects: [] },
  3302: { mechanic: "alternates armor and magic penetration on-hit while ramping your own resistances", effects: ["shredPen"] },
};

// ---- Item profile (derived stats + curated passive) -----------------------

const HUMAN_TAG: Record<ScaleTag, string> = {
  bonusAD: "attack damage", ap: "ability power", health: "health", attackSpeed: "attack speed",
  onHit: "on-hit damage", crit: "critical strike", armor: "armor", magicResist: "magic resist",
  abilityHaste: "ability haste", armorPen: "armor penetration", magicPen: "magic penetration",
  lifesteal: "lifesteal", moveSpeed: "move speed", tenacity: "tenacity", sustain: "sustain",
};

export function humanizeTag(tag: ScaleTag): string {
  return HUMAN_TAG[tag] ?? tag;
}

export function itemProfile(item: ItemStatic): ItemProfile {
  const s = item.stats;
  const provides = new Set<ScaleTag>();
  if (s.FlatPhysicalDamageMod) provides.add("bonusAD");
  if (s.FlatMagicDamageMod) provides.add("ap");
  if (s.FlatHPPoolMod) provides.add("health");
  if (s.PercentAttackSpeedMod) provides.add("attackSpeed");
  if (s.FlatCritChanceMod) provides.add("crit");
  if (s.FlatArmorMod) provides.add("armor");
  if (s.FlatSpellBlockMod) provides.add("magicResist");
  if (s.PercentLifeStealMod) provides.add("lifesteal");
  if (s.FlatMovementSpeedMod || s.PercentMovementSpeedMod) provides.add("moveSpeed");
  for (const t of item.tags) {
    if (t === "OnHit") provides.add("onHit");
    if (t === "CooldownReduction" || t === "AbilityHaste") provides.add("abilityHaste");
    if (t === "ArmorPenetration") provides.add("armorPen");
    if (t === "MagicPenetration") provides.add("magicPen");
    if (t === "Tenacity") provides.add("tenacity");
    if (t === "HealthRegen" || t === "SpellVamp") provides.add("sustain");
  }
  const curated = ITEM_MECHANICS[item.id];
  if (curated?.addProvides) for (const t of curated.addProvides) provides.add(t);
  return {
    id: item.id,
    name: item.name,
    provides: [...provides],
    effects: curated?.effects ?? [],
    mechanic: curated?.mechanic,
  };
}

export function itemProfileById(id: number): ItemProfile | null {
  const item = getItem(id);
  return item ? itemProfile(item) : null;
}
