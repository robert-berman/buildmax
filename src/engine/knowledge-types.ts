// Shared knowledge types, kept free of any data imports so both the runtime
// knowledge base (knowledge.ts) and the offline derivation (scripts/
// derive-knowledge.ts) can depend on them without an import cycle through the
// generated JSON.

export type ScaleTag =
  | "bonusAD" | "ap" | "health" | "attackSpeed" | "onHit" | "crit" | "armor"
  | "magicResist" | "abilityHaste" | "armorPen" | "magicPen" | "lifesteal"
  | "moveSpeed" | "tenacity" | "sustain";

export type ItemEffect =
  | "healthScaling" | "bonusADConvert" | "critAmp" | "critToOnHit" | "onHitTrue"
  | "percentHP" | "spellblade" | "healAmp" | "antiHeal" | "antiCrit"
  | "armorShred" | "shield" | "shredPen" | "abilityAmp";

export interface Ability {
  slot: "P" | "Q" | "W" | "E" | "R";
  name: string;
  damageType?: "physical" | "magic" | "true" | "mixed" | "none";
  scalesWith: ScaleTag[];
  blurb: string;
}

export interface Want {
  tag: ScaleTag;
  weight: number; // 0..1 relative importance
  why: string; // verb-first clause following "<Item>'s <stat> ..."
}

export interface ChampionKnowledge {
  championId: string;
  name: string;
  identity: "carry" | "bruiser" | "tank" | "burst" | "enchanter";
  damageType: "physical" | "magic" | "mixed";
  abilities: Ability[];
  wants: Want[];
  notes: string;
  curated: boolean;
}

export interface ItemMechanic {
  mechanic: string; // verb phrase, item as implicit subject
  effects: ItemEffect[];
  addProvides?: ScaleTag[];
}

export interface ItemProfile {
  id: number;
  name: string;
  provides: ScaleTag[];
  effects: ItemEffect[];
  mechanic?: string;
}
