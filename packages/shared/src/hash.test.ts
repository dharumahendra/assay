import { describe, expect, it } from "vitest";
import { canonicalHash, canonicalJson, sha256Hex } from "./hash.js";
import { buildCommitment, commitmentPreimage } from "./commitment.js";

describe("canonicalJson", () => {
  it("sorts keys recursively and strips whitespace", () => {
    expect(canonicalJson({ b: 1, a: { d: [3, { y: 1, x: 2 }], c: "é" } })).toBe(
      '{"a":{"c":"é","d":[3,{"x":2,"y":1}]},"b":1}',
    );
  });
  it("is stable under key order", () => {
    expect(canonicalHash({ a: 1, b: 2 })).toBe(canonicalHash({ b: 2, a: 1 }));
  });
  it("rejects non-finite numbers", () => {
    expect(() => canonicalJson({ a: Number.NaN })).toThrow();
  });
});

describe("sha256Hex", () => {
  it("matches a known vector", () => {
    expect(sha256Hex("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });
});

// Shared vector with the Rust contract unit test (04 §5). Do not change without updating Rust.
export const COMMITMENT_VECTOR = {
  input: {
    jobId: 7,
    verifierId: "v2.juri.alice.testnet",
    verdicts: [1, 1, 0, 2] as (0 | 1 | 2)[],
    injectionFlag: false,
    evidenceHash: sha256Hex("evidence"),
    saltHex: sha256Hex("salt"),
  },
};

describe("commitment", () => {
  it("builds the preimage in spec order", () => {
    expect(commitmentPreimage(COMMITMENT_VECTOR.input)).toBe(
      `7|v2.juri.alice.testnet|1,1,0,2|0|${sha256Hex("evidence")}|${sha256Hex("salt")}`,
    );
  });
  it("hashes the preimage", () => {
    const c = buildCommitment(COMMITMENT_VECTOR.input);
    expect(c).toMatch(/^[0-9a-f]{64}$/);
    expect(c).toBe(sha256Hex(commitmentPreimage(COMMITMENT_VECTOR.input)));
  });
  it("rejects a bad salt", () => {
    expect(() => buildCommitment({ ...COMMITMENT_VECTOR.input, saltHex: "xyz" })).toThrow();
  });
});
