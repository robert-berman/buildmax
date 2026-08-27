// In-memory StatsProvider backed by the authored seed dataset. Runs with zero
// setup (no database, no API key) and expands the compact seed builds into full
// BuildStat rows exactly like the Postgres provider would return.

import { PATCH } from "@/data/ddragon";
import { SEED_BUILDS, type SeedBuild } from "./seed-data";
import type {
  BuildStat,
  ChampionRoleAgg,
  RankBracket,
  Role,
  StatsMeta,
  StatsProvider,
  StatsQuery,
} from "./types";

const RANK: RankBracket = "EMERALD_PLUS";
const REGION = "world";

const champRoleKey = (champion: string, role: Role) => `${champion}|${role}`;

class SeedStatsProvider implements StatsProvider {
  readonly name = "seed";
  private readonly buildsByChampRole = new Map<string, BuildStat[]>();
  private readonly aggsByChampion = new Map<string, ChampionRoleAgg[]>();

  constructor() {
    this.hydrate();
  }

  private hydrate(): void {
    const groups = new Map<string, SeedBuild[]>();
    const champTotalGames = new Map<string, number>();

    for (const b of SEED_BUILDS) {
      const k = champRoleKey(b.champion, b.role);
      const list = groups.get(k);
      if (list) list.push(b);
      else groups.set(k, [b]);
      champTotalGames.set(b.champion, (champTotalGames.get(b.champion) ?? 0) + b.games);
    }

    for (const [k, builds] of groups) {
      const totalRoleGames = builds.reduce((sum, b) => sum + b.games, 0);
      const [champion, role] = k.split("|") as [string, Role];

      const rows: BuildStat[] = builds.map((b, i) => ({
        id: `${b.champion}-${b.role}-${i}`,
        champion: b.champion,
        role: b.role,
        patch: PATCH,
        rank: RANK,
        region: REGION,
        items: b.items,
        boots: b.boots,
        games: b.games,
        wins: Math.round(b.games * b.winRate),
        pickRate: b.games / totalRoleGames,
        gameStage: b.gameStage,
      }));
      this.buildsByChampRole.set(k, rows);

      const roleWins = rows.reduce((sum, r) => sum + r.wins, 0);
      const agg: ChampionRoleAgg = {
        champion,
        role,
        patch: PATCH,
        rank: RANK,
        games: totalRoleGames,
        wins: roleWins,
        pickRate: totalRoleGames / (champTotalGames.get(champion) ?? totalRoleGames),
      };
      const arr = this.aggsByChampion.get(champion) ?? [];
      arr.push(agg);
      this.aggsByChampion.set(champion, arr);
    }
  }

  async getBuilds(query: StatsQuery): Promise<BuildStat[]> {
    if (query.role) {
      return this.buildsByChampRole.get(champRoleKey(query.champion, query.role)) ?? [];
    }
    const out: BuildStat[] = [];
    for (const [k, rows] of this.buildsByChampRole) {
      if (k.startsWith(`${query.champion}|`)) out.push(...rows);
    }
    return out;
  }

  async getChampionRoleAggs(champion: string): Promise<ChampionRoleAgg[]> {
    return this.aggsByChampion.get(champion) ?? [];
  }

  async getMeta(): Promise<StatsMeta> {
    return {
      provider: this.name,
      patch: PATCH,
      rank: RANK,
      live: false,
      sampleNote:
        "Representative sample data (not live-ingested). Structured identically to real match-v5 aggregation, so the ranking is genuine.",
    };
  }
}

let singleton: SeedStatsProvider | null = null;

export function getSeedProvider(): StatsProvider {
  return (singleton ??= new SeedStatsProvider());
}
