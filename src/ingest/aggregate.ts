// Two-stage aggregation:
//   1) extractParticipants(match) -> compact per-player rows (the durable "raw" layer)
//   2) aggregateParticipants(rows) -> build_stats / champion_role_agg / item_pair_stats
// Aggregating from stored raw rows means we can re-tune grouping/thresholds
// without re-crawling. Builds are grouped by their CORE (top-3 by cost) items so
// samples don't fragment across every situational 5th/6th item.
//
// Grouping is strictly PER-PATCH: item and champion balance changes between
// patches, so mixing patches would corrupt the numbers. At dev-key volume this
// makes per-patch builds sparse (expected); a production key fixes that with
// far more games per patch.

import { allChampions, getItem } from "@/data/ddragon";
import type { GameStage, Role } from "@/data/stats/types";
import type { MatchDto } from "./riot";

const champById = new Map<number, string>();
for (const c of allChampions()) champById.set(Number(c.key), c.id);

function roleOf(teamPosition: string): Role | null {
  switch (teamPosition) {
    case "TOP": return "TOP";
    case "JUNGLE": return "JUNGLE";
    case "MIDDLE": return "MIDDLE";
    case "BOTTOM": return "BOTTOM";
    case "UTILITY": return "SUPPORT";
    default: return null;
  }
}

export function patchFromVersion(gameVersion: string): string {
  const parts = gameVersion.split(".");
  return parts.length >= 2 ? `${parts[0]}.${parts[1]}` : gameVersion;
}

export interface ParticipantExtract {
  patch: string; champion: string; role: Role; win: boolean; items: number[]; boots: number | null;
}

/** Compact per-participant rows for the raw layer (completed core items + boots). */
export function extractParticipants(match: MatchDto): ParticipantExtract[] {
  const out: ParticipantExtract[] = [];
  if (!match?.info || match.info.gameDuration < 300) return out;
  const patch = patchFromVersion(match.info.gameVersion);
  for (const p of match.info.participants) {
    const champion = champById.get(p.championId);
    const role = roleOf(p.teamPosition);
    if (!champion || !role) continue;
    const core: number[] = [];
    let boots: number | null = null;
    for (const id of [p.item0, p.item1, p.item2, p.item3, p.item4, p.item5, p.item6]) {
      if (!id) continue;
      const item = getItem(id);
      if (!item) continue;
      if (item.isBoots) boots = item.id;
      else if (item.isCompleted) core.push(item.id);
    }
    if (core.length < 2) continue;
    core.sort((a, b) => a - b);
    out.push({ patch, champion, role, win: p.win, items: core, boots });
  }
  return out;
}

export interface BuildRow {
  id: string; champion: string; role: Role; patch: string; rank: string; region: string;
  items: number[]; boots: number | null; games: number; wins: number; pickRate: number; gameStage: GameStage;
}
export interface AggRow {
  id: string; champion: string; role: Role; patch: string; rank: string;
  games: number; wins: number; pickRate: number; banRate: number | null;
}
export interface PairRow {
  id: string; champion: string; role: Role; patch: string; rank: string;
  itemA: number; itemB: number; games: number; wins: number;
}

/** The build-defining "core": the top-K items by gold cost, id-sorted for a stable key. */
function coreItems(items: number[], k: number): number[] {
  return [...items]
    .sort((a, b) => (getItem(b)?.goldTotal ?? 0) - (getItem(a)?.goldTotal ?? 0))
    .slice(0, k)
    .sort((a, b) => a - b);
}

interface BuildAcc {
  champion: string; role: Role; patch: string; items: number[];
  games: number; wins: number; bootsFreq: Map<number, number>;
}

export interface AggregateResult {
  buildRows: BuildRow[]; aggRows: AggRow[]; pairRows: PairRow[];
  stats: { participantsUsed: number; patches: string[] };
}

export function aggregateParticipants(
  rows: ParticipantExtract[],
  opts: { rank: string; region: string; coreK?: number; minBuildGames?: number; minPairGames?: number },
): AggregateResult {
  const coreK = opts.coreK ?? 3;
  const minBuildGames = opts.minBuildGames ?? 2;
  const minPairGames = opts.minPairGames ?? 3;

  const builds = new Map<string, BuildAcc>();
  const roleGames = new Map<string, { games: number; wins: number }>(); // champion|role|patch
  const champGames = new Map<string, number>(); // champion|patch
  const pairs = new Map<string, PairRow>();
  const patches = new Set<string>();
  let participantsUsed = 0;

  for (const r of rows) {
    const core = coreItems(r.items, coreK);
    if (core.length < 2) continue;
    patches.add(r.patch);
    participantsUsed++;
    const win = r.win ? 1 : 0;

    const buildKey = `${r.champion}|${r.role}|${r.patch}|${core.join(".")}`;
    let acc = builds.get(buildKey);
    if (!acc) {
      acc = { champion: r.champion, role: r.role, patch: r.patch, items: core, games: 0, wins: 0, bootsFreq: new Map() };
      builds.set(buildKey, acc);
    }
    acc.games++; acc.wins += win;
    if (r.boots != null) acc.bootsFreq.set(r.boots, (acc.bootsFreq.get(r.boots) ?? 0) + 1);

    const rk = `${r.champion}|${r.role}|${r.patch}`;
    const rg = roleGames.get(rk) ?? { games: 0, wins: 0 };
    rg.games++; rg.wins += win; roleGames.set(rk, rg);
    const ck = `${r.champion}|${r.patch}`;
    champGames.set(ck, (champGames.get(ck) ?? 0) + 1);

    for (let i = 0; i < core.length; i++) {
      for (let j = i + 1; j < core.length; j++) {
        const pk = `${r.champion}|${r.role}|${r.patch}|${core[i]}.${core[j]}`;
        let pr = pairs.get(pk);
        if (!pr) {
          pr = { id: pk, champion: r.champion, role: r.role, patch: r.patch, rank: opts.rank, itemA: core[i], itemB: core[j], games: 0, wins: 0 };
          pairs.set(pk, pr);
        }
        pr.games++; pr.wins += win;
      }
    }
  }

  const buildRows: BuildRow[] = [];
  for (const acc of builds.values()) {
    if (acc.games < minBuildGames) continue;
    const rg = roleGames.get(`${acc.champion}|${acc.role}|${acc.patch}`)!;
    let boots: number | null = null;
    let bootsMax = 0;
    for (const [b, n] of acc.bootsFreq) if (n > bootsMax) ((bootsMax = n), (boots = b));
    buildRows.push({
      id: `${acc.champion}|${acc.role}|${acc.patch}|${opts.rank}|${acc.items.join(".")}`,
      champion: acc.champion, role: acc.role, patch: acc.patch, rank: opts.rank, region: opts.region,
      items: acc.items, boots, games: acc.games, wins: acc.wins,
      pickRate: rg.games > 0 ? acc.games / rg.games : 0, gameStage: "MID",
    });
  }

  const aggRows: AggRow[] = [];
  for (const [rk, rg] of roleGames) {
    const [champion, role, patch] = rk.split("|") as [string, Role, string];
    const champTotal = champGames.get(`${champion}|${patch}`) ?? rg.games;
    aggRows.push({
      id: `${champion}|${role}|${patch}|${opts.rank}`,
      champion, role, patch, rank: opts.rank, games: rg.games, wins: rg.wins,
      pickRate: champTotal > 0 ? rg.games / champTotal : 0, banRate: null,
    });
  }

  const pairRows = [...pairs.values()].filter((p) => p.games >= minPairGames);
  return { buildRows, aggRows, pairRows, stats: { participantsUsed, patches: [...patches] } };
}
