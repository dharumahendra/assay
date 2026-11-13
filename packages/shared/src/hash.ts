import { createHash } from "node:crypto";

/** Lowercase hex sha256 of a UTF-8 string or bytes. */
export function sha256Hex(input: string | Uint8Array): string {
  return createHash("sha256").update(input).digest("hex");
}

/**
 * Canonical JSON (FR-C5 / 05 §6.1): object keys sorted, no whitespace, UTF-8.
 * Arrays keep their order. `undefined` object members are dropped (like JSON.stringify).
 */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") {
    if (typeof value === "number" && !Number.isFinite(value)) {
      throw new Error("canonicalJson: non-finite number");
    }
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((v) => (v === undefined ? "null" : canonicalJson(v))).join(",")}]`;
  }
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj)
    .filter((k) => obj[k] !== undefined)
    .sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalJson(obj[k])}`).join(",")}}`;
}

export function canonicalHash(value: unknown): string {
  return sha256Hex(canonicalJson(value));
}

export const HEX64 = /^[0-9a-f]{64}$/;
