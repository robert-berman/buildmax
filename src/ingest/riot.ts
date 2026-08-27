// Minimal, rate-limited Riot API client for the ingestion pipeline.
// Dev keys allow ~20 req/s and 100 req/2min; the 2-minute cap is the binding
// constraint, so we space requests ~1.3s apart and honor 429 Retry-After.
// Never log or commit the key (read from process.env; .env is gitignored).

const KEY = process.env.RIOT_API_KEY ?? "";
export const PLATFORM = process.env.RIOT_PLATFORM ?? "na1"; // na1, euw1, kr, ...
export const REGION = process.env.RIOT_REGION ?? "americas"; // americas, europe, asia
const MIN_SPACING_MS = Number(process.env.RIOT_MIN_SPACING_MS ?? 1300);

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

let lastRequest = 0;
async function throttle(): Promise<void> {
  const now = Date.now();
  const wait = Math.max(0, lastRequest + MIN_SPACING_MS - now);
  if (wait > 0) await sleep(wait);
  lastRequest = Date.now();
}

export function assertKey(): void {
  if (!KEY) throw new Error("RIOT_API_KEY is not set (add it to .env).");
}

async function api<T>(url: string): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    await throttle();
    const res = await fetch(url, { headers: { "X-Riot-Token": KEY } });
    if (res.status === 429) {
      const retryAfter = Number(res.headers.get("retry-after") ?? "5");
      console.log(`  rate limited (429), waiting ${retryAfter + 1}s...`);
      await sleep((retryAfter + 1) * 1000);
      continue;
    }
    if (res.status >= 500 && attempt < 3) {
      await sleep(2000 * (attempt + 1));
      continue;
    }
    if (!res.ok) {
      const body = (await res.text()).slice(0, 200);
      throw new Error(`${res.status} ${res.statusText} :: ${url} :: ${body}`);
    }
    return (await res.json()) as T;
  }
}

interface LeagueEntry {
  puuid?: string;
  leaguePoints: number;
}
interface LeagueList {
  entries: LeagueEntry[];
}

const APEX = ["challenger", "grandmaster", "master"] as const;

/** Collect unique PUUIDs from the apex ranked-solo ladders on the platform. */
export async function getApexPuuids(limit: number): Promise<string[]> {
  const seen = new Set<string>();
  for (const tier of APEX) {
    if (seen.size >= limit) break;
    const list = await api<LeagueList>(
      `https://${PLATFORM}.api.riotgames.com/lol/league/v4/${tier}leagues/by-queue/RANKED_SOLO_5x5`,
    );
    const entries = [...(list.entries ?? [])].sort((a, b) => b.leaguePoints - a.leaguePoints);
    for (const e of entries) {
      if (e.puuid) seen.add(e.puuid);
      if (seen.size >= limit) break;
    }
    console.log(`  ${tier}: pool now ${seen.size} puuids`);
  }
  return [...seen].slice(0, limit);
}

/** Recent ranked-solo (queue 420) match ids for a player. */
export async function getMatchIds(puuid: string, count: number): Promise<string[]> {
  return api<string[]>(
    `https://${REGION}.api.riotgames.com/lol/match/v5/matches/by-puuid/${puuid}/ids?queue=420&type=ranked&start=0&count=${count}`,
  );
}

export interface MatchParticipant {
  championId: number;
  championName: string;
  teamPosition: string; // TOP/JUNGLE/MIDDLE/BOTTOM/UTILITY
  win: boolean;
  item0: number; item1: number; item2: number; item3: number; item4: number; item5: number; item6: number;
}
export interface MatchDto {
  info: {
    gameVersion: string;
    queueId: number;
    gameDuration: number;
    participants: MatchParticipant[];
  };
}

export async function getMatch(matchId: string): Promise<MatchDto> {
  return api<MatchDto>(`https://${REGION}.api.riotgames.com/lol/match/v5/matches/${matchId}`);
}
