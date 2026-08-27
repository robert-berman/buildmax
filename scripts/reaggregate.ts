// Re-derive build_stats / champion_role_agg / item_pair_stats from the stored
// raw_participants layer, WITHOUT hitting the Riot API. Use this to re-tune
// aggregation (grouping, thresholds) after changing src/ingest/aggregate.ts.
//   npm run reaggregate
import "dotenv/config";
import { PLATFORM } from "@/ingest/riot";
import { aggregateParticipants, type ParticipantExtract } from "@/ingest/aggregate";
import { getDb } from "@/db/client";
import { buildStats, championRoleAgg, itemPairStats, rawParticipants } from "@/db/schema";
import type { Role } from "@/data/stats/types";

const RANK = "MASTER_PLUS";

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

async function main() {
  const db = getDb();
  const allRaw = await db.select().from(rawParticipants);
  const extracts: ParticipantExtract[] = allRaw.map((r) => ({
    patch: r.patch, champion: r.champion, role: r.role as Role, win: r.win, items: r.items, boots: r.boots ?? null,
  }));
  const { buildRows, aggRows, pairRows, stats } = aggregateParticipants(extracts, { rank: RANK, region: PLATFORM });
  console.log(`raw=${allRaw.length} used=${stats.participantsUsed} patches=${stats.patches.join(",")}`);
  console.log(`builds=${buildRows.length} aggs=${aggRows.length} pairs=${pairRows.length}`);

  await db.delete(buildStats);
  await db.delete(championRoleAgg);
  await db.delete(itemPairStats);
  for (const c of chunk(buildRows, 500)) if (c.length) await db.insert(buildStats).values(c);
  for (const c of chunk(aggRows, 500)) if (c.length) await db.insert(championRoleAgg).values(c);
  for (const c of chunk(pairRows, 500)) if (c.length) await db.insert(itemPairStats).values(c);

  console.log("reaggregate done");
  process.exit(0);
}

main().catch((err) => {
  console.error("reaggregate failed:", err);
  process.exit(1);
});
