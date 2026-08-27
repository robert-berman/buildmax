// Syncs real League of Legends static data from Riot's Data Dragon CDN into
// src/data/generated/. No API key required; Riot distributes Data Dragon for
// exactly this purpose. Run with: npm run sync-ddragon
//
// Output files (trimmed to the fields BuildMax needs):
//   src/data/generated/version.json          -> { version, patch, locale, syncedAt }
//   src/data/generated/champions.json        -> { [championId]: ChampionStatic }
//   src/data/generated/items.json            -> { [itemId]: ItemStatic }
//   src/data/generated/champion-details.json -> { [championId]: full spells/stats } (fuels derive-knowledge)

import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(__dirname, "..", "src", "data", "generated");
const LOCALE = process.env.DDRAGON_LOCALE || "en_US";
const SR_MAP_ID = "11"; // Summoner's Rift

async function getJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`GET ${url} -> ${res.status} ${res.statusText}`);
  return res.json();
}

function patchFromVersion(version) {
  // "16.17.1" -> "16.17"
  const parts = version.split(".");
  return parts.length >= 2 ? `${parts[0]}.${parts[1]}` : version;
}

async function main() {
  console.log("Fetching Data Dragon versions...");
  const versions = await getJson("https://ddragon.leagueoflegends.com/api/versions.json");
  const version = versions[0];
  const patch = patchFromVersion(version);
  console.log(`Latest version: ${version} (patch ${patch}), locale ${LOCALE}`);

  const base = `https://ddragon.leagueoflegends.com/cdn/${version}/data/${LOCALE}`;

  console.log("Fetching champions...");
  const champRaw = await getJson(`${base}/champion.json`);
  const champions = {};
  for (const [id, c] of Object.entries(champRaw.data)) {
    champions[id] = {
      id,
      key: c.key, // numeric id as string
      name: c.name,
      title: c.title,
      tags: c.tags || [],
      partype: c.partype || "",
    };
  }
  console.log(`  ${Object.keys(champions).length} champions`);

  console.log("Fetching items...");
  const itemRaw = await getJson(`${base}/item.json`);
  const items = {};
  for (const [id, it] of Object.entries(itemRaw.data)) {
    const gold = it.gold || {};
    const maps = it.maps || {};
    const onSR = maps[SR_MAP_ID] !== false; // default true if unspecified
    const purchasable = gold.purchasable !== false;
    if (!onSR || !purchasable) continue;
    if (it.hideFromAll) continue;
    // Skip trinkets / champion-locked items we do not need for builds.
    if (it.requiredChampion) continue;
    // Skip special-mode variants (Arena 3xxxxx, Ornn masterwork 22xxxx, etc.);
    // canonical Summoner's Rift items use ids below 100000.
    if (Number(id) >= 100000) continue;

    const tags = it.tags || [];
    const into = it.into || [];
    const from = it.from || [];
    const isBoots = tags.includes("Boots");
    const goldTotal = gold.total || 0;
    // A "completed" item is a leaf in the build tree that is expensive enough
    // to be a core legendary (not a component, not boots).
    const isCompleted = !isBoots && into.length === 0 && goldTotal >= 2200;

    items[id] = {
      id,
      name: it.name,
      tags,
      stats: it.stats || {},
      goldTotal,
      from,
      into,
      depth: it.depth || (from.length ? 2 : 1),
      isBoots,
      isCompleted,
    };
  }
  console.log(`  ${Object.keys(items).length} purchasable SR items`);

  // Full champion data (spells, passive, stat growth) for the knowledge
  // derivation. This is the source for real ability names + per-ability damage
  // types; scripts/derive-knowledge.ts turns it into champion-knowledge.json.
  console.log("Fetching full champion data (spells/stats)...");
  const champFull = await getJson(`${base}/championFull.json`);
  const SLOTS = ["Q", "W", "E", "R"];
  const details = {};
  for (const [id, c] of Object.entries(champFull.data)) {
    const st = c.stats || {};
    const spells = (c.spells || []).map((sp, i) => ({
      slot: SLOTS[i] || "?",
      id: sp.id,
      name: sp.name,
      description: sp.description || "",
      tooltip: sp.tooltip || "",
      cooldownBurn: sp.cooldownBurn || "",
    }));
    details[id] = {
      tags: c.tags || [],
      partype: c.partype || "",
      stats: {
        hp: st.hp ?? 0,
        hpperlevel: st.hpperlevel ?? 0,
        attackdamage: st.attackdamage ?? 0,
        attackdamageperlevel: st.attackdamageperlevel ?? 0,
        attackspeed: st.attackspeed ?? 0,
        attackspeedperlevel: st.attackspeedperlevel ?? 0,
        armor: st.armor ?? 0,
        spellblock: st.spellblock ?? 0,
        movespeed: st.movespeed ?? 0,
        attackrange: st.attackrange ?? 0,
        crit: st.crit ?? 0,
      },
      passive: {
        name: c.passive?.name || "",
        description: c.passive?.description || "",
      },
      spells,
    };
  }
  console.log(`  ${Object.keys(details).length} champions with full data`);

  await mkdir(OUT_DIR, { recursive: true });
  await writeFile(
    join(OUT_DIR, "version.json"),
    JSON.stringify({ version, patch, locale: LOCALE, syncedAt: new Date().toISOString() }, null, 2),
  );
  await writeFile(join(OUT_DIR, "champions.json"), JSON.stringify(champions, null, 0));
  await writeFile(join(OUT_DIR, "items.json"), JSON.stringify(items, null, 0));
  await writeFile(join(OUT_DIR, "champion-details.json"), JSON.stringify(details, null, 0));

  console.log(`\nWrote generated data to ${OUT_DIR}`);
  console.log("Done.");
}

main().catch((err) => {
  console.error("\nsync-ddragon failed:", err.message);
  process.exit(1);
});
