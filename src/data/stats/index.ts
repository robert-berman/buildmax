// Provider selection. Defaults to the zero-setup seed provider; set
// STATS_PROVIDER=postgres (plus DATABASE_URL) to read from the Drizzle/Postgres
// layer. The postgres module is imported lazily so the seed path pulls in no DB
// code, and any DB failure falls back to seed so the app always responds.

import type { StatsProvider } from "./types";
import { getSeedProvider } from "./seed";

export async function getStatsProvider(): Promise<StatsProvider> {
  const which = (process.env.STATS_PROVIDER ?? "seed").toLowerCase();
  if (which === "postgres") {
    try {
      const mod = await import("./postgres");
      return mod.getPostgresProvider();
    } catch (err) {
      console.warn("[stats] postgres provider unavailable, falling back to seed:", (err as Error).message);
    }
  }
  return getSeedProvider();
}

export type { StatsProvider };
