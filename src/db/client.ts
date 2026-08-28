// Lazily-constructed Drizzle client over postgres.js. The connection is only
// opened the first time getDb() is called, so importing this module is free and
// the seed provider path never touches the database.

import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

type Db = PostgresJsDatabase<typeof schema>;

let db: Db | null = null;
let client: ReturnType<typeof postgres> | null = null;

export function getDb(): Db {
  if (db) return db;
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  // Neon's pooled endpoint (PgBouncer, transaction mode) requires prepared
  // statements OFF and a small per-instance pool, since many serverless
  // instances each hold their own connections. Detected from the "-pooler"
  // host; direct/local connections keep postgres.js defaults. Both overridable.
  const pooled = /pooler/i.test(url);
  client = postgres(url, {
    max: Number(process.env.DB_POOL_MAX ?? (pooled ? 1 : 5)),
    prepare: process.env.DB_PREPARE ? process.env.DB_PREPARE === "true" : !pooled,
    idle_timeout: pooled ? 20 : undefined,
  });
  db = drizzle(client, { schema });
  return db;
}

/** Used by one-shot scripts (seed/migrate) so the process can exit cleanly. */
export async function closeDb(): Promise<void> {
  if (client) {
    await client.end({ timeout: 5 });
    client = null;
    db = null;
  }
}
