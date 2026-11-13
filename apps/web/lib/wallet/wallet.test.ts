import { canonicalHash, canonicalJson as sharedCanonical } from "@juri/shared";
import { describe, expect, it } from "vitest";
import { marketIdFrom } from "../../components/wizard/draft";
import { explainError } from "./errors";
import { canonicalJson, formatNear, isAccountId, mulBps, outcomeValue, parseNear, sha256Hex } from "./near";

const feeSplit = (amount: bigint, p: { fee_bps: number; jury_share_bps: number }) => {
  const fee = mulBps(amount, p.fee_bps);
  const pool = mulBps(fee, p.jury_share_bps);
  return { fee, pool, treasury: fee - pool, net: amount - fee };
};

const NEAR = 10n ** 24n;

describe("yocto math", () => {
  it("parses decimals", () => {
    expect(parseNear("5")).toBe(5n * NEAR);
    expect(parseNear("0.1")).toBe(NEAR / 10n);
    expect(parseNear("1.000000000000000000000001")).toBe(NEAR + 1n);
    expect(parseNear("abc")).toBeNull();
    expect(parseNear("1.2.3")).toBeNull();
  });
  it("formats rounding down", () => {
    expect(formatNear(4_850_000_000_000_000_000_000_000n)).toBe("4.85");
    expect(formatNear("1999999999999999999999999", 2)).toBe("1.99");
    expect(formatNear(12_345n * NEAR, 0)).toBe("12,345");
  });
  it("splits the fee like the contract (3%, 80% to jury)", () => {
    const s = feeSplit(5n * NEAR, { fee_bps: 300, jury_share_bps: 8000 });
    expect(formatNear(s.fee, 4)).toBe("0.1500");
    expect(formatNear(s.pool, 4)).toBe("0.1200");
    expect(formatNear(s.treasury, 4)).toBe("0.0300");
    expect(formatNear(s.net, 4)).toBe("4.8500");
  });
});

describe("criteria hash parity", () => {
  it("matches packages/shared canonical JSON and sha256", async () => {
    const doc = { version: "1", source: { type: "text", title: "Ünïcode ✓" }, criteria: [{ id: "C1", text: "a", kind: "MUST", method: "llm", rule: null, rationale: "" }], b: undefined, z: [1, null] };
    expect(canonicalJson(doc)).toBe(sharedCanonical(doc));
    expect(await sha256Hex(canonicalJson(doc))).toBe(canonicalHash(doc));
  });
});

describe("inputs", () => {
  it("validates account ids", () => {
    expect(isAccountId("demo-worker-honest.juri-assay-jdir.testnet")).toBe(true);
    expect(isAccountId("Bad.testnet")).toBe(false);
    expect(isAccountId("a")).toBe(false);
  });
  it("extracts market job ids", () => {
    expect(marketIdFrom("https://market.near.ai/jobs/A3672345-9E1C-4F0B-B7D2-51C0E8A4F913")).toBe("a3672345-9e1c-4f0b-b7d2-51c0e8a4f913");
    expect(marketIdFrom("nope")).toBeNull();
  });
});

describe("errors", () => {
  it("maps contract panics", () => {
    const e = explainError(new Error('{"ActionError":{"kind":{"FunctionCallError":{"ExecutionError":"Smart contract panicked: E13: InsufficientDeposit"}}}}'));
    expect(e.code).toBe("E13");
    expect(e.title).toMatch(/deposit/i);
  });
  it("recognises a cancelled wallet prompt", () => {
    expect(explainError(new Error("User rejected the request")).cancelled).toBe(true);
  });
  it("reads create_job's return value", () => {
    expect(outcomeValue<number>({ status: { SuccessValue: btoa("12") } })).toBe(12);
    expect(outcomeValue({ status: { Failure: {} } })).toBeNull();
  });
});
