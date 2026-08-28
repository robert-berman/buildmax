// Derives champion knowledge for the WHOLE roster from the full Data Dragon
// champion data (src/data/generated/champion-details.json, produced by
// sync-ddragon.mjs) into src/data/generated/champion-knowledge.json.
//
// What we can trust from Data Dragon and therefore derive:
//   - real ability names + slots (spells array is [Q,W,E,R], passive separate)
//   - per-ability damage type, from tooltip markup (<physicalDamage> etc.)
//   - utility (healing / move speed / crowd control / resist / shield)
//   - full stat growth (hp/AD/attack-speed per level, attack range, ...)
//
// What Data Dragon does NOT expose (vars is empty; ratios hide behind opaque
// {{ }} tokens): the exact stat an ability scales with. So a champion's stat
// "wants" come from class priors adjusted by the derived stat-growth/utility
// signals, and the "why" strings are grounded in the real ability names +
// damage types we parsed. Curated champions in knowledge.ts override this for
// precision; this base covers the long tail far better than a class-only guess.

import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import type { Ability, ChampionKnowledge, ScaleTag, Want } from "../src/engine/knowledge-types";

const __dirname = dirname(fileURLToPath(import.meta.url));
const GEN_DIR = join(__dirname, "..", "src", "data", "generated");

interface RawSpell {
  slot: string;
  id: string;
  name: string;
  description: string;
  tooltip: string;
  cooldownBurn: string;
}
interface RawDetails {
  tags: string[];
  partype: string;
  stats: Record<string, number>;
  passive: { name: string; description: string };
  spells: RawSpell[];
}

type Identity = ChampionKnowledge["identity"];
type DamageType = ChampionKnowledge["damageType"];
type AbilityDamage = NonNullable<Ability["damageType"]>;

// ---- Class priors (mirrors the fallback profiles in knowledge.ts) ----------

interface ClassPrior {
  identity: Identity;
  damageType: DamageType; // fallback only when a champion's spells are ambiguous
}

// Identity + a fallback damage type per primary class. The offensive stats a
// champion actually wants are chosen from its DERIVED damage type (baseWants),
// so AP assassins/fighters aren't forced into an AD profile.
const CLASS_PRIORS: Record<string, ClassPrior> = {
  Marksman: { identity: "carry", damageType: "physical" },
  Mage: { identity: "burst", damageType: "magic" },
  Assassin: { identity: "burst", damageType: "physical" },
  Tank: { identity: "tank", damageType: "mixed" },
  Support: { identity: "enchanter", damageType: "magic" },
  Fighter: { identity: "bruiser", damageType: "physical" },
};



const CLASS_NOTE: Record<string, string> = {
  Marksman: "a ranged carry that scales with attack speed, crit and attack damage",
  Mage: "an ability caster that scales with ability power, penetration and ability haste",
  Assassin: "a burst assassin that wants penetration and ability haste to delete priority targets",
  Tank: "a frontline tank that wants health and resistances to engage, peel and survive",
  Support: "a support that wants ability haste and utility to enable its team",
  Fighter: "a bruiser that wants a blend of damage and durability for extended fights",
};

// ---- Tooltip / description parsing -----------------------------------------

const has = (s: string, re: RegExp) => re.test(s);

function abilityDamageType(tt: string, desc: string): AbilityDamage {
  const text = `${tt} ${desc}`;
  const phys = has(tt, /<physicalDamage>/i) || has(desc, /physical damage/i);
  const magic = has(tt, /<magicDamage>/i) || has(desc, /magic damage/i);
  const tru = has(tt, /<trueDamage>/i) || has(text, /true damage/i);
  const n = [phys, magic, tru].filter(Boolean).length;
  if (n === 0) return "none";
  if (n > 1) return "mixed";
  if (phys) return "physical";
  if (magic) return "magic";
  return "true";
}

interface Utility {
  heal: boolean;
  speed: boolean;
  cc: boolean;
  resist: boolean;
  shield: boolean;
}
function utility(tt: string, desc: string): Utility {
  const text = `${tt} ${desc}`;
  return {
    heal: has(tt, /<healing>/i) || has(text, /\bheals?\b|\bhealing\b|restore[s]? health|lifesteal/i),
    speed: has(tt, /<speed>/i) || has(text, /move ?ment speed|move speed/i),
    cc: has(tt, /<status>/i) || has(text, /\bstun|\broot|\bsnare|\bfear|\bcharm|\btaunt|knock ?(back|up)|\bslow/i),
    resist: has(tt, /<scaleArmor>|<scaleMR>/i) || has(text, /armor and magic resist|bonus resist/i),
    shield: has(tt, /<shield>/i) || has(text, /\bshield/i),
  };
}

function firstNum(burn: string): number {
  const m = /-?\d+(\.\d+)?/.exec(burn ?? "");
  return m ? Number(m[0]) : NaN;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function blurbFrom(desc: string, champName: string): string {
  if (!desc) return "";
  let s = desc.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  // Drop Data Dragon lead-ins like "Passive - ", "Active: ", "Innate - ".
  s = s.replace(/^(passive|active|innate|first cast|second cast|recast)\s*[-–:]\s*/i, "");
  // Remove the champion's own name (and possessive). Names like "Dr. Mundo"
  // contain a period that would otherwise be read as a sentence boundary and
  // truncate the blurb ("Passive - Dr").
  const nameRe = new RegExp(escapeRegex(champName) + "(?:['’]s)?", "gi");
  s = s.replace(nameRe, "").replace(/\s+/g, " ").trim();
  // First sentence only. End on a period followed by whitespace, an uppercase
  // letter (ddragon sometimes omits the space, e.g. "heals.After"), or the end.
  // A period followed by a digit (e.g. "1.5") is left intact.
  const end = /\.(\s|[A-Z]|$)/.exec(s);
  if (end && end.index > 0) s = s.slice(0, end.index);
  s = s.replace(/[.\s]+$/, "").trim();
  // Read as a verb-first clause.
  if (s) s = s.charAt(0).toLowerCase() + s.slice(1);
  if (s.length > 150) s = s.slice(0, 147).trimEnd() + "…";
  return s;
}

// ---- Ability derivation ----------------------------------------------------

interface DerivedAbility extends Ability {
  cooldown: number; // rank-1 cooldown, for spam detection
  util: Utility;
}

function scalesForAbility(dmg: AbilityDamage, util: Utility, cooldown: number): ScaleTag[] {
  const out = new Set<ScaleTag>();
  if (dmg === "physical" || dmg === "mixed") out.add("bonusAD");
  if (dmg === "magic" || dmg === "mixed") out.add("ap");
  if (util.heal) out.add("sustain");
  if (util.speed) out.add("moveSpeed");
  // A low-cooldown damaging ability meaningfully rewards ability haste.
  if (dmg !== "none" && Number.isFinite(cooldown) && cooldown <= 9) out.add("abilityHaste");
  return [...out];
}

function deriveAbilities(d: RawDetails, champName: string): DerivedAbility[] {
  const out: DerivedAbility[] = [];

  const passiveText = `${d.passive.description}`;
  if (d.passive.name) {
    const dmg = abilityDamageType("", passiveText);
    const util = utility("", passiveText);
    out.push({
      slot: "P", name: d.passive.name, damageType: dmg,
      scalesWith: scalesForAbility(dmg, util, NaN),
      blurb: blurbFrom(d.passive.description, champName),
      cooldown: NaN, util,
    });
  }

  for (const sp of d.spells) {
    const slot = sp.slot as Ability["slot"];
    if (!["Q", "W", "E", "R"].includes(slot)) continue;
    const dmg = abilityDamageType(sp.tooltip, sp.description);
    const util = utility(sp.tooltip, sp.description);
    const cd = firstNum(sp.cooldownBurn);
    out.push({
      slot, name: sp.name, damageType: dmg,
      scalesWith: scalesForAbility(dmg, util, cd),
      blurb: blurbFrom(sp.description, champName),
      cooldown: cd, util,
    });
  }
  return out;
}

// ---- Champion-level derivation ---------------------------------------------

function primaryClass(tags: string[]): string {
  // Respect Data Dragon's tag order (Riot lists the primary role first) rather
  // than a fixed global priority, so a ["Fighter","Tank"] bruiser like Hecarim
  // stays a Fighter instead of being read as a pure Tank.
  for (const t of tags) if (CLASS_PRIORS[t]) return t;
  return "Fighter";
}

function deriveDamageType(prior: ClassPrior, abilities: DerivedAbility[], tags: string[]): DamageType {
  const dmgAbils = abilities.filter((a) => a.slot !== "P" && a.damageType && a.damageType !== "none");
  let ad = 0, ap = 0;
  for (const a of dmgAbils) {
    if (a.damageType === "physical") ad++;
    else if (a.damageType === "magic") ap++;
    else if (a.damageType === "mixed") { ad++; ap++; }
  }
  if (ad > 0 && ap === 0) return "physical";
  if (ap > 0 && ad === 0) return "magic";
  // A Mage secondary tag is a strong ability-power signal for hybrids: champions
  // like Katarina and Kayle are tagged Assassin/Fighter + Mage but scale with AP.
  if (tags.includes("Mage")) return "magic";
  if (ad > 0 && ap > 0) return prior.damageType === "mixed" ? "mixed" : prior.damageType;
  return prior.damageType;
}

const listAbilities = (abils: DerivedAbility[], max = 2): string => {
  const parts = abils.slice(0, max).map((a) => `${a.name} (${a.slot})`);
  if (parts.length === 0) return "";
  if (parts.length === 1) return parts[0];
  return `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
};

interface Ctx {
  name: string;
  abilities: DerivedAbility[];
  phys: DerivedAbility[];
  magic: DerivedAbility[];
  healAbil?: DerivedAbility;
  speedAbil?: DerivedAbility;
  spamAbil?: DerivedAbility;
}

function whyFor(tag: ScaleTag, ctx: Ctx): string {
  switch (tag) {
    case "bonusAD":
      return ctx.phys.length
        ? `scales your physical damage on ${listAbilities(ctx.phys)}`
        : `raises your attack damage`;
    case "ap":
      return ctx.magic.length
        ? `powers your magic damage on ${listAbilities(ctx.magic)}`
        : `is your core damage scaling`;
    case "health":
      return `gives the durability to survive fights and keep dealing damage`;
    case "attackSpeed":
      return `lets you attack faster to apply on-hit effects and your kit more often`;
    case "crit":
      return `makes your attacks and abilities crit for burst`;
    case "abilityHaste":
      return ctx.spamAbil
        ? `shortens your cooldowns so you cast ${ctx.spamAbil.name} (${ctx.spamAbil.slot}) far more often`
        : `shortens your cooldowns so you use your kit more often`;
    case "armor":
      return `keeps you alive against physical damage`;
    case "magicResist":
      return `keeps you alive against magic damage`;
    case "moveSpeed":
      return ctx.speedAbil
        ? `feeds ${ctx.speedAbil.name} (${ctx.speedAbil.slot}) and helps you stick to targets`
        : `helps you close distance and stick to targets`;
    case "sustain":
      return ctx.healAbil
        ? `fuels the healing on ${ctx.healAbil.name} (${ctx.healAbil.slot}) through extended fights`
        : `keeps you healthy through extended fights`;
    case "armorPen":
      return `helps your physical damage cut through armor`;
    case "magicPen":
      return `helps your magic damage cut through resistances`;
    case "onHit":
      return `lands on every attack you make`;
    case "lifesteal":
      return `sustains you through drawn-out fights`;
    case "tenacity":
      return `helps you fight through crowd control`;
  }
}

// Offensive wants follow the champion's DERIVED damage type (from its spells),
// not just the class tag -- so AP assassins (Akali, Ekko) and AP fighters
// (Mordekaiser) ask for ability power, not attack damage. Durability/utility
// come from the identity; tanks and enchanters build offense last.
function baseWants(damageType: DamageType, identity: Identity): { tag: ScaleTag; weight: number }[] {
  const w: { tag: ScaleTag; weight: number }[] = [];
  const offense = identity === "tank" ? 0.4 : identity === "enchanter" ? 0.35 : identity === "bruiser" ? 0.8 : 0.9;
  const pen = offense >= 0.8 ? 0.65 : 0.4;

  if (damageType === "physical" && identity === "carry") {
    w.push({ tag: "attackSpeed", weight: 0.85 }, { tag: "crit", weight: 0.85 }, { tag: "bonusAD", weight: 0.7 });
  } else if (damageType === "physical") {
    w.push({ tag: "bonusAD", weight: offense }, { tag: "armorPen", weight: pen });
  } else if (damageType === "magic") {
    w.push({ tag: "ap", weight: offense }, { tag: "magicPen", weight: pen });
  } else {
    w.push({ tag: "bonusAD", weight: offense * 0.75 }, { tag: "ap", weight: offense * 0.75 });
  }

  switch (identity) {
    case "carry":
      w.push({ tag: "lifesteal", weight: 0.4 });
      break;
    case "burst":
      w.push({ tag: "abilityHaste", weight: 0.55 }, { tag: "health", weight: 0.25 });
      break;
    case "bruiser":
      w.push({ tag: "health", weight: 0.7 }, { tag: "abilityHaste", weight: 0.45 }, { tag: "armor", weight: 0.4 });
      break;
    case "tank":
      w.push({ tag: "health", weight: 0.9 }, { tag: "armor", weight: 0.7 }, { tag: "magicResist", weight: 0.7 }, { tag: "abilityHaste", weight: 0.4 });
      break;
    case "enchanter":
      w.push({ tag: "abilityHaste", weight: 0.7 }, { tag: "health", weight: 0.5 }, { tag: "sustain", weight: 0.5 });
      break;
  }
  return w;
}

function deriveWants(prior: ClassPrior, d: RawDetails, abilities: DerivedAbility[], ctx: Ctx, damageType: DamageType): Want[] {
  const weights = new Map<ScaleTag, number>();
  const bump = (tag: ScaleTag, w: number) => {
    weights.set(tag, Math.max(weights.get(tag) ?? 0, w));
  };

  // Offensive core follows the champion's actual (derived) damage type.
  for (const w of baseWants(damageType, prior.identity)) bump(w.tag, w.weight);

  const st = d.stats;
  const melee = st.attackrange > 0 && st.attackrange <= 350;
  const durable = prior.identity === "bruiser" || prior.identity === "tank";
  // Durability signal. Only frontline identities (bruiser/tank) or Tank-tagged
  // champions treat health as a want -- ranged carries and melee assassins are
  // squishy despite high flat health growth, so they shouldn't ask for it.
  if (d.tags.includes("Tank")) bump("health", 0.75);
  else if (durable && melee && st.hpperlevel >= 95) bump("health", 0.7);
  else if (durable && st.hpperlevel >= 105) bump("health", 0.55);

  // Kit-derived signals.
  const anyHeal = abilities.some((a) => a.util.heal);
  const anySpeed = abilities.some((a) => a.util.speed);
  const anyResist = abilities.some((a) => a.util.resist);
  const hasSpam = abilities.some((a) => a.slot !== "P" && a.damageType !== "none" && Number.isFinite(a.cooldown) && a.cooldown <= 9);
  if (anyHeal) bump("sustain", 0.45);
  if (anySpeed) bump("moveSpeed", 0.5);
  if (anyResist || d.tags.includes("Tank")) { bump("armor", 0.5); bump("magicResist", 0.5); }
  if (hasSpam) bump("abilityHaste", Math.max(0.5, weights.get("abilityHaste") ?? 0));

  return [...weights.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 7)
    .map(([tag, weight]) => ({ tag, weight: Math.round(weight * 100) / 100, why: whyFor(tag, ctx) }));
}

function deriveNotes(name: string, primary: string, abilities: DerivedAbility[]): string {
  const traits: string[] = [];
  if (abilities.some((a) => a.util.heal)) traits.push("built-in healing");
  if (abilities.some((a) => a.util.speed)) traits.push("strong mobility");
  if (abilities.some((a) => a.util.cc)) traits.push("crowd control");
  const base = CLASS_NOTE[primary] ?? CLASS_NOTE.Fighter;
  if (traits.length === 0) return base;
  const tail = traits.length === 1 ? traits[0] : `${traits.slice(0, -1).join(", ")} and ${traits[traits.length - 1]}`;
  return `${base}, with ${tail}`;
}

function deriveChampion(id: string, name: string, d: RawDetails): ChampionKnowledge {
  const primary = primaryClass(d.tags);
  const prior = CLASS_PRIORS[primary];
  const abilities = deriveAbilities(d, name);

  const phys = abilities.filter((a) => a.slot !== "P" && (a.damageType === "physical" || a.damageType === "mixed"));
  const magic = abilities.filter((a) => a.slot !== "P" && (a.damageType === "magic" || a.damageType === "mixed"));
  const healAbil = abilities.find((a) => a.util.heal);
  const speedAbil = abilities.find((a) => a.util.speed);
  const spamAbil = abilities
    .filter((a) => a.slot !== "P" && a.damageType !== "none" && Number.isFinite(a.cooldown))
    .sort((a, b) => a.cooldown - b.cooldown)[0];

  const ctx: Ctx = { name, abilities, phys, magic, healAbil, speedAbil, spamAbil };
  const damageType = deriveDamageType(prior, abilities, d.tags);
  const wants = deriveWants(prior, d, abilities, ctx, damageType);

  return {
    championId: id,
    name,
    identity: prior.identity,
    damageType,
    abilities: abilities.map(({ slot, name, damageType, scalesWith, blurb }) => ({ slot, name, damageType, scalesWith, blurb })),
    wants,
    notes: deriveNotes(name, primary, abilities),
    curated: false,
  };
}

// ---- Main -------------------------------------------------------------------

async function main() {
  const details = JSON.parse(await readFile(join(GEN_DIR, "champion-details.json"), "utf8")) as Record<string, RawDetails>;
  const champions = JSON.parse(await readFile(join(GEN_DIR, "champions.json"), "utf8")) as Record<string, { name: string }>;

  const out: Record<string, ChampionKnowledge> = {};
  for (const [id, d] of Object.entries(details)) {
    const name = champions[id]?.name ?? id;
    out[id] = deriveChampion(id, name, d);
  }

  const sorted = Object.fromEntries(Object.entries(out).sort(([a], [b]) => a.localeCompare(b)));
  await writeFile(join(GEN_DIR, "champion-knowledge.json"), JSON.stringify(sorted, null, 2));
  console.log(`Derived knowledge for ${Object.keys(out).length} champions -> champion-knowledge.json`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("derive-knowledge failed:", err);
    process.exit(1);
  });
