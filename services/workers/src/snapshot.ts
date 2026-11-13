import { canonicalJson, sha256Hex } from "@juri/shared";
import { getTableName, type Table } from "drizzle-orm";
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { basename, resolve } from "node:path";
import { REPO_ROOT, type Db } from "./db/index.js";
import {
  escrowTransfers,
  escrowTxns,
  marketAgents,
  marketReputation,
  platformStats,
  snapshots,
  sourceFacts,
} from "./db/schema.js";

/**
 * FR-A4: snapshot of the real data the app needs to run without network/API keys.
 * File: data/snapshots/<ISO>.json (canonical JSON) + <file>.sha256.
 * escrow_txns.raw_json is dropped to keep the file small; decoded legs are in escrow_transfers.
 */
export const SNAPSHOT_VERSION = 1;
const SNAP_DIR = resolve(REPO_ROOT, "data/snapshots");

const TABLES: { table: Table; strip?: string[] }[] = [
  { table: platformStats },
  { table: marketAgents },
  { table: marketReputation },
  { table: escrowTxns, strip: ["raw_json"] },
  { table: escrowTransfers },
  { table: sourceFacts },
];

export interface SnapshotFile {
  version: number;
  taken_at: string;
  tables: Record<string, Record<string, unknown>[]>;
}

export function exportSnapshot(db: Db, dir = SNAP_DIR): { file: string; sha256: string; rows: Record<string, number> } {
  const takenAt = new Date().toISOString();
  const tables: SnapshotFile["tables"] = {};
  const rows: Record<string, number> = {};
  for (const { table, strip = [] } of TABLES) {
    const name = getTableName(table);
    const data = db.$client.prepare(`SELECT * FROM "${name}" ORDER BY rowid`).all() as Record<string, unknown>[];
    tables[name] = data.map((r) => {
      for (const k of strip) delete r[k];
      return r;
    });
    rows[name] = data.length;
  }
  const body = canonicalJson({ version: SNAPSHOT_VERSION, taken_at: takenAt, tables } satisfies SnapshotFile);
  const sha = sha256Hex(body);
  mkdirSync(dir, { recursive: true });
  const file = resolve(dir, `${takenAt.replace(/[:.]/g, "-")}.json`);
  writeFileSync(file, body);
  writeFileSync(`${file}.sha256`, `${sha}  ${basename(file)}\n`);
  db.insert(snapshots).values({ id: takenAt, file: basename(file), sha256: sha, takenAt }).run();
  return { file, sha256: sha, rows };
}

export function latestSnapshotFile(dir = SNAP_DIR): string | null {
  try {
    const files = readdirSync(dir).filter((f) => f.endsWith(".json")).sort();
    return files.length ? resolve(dir, files[files.length - 1]!) : null;
  } catch {
    return null;
  }
}

/** Replaces the snapshot tables with the file's contents after checking its sha256. */
export function importSnapshot(db: Db, file: string): { sha256: string; rows: Record<string, number> } {
  const body = readFileSync(file, "utf8");
  const sha = sha256Hex(body);
  let expected: string | undefined;
  try {
    expected = readFileSync(`${file}.sha256`, "utf8").split(/\s+/)[0];
  } catch {
    /* no sidecar: accept, but report the hash */
  }
  if (expected && expected !== sha) throw new Error(`snapshot sha256 mismatch: file ${sha}, sidecar ${expected}`);
  const snap = JSON.parse(body) as SnapshotFile;
  if (snap.version !== SNAPSHOT_VERSION) throw new Error(`unsupported snapshot version ${snap.version}`);
  const rows: Record<string, number> = {};
  db.$client.transaction(() => {
    for (const { table, strip = [] } of TABLES) {
      const name = getTableName(table);
      const data = snap.tables[name] ?? [];
      db.$client.prepare(`DELETE FROM "${name}"`).run();
      for (const r of data) {
        for (const k of strip) r[k] = r[k] ?? "{}"; // NOT NULL columns dropped on export
        const cols = Object.keys(r);
        db.$client
          .prepare(`INSERT INTO "${name}" (${cols.map((c) => `"${c}"`).join(",")}) VALUES (${cols.map(() => "?").join(",")})`)
          .run(...cols.map((c) => r[c] as never));
      }
      rows[name] = data.length;
    }
    db.$client
      .prepare(`INSERT OR REPLACE INTO snapshots (id, file, sha256, taken_at) VALUES (?, ?, ?, ?)`)
      .run(snap.taken_at, basename(file), sha, snap.taken_at);
  })();
  return { sha256: sha, rows };
}
