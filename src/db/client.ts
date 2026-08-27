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
  client = postgres(url, { max: 5 });
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
