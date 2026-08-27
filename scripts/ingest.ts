// Real ingestion pipeline (incremental + deduped):
//   crawl apex ladders -> collect candidate match ids -> SKIP ids already in
//   processed_matches (no wasted API budget) -> fetch only new matches -> store
//   raw participant rows -> recompute build_stats / champion_role_agg /
//   item_pair_stats from ALL stored raw rows.
// Run with a valid RIOT_API_KEY in .env:  npm run ingest
import "dotenv/config";
import { inArray } from "drizzle-orm";
import { PLATFORM, assertKey, getApexPuuids, getMatch, getMatchIds } from "@/ingest/riot";
import { aggregateParticipants, extractParticipants, patchFromVersion, type ParticipantExtract } from "@/ingest/aggregate";
import { closeDb, getDb } from "@/db/client";
import { buildStats, championRoleAgg, itemPairStats, processedMatches, rawParticipants } from "@/db/schema";
import type { Role } from "@/data/stats/types";

const PLAYERS = Number(process.env.INGEST_PLAYERS ?? 40);
const IDS_PER_PLAYER = Number(process.env.INGEST_IDS_PER_PLAYER ?? 20);
const MAX_MATCHES = Number(process.env.INGEST_MAX_MATCHES ?? 300);
const RANK = "MASTER_PLUS";

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

async function main() {
  assertKey();
  const t0 = Date.now();
  const db = getDb();
  console.log(`Ingest start: platform=${PLATFORM} players=${PLAYERS} idsPerPlayer=${IDS_PER_PLAYER} maxMatches=${MAX_MATCHES}`);

  console.log("1/5 collecting apex puuids...");
  const puuids = await getApexPuuids(PLAYERS);
  console.log(`   got ${puuids.length} puuids`);

  console.log("2/5 collecting candidate match ids...");
  const candidates = new Set<string>();
  for (const puuid of puuids) {
    if (candidates.size >= MAX_MATCHES) break;
    try {
      for (const id of await getMatchIds(puuid, IDS_PER_PLAYER)) candidates.add(id);
    } catch (e) {
      console.log(`   matchIds error (skipping player): ${(e as Error).message}`);
    }
  }
  const candidateIds = [...candidates].slice(0, MAX_MATCHES);
  console.log(`   ${candidateIds.length} candidate match ids`);

  // Dedupe against previously-ingested matches.
  const already = new Set<string>();
  for (const c of chunk(candidateIds, 200)) {
    const existing = await db.select({ m: processedMatches.matchId }).from(processedMatches).where(inArray(processedMatches.matchId, c));
    for (const row of existing) already.add(row.m);
  }
  const newIds = candidateIds.filter((id) => !already.has(id));
  console.log(`   ${newIds.length} new (skipping ${already.size} already ingested)`);

  console.log("3/5 pulling new matches...");
  const rawRows: (typeof rawParticipants.$inferInsert)[] = [];
  const processedRows: (typeof processedMatches.$inferInsert)[] = [];
  for (let i = 0; i < newIds.length; i++) {
    const matchId = newIds[i];
    try {
      const match = await getMatch(matchId);
      const patch = patchFromVersion(match.info.gameVersion);
      const extracts = extractParticipants(match);
      extracts.forEach((e, idx) => {
        rawRows.push({ id: `${matchId}:${idx}`, matchId, patch: e.patch, champion: e.champion, role: e.role, win: e.win, items: e.items, boots: e.boots });
      });
      processedRows.push({ matchId, patch });
    } catch (e) {
      console.log(`   match error (skipping): ${(e as Error).message}`);
    }
    if ((i + 1) % 25 === 0) console.log(`   fetched ${i + 1}/${newIds.length}`);
  }
  console.log(`   extracted ${rawRows.length} participant rows from ${processedRows.length} matches`);

  console.log("4/5 storing raw rows...");
  for (const c of chunk(rawRows, 500)) if (c.length) await db.insert(rawParticipants).values(c).onConflictDoNothing();
  for (const c of chunk(processedRows, 500)) if (c.length) await db.insert(processedMatches).values(c).onConflictDoNothing();

  console.log("5/5 recomputing aggregates from ALL stored raw rows...");
  const allRaw = await db.select().from(rawParticipants);
  const extracts: ParticipantExtract[] = allRaw.map((r) => ({
    patch: r.patch, champion: r.champion, role: r.role as Role, win: r.win, items: r.items, boots: r.boots ?? null,
  }));
  const { buildRows, aggRows, pairRows, stats } = aggregateParticipants(extracts, { rank: RANK, region: PLATFORM });
  console.log(`   raw pool: ${allRaw.length} participants | participantsUsed=${stats.participantsUsed} patches=${stats.patches.join(",")}`);
  console.log(`   rows: builds=${buildRows.length} aggs=${aggRows.length} pairs=${pairRows.length}`);

  await db.delete(buildStats);
  await db.delete(championRoleAgg);
  await db.delete(itemPairStats);
  for (const c of chunk(buildRows, 500)) if (c.length) await db.insert(buildStats).values(c);
  for (const c of chunk(aggRows, 500)) if (c.length) await db.insert(championRoleAgg).values(c);
  for (const c of chunk(pairRows, 500)) if (c.length) await db.insert(itemPairStats).values(c);

  console.log(`Done in ${((Date.now() - t0) / 1000).toFixed(0)}s. Set STATS_PROVIDER=postgres to serve this data.`);
  await closeDb();
}

main().catch(async (err) => {
  console.error("ingest failed:", err);
  await closeDb();
  process.exit(1);
});
