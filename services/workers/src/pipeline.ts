import type { Db } from "./db/index.js";
import { marketAgents } from "./db/schema.js";
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

/** True when the raw market tables are empty (fresh clone / new DB). */
export function isEmpty(db: Db): boolean {
  return !db.select({ id: marketAgents.id }).from(marketAgents).limit(1).get();
}
