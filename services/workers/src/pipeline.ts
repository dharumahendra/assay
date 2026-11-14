import { eq } from "drizzle-orm";
import { basename } from "node:path";
import type { Db } from "./db/index.js";
import { marketAgents, snapshots } from "./db/schema.js";
import { computeMetrics, type MetricRow } from "./metrics.js";
import { importSnapshot, latestSnapshotFile } from "./snapshot.js";
import { runTrustEngine, type TrustEngineResult } from "./trust/engine.js";

/**
 * P1 → P2 glue. Everything derived from the raw tables (metrics, identity mapping, patterns,
 * Trust Scores) is recomputed here, so LIVE (after sync) and SNAPSHOT (after import) produce the
 * same outputs from the same raw data (05 §1: trust-engine runs after every sync).
 */
export interface DeriveResult {
  metrics: MetricRow[];
  trust: TrustEngineResult;
}

export function derive(db: Db): DeriveResult {
  const metrics = computeMetrics(db);
  const trust = runTrustEngine(db);
  return { metrics, trust };
}

/** Imports a snapshot (latest by default) and derives everything from it. */
export function loadSnapshot(db: Db, file = latestSnapshotFile()): DeriveResult & { file: string; sha256: string } {
  if (!file) throw new Error("no snapshot file found in data/snapshots");
  const { sha256 } = importSnapshot(db, file);
  return { file, sha256, ...derive(db) };
}

/**
 * The committed snapshot this database should serve in SNAPSHOT mode, or null when it already has it.
 * A persistent volume (Railway) keeps the database across deploys, so a newer committed snapshot must be
 * picked up at start, not only on an empty database. Snapshot rows are matched by file name.
 */
export function pendingSnapshot(db: Db, file = latestSnapshotFile()): string | null {
  if (!file) return null;
  if (isEmpty(db)) return file;
  const loaded = db.select({ file: snapshots.file }).from(snapshots).where(eq(snapshots.file, basename(file))).get();
  return loaded ? null : file;
}

/** True when the raw market tables are empty (fresh clone / new DB). */
export function isEmpty(db: Db): boolean {
  return !db.select({ id: marketAgents.id }).from(marketAgents).limit(1).get();
}
