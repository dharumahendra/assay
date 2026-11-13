import Database from "better-sqlite3";
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import * as schema from "./schema.js";

export type Db = BetterSQLite3Database<typeof schema> & { $client: Database.Database };

const here = dirname(fileURLToPath(import.meta.url));
export const MIGRATIONS_DIR = resolve(here, "../../drizzle");
export const REPO_ROOT = resolve(here, "../../../..");

export function dbPath(): string {
  return resolve(REPO_ROOT, process.env.DB_PATH ?? "data/juri.db");
}

/** Opens (and migrates) the database. `:memory:` is supported for tests. */
export function openDb(path = dbPath()): Db {
  if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
  const sqlite = new Database(path);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  const db = drizzle(sqlite, { schema }) as Db;
  migrate(db, { migrationsFolder: MIGRATIONS_DIR });
  return db;
}

export { schema };
