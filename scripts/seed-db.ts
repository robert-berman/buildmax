// Seeds Postgres with static game data (from Data Dragon) and the representative
// build aggregates, using the same computation as the seed provider. Run AFTER
// applying the schema:
//   npm run db:migrate   (or: npm run db:push)
//   npm run db:seed
//
// Once the real Riot ingestion pipeline exists, it writes to these same tables
// and this script is no longer needed.
import "dotenv/config";
import { allChampions, allItems } from "@/data/ddragon";
import { getSeedProvider } from "@/data/stats/seed";
import { SEED_BUILDS } from "@/data/stats/seed-data";
import { closeDb, getDb } from "@/db/client";
import { buildStats, championRoleAgg, champions as championsTable, items as itemsTable } from "@/db/schema";

async function main() {
  const db = getDb();
  const provider = getSeedProvider();

  // Static reference data.
  await db.delete(itemsTable);
  await db.insert(itemsTable).values(
    allItems().map((i) => ({
      id: i.id,
      name: i.name,
      tags: i.tags,
      stats: i.stats,
      goldTotal: i.goldTotal,
      isBoots: i.isBoots,
      isCompleted: i.isCompleted,
    })),
  );

  await db.delete(championsTable);
  await db.insert(championsTable).values(
    allChampions().map((c) => ({
      id: c.id,
      key: c.key,
      name: c.name,
      title: c.title,
      tags: c.tags,
      partype: c.partype,
    })),
  );

  // Aggregated build stats + champion/role headline aggregates.
  await db.delete(buildStats);
  await db.delete(championRoleAgg);
  const champions = [...new Set(SEED_BUILDS.map((b) => b.champion))];
  let buildCount = 0;

  for (const champion of champions) {
    const builds = await provider.getBuilds({ champion });
    if (builds.length) {
      await db.insert(buildStats).values(
        builds.map((b) => ({
          id: b.id,
          champion: b.champion,
          role: b.role,
          patch: b.patch,
          rank: b.rank,
          region: b.region,
          items: b.items,
          boots: b.boots,
          games: b.games,
          wins: b.wins,
          pickRate: b.pickRate,
          gameStage: b.gameStage,
        })),
      );
      buildCount += builds.length;
    }

    const aggs = await provider.getChampionRoleAggs(champion);
    if (aggs.length) {
      await db.insert(championRoleAgg).values(
        aggs.map((a) => ({
          id: `${a.champion}|${a.role}|${a.patch}|${a.rank}`,
          champion: a.champion,
          role: a.role,
          patch: a.patch,
          rank: a.rank,
          games: a.games,
          wins: a.wins,
          pickRate: a.pickRate,
          banRate: a.banRate ?? null,
        })),
      );
    }
  }

  console.log(
    `Seeded ${allItems().length} items, ${allChampions().length} champions, ${buildCount} builds across ${champions.length} champions.`,
  );
  await closeDb();
}

main().catch(async (err) => {
  console.error("db:seed failed:", err);
  await closeDb();
  process.exit(1);
});
