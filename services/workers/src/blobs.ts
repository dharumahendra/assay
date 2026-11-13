import { BLOB_MAX_CHARS, canonicalJson, HEX64, sha256Hex, type BlobKind } from "@juri/shared";
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import type { Db } from "./db/index.js";

/**
 * Content-addressed blob store (D7, FR-C5, FR-E9): file `<BLOB_DIR>/<sha256>` + row in `blobs`.
 * The hash is over the exact stored bytes, so anyone can recompute it (NFR-VERIF-2).
 */
export class BlobError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: 400 | 404 | 413 = 400,
  ) {
    super(message);
  }
}

export interface StoredBlob {
  sha256: string;
  size: number;
  kind: BlobKind;
  content_type: string;
}

export function encodeBlob(kind: BlobKind, content: unknown): { body: string; contentType: string } {
  const isText = typeof content === "string";
  const body = isText ? content : canonicalJson(content);
  if (body.length > BLOB_MAX_CHARS[kind])
    throw new BlobError("too_large", `${kind} blob exceeds ${BLOB_MAX_CHARS[kind]} characters`, 413);
  return { body, contentType: isText ? "text/plain; charset=utf-8" : "application/json" };
}

export function putBlob(db: Db, dir: string, kind: BlobKind, content: unknown, now = new Date()): StoredBlob {
  const { body, contentType } = encodeBlob(kind, content);
  const bytes = Buffer.from(body, "utf8");
  const sha = sha256Hex(bytes);
  mkdirSync(dir, { recursive: true });
  const path = resolve(dir, sha);
  if (!existsSync(path)) writeFileSync(path, bytes);
  db.$client
    .prepare(
      `INSERT INTO blobs (sha256, kind, size, content_type, path, created_at) VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(sha256) DO NOTHING`,
    )
    .run(sha, kind, bytes.length, contentType, sha, now.toISOString());
  const row = db.$client.prepare(`SELECT kind, content_type FROM blobs WHERE sha256 = ?`).get(sha) as {
    kind: BlobKind;
    content_type: string;
  };
  return { sha256: sha, size: bytes.length, kind: row.kind, content_type: row.content_type };
}

export function getBlob(db: Db, dir: string, sha: string): { bytes: Buffer; contentType: string } {
  if (!HEX64.test(sha)) throw new BlobError("invalid_hash", "sha256 must be 64 lowercase hex characters");
  const row = db.$client.prepare(`SELECT content_type, path FROM blobs WHERE sha256 = ?`).get(sha) as
    | { content_type: string; path: string }
    | undefined;
  if (!row) throw new BlobError("not_found", "blob not found", 404);
  let bytes: Buffer;
  try {
    bytes = readFileSync(resolve(dir, row.path));
  } catch {
    throw new BlobError("not_found", "blob file missing", 404);
  }
  if (sha256Hex(bytes) !== sha) throw new BlobError("hash_mismatch", "stored blob does not match its hash", 404);
  return { bytes, contentType: row.content_type };
}
