import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  CHANGE_METHODS,
  CONTRACT_ERRORS,
  ContractParamsSchema,
  KEEPER_METHODS,
  VERIFIER_METHODS,
  VIEW_METHODS,
  formatNear,
  parseContractError,
  parseJuriEvents,
  parseNear,
} from "./contract.js";

const root = new URL("../../../", import.meta.url);
const abi = JSON.parse(readFileSync(new URL("contracts/juri/abi/juri.abi.json", root), "utf8")) as {
  body: { functions: { name: string; kind: "view" | "call"; modifiers?: string[] }[] };
};
const rustTypes = readFileSync(new URL("contracts/juri/src/types.rs", root), "utf8");

/** NFR-MAINT-2: the committed ABI and this file must agree. */
describe("contract interface ↔ ABI", () => {
  const fns = new Map(abi.body.functions.map((f) => [f.name, f]));

  it("every TS method exists in the ABI with the right kind", () => {
    for (const m of CHANGE_METHODS) expect(fns.get(m)?.kind, m).toBe("call");
    for (const m of VIEW_METHODS) expect(fns.get(m)?.kind, m).toBe("view");
  });

  it("every public ABI method is listed in TS (private callbacks excluded)", () => {
    const listed = new Set<string>([...CHANGE_METHODS, ...VIEW_METHODS, "contract_source_metadata"]);
    const missing = abi.body.functions.filter((f) => !f.modifiers?.includes("private") && !listed.has(f.name));
    expect(missing.map((f) => f.name)).toEqual([]);
  });

  it("FCAK scopes are real change methods", () => {
    for (const m of [...VERIFIER_METHODS, ...KEEPER_METHODS]) expect(CHANGE_METHODS).toContain(m);
    expect(rustTypes).toContain(`VERIFIER_METHODS: &str = "${VERIFIER_METHODS.join(",")}"`);
  });

  it("error codes match contracts/juri/src/types.rs", () => {
    const rust = [...rustTypes.matchAll(/pub const (E\d{2}): &str = "\1: (\w+)";/g)].map((m) => [m[1], m[2]]);
    expect(rust.length).toBeGreaterThan(20);
    expect(rust).toEqual(Object.entries(CONTRACT_ERRORS).map(([k, v]) => [k, v.name]));
  });
});

describe("helpers", () => {
  it("maps contract panics to friendly messages", () => {
    const e = parseContractError(new Error('Smart contract panicked: E10: CommitmentMismatch'));
    expect(e).toMatchObject({ code: "E10", name: "CommitmentMismatch" });
    expect(parseContractError("something else")).toBeNull();
  });

  it("parses NEP-297 events", () => {
    const ev = parseJuriEvents([
      "noise",
      'EVENT_JSON:{"standard":"juri","version":"1.0.0","event":"job_created","data":[{"job_id":1}]}',
      'EVENT_JSON:{"standard":"nep141","version":"1.0.0","event":"ft_transfer","data":[]}',
    ]);
    expect(ev.map((e) => e.event)).toEqual(["job_created"]);
  });

  it("converts NEAR amounts without float errors", () => {
    expect(parseNear("1.5")).toBe("1500000000000000000000000");
    expect(parseNear("0.1")).toBe("100000000000000000000000");
    expect(formatNear("9700000000000000000000000", 2)).toBe("9.70");
    expect(formatNear(parseNear("123.456789"), 4)).toBe("123.4567");
    expect(() => parseNear("1e3")).toThrow();
  });

  it("default params shape parses", () => {
    ContractParamsSchema.parse({
      fee_bps: 300,
      jury_share_bps: 8000,
      jury_size: 3,
      commit_secs: 180,
      reveal_secs: 180,
      min_stake: "1000000000000000000000000",
      verifier_seed_balance: "500000000000000000000000",
      min_amount: "100000000000000000000000",
      max_criteria: 13,
      max_restarts: 1,
    });
  });
});
