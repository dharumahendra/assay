import { eq } from "drizzle-orm";
import type { Db } from "./db/index.js";
import { syncState } from "./db/schema.js";

export function getCursor(db: Db, source: string): string | null {
  return db.select().from(syncState).where(eq(syncState.source, source)).get()?.cursor ?? null;
}

/** Runs `fn`, recording last_run_at / last_ok_at / error for `source` (FR-A1). */
export async function tracked<T>(db: Db, source: string, fn: () => Promise<T>): Promise<T> {
  const now = new Date().toISOString();
  db.insert(syncState)
    .values({ source, lastRunAt: now })
    .onConflictDoUpdate({ target: syncState.source, set: { lastRunAt: now } })
    .run();
  try {
    const out = await fn();
    db.update(syncState)
      .set({ lastOkAt: new Date().toISOString(), error: null })
      .where(eq(syncState.source, source))
      .run();
    return out;
  } catch (e) {
    db.update(syncState)
      .set({ error: e instanceof Error ? e.message : String(e) })
      .where(eq(syncState.source, source))
      .run();
    throw e;
  }
}

export function setCursor(db: Db, source: string, cursor: string | null): void {
  db.insert(syncState)
    .values({ source, cursor })
    .onConflictDoUpdate({ target: syncState.source, set: { cursor } })
    .run();
}
