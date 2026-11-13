import { TrustViewSchema } from "@juri/shared";
import { describe, expect, it } from "vitest";
import { openDb } from "../db/index.js";
import {
  accountFunders,
  escrowTransfers,
  marketAgents,
  marketBids,
  marketJobs,
  marketReputation,
  patternEdges,
  patterns,
  trustScores,
} from "../db/schema.js";
import { disputesFromReputation, runTrustEngine } from "./engine.js";
import { sharedFunderEdges } from "./funder.js";
import { apiAccountFromRaw, isNearAccount, mapIdentities } from "./identity.js";
import { analyzeCoBidding, bidsPerActiveDay, clusterEdges, isTwin, patternId, type BidLite } from "./patterns.js";
import { ALGO_VERSION, bandFor, computeTrustScore, emptyInputs } from "./score.js";

// ---------- fixtures ----------

const T0 = Date.parse("2026-10-01T10:00:00Z");
const at = (sec: number) => new Date(T0 + sec * 1000).toISOString();
let seq = 0;
const bid = (job: string, agent: string, amount: string | null, eta: number | null, sec: number): BidLite => ({
  id: `b${++seq}`,
  job_id: job,
  agent_id: agent,
  amount,
  eta_seconds: eta,
  created_at: at(sec),
});

/** A and B bid as twins on 3 of 4 shared jobs (75% ≥ 60%); C bids normally. D–E twin on 2 jobs only. */
function fixtureBids(): BidLite[] {
  return [
    bid("j1", "A", "10.00", 3600, 0),
    bid("j1", "B", "10.05", 3600, 120),
    bid("j1", "C", "7", 7200, 50),
    bid("j2", "A", "5", 1800, 1000),
    bid("j2", "B", "5", 1800, 1300),
    bid("j3", "A", "20", 86400, 5000),
    bid("j3", "B", "19.9", 86400, 5500),
    bid("j4", "A", "8", 3600, 9000),
    bid("j4", "B", "12", 3600, 9010), // amount differs → not twin
    bid("j5", "D", "3", 600, 0),
    bid("j5", "E", "3", 600, 10),
    bid("j6", "D", "3", 600, 20000),
    bid("j6", "E", "3", 600, 20005),
  ];
}

// ---------- score ----------

describe("trust score ts-0.2", () => {
  it("uses the documented version", () => {
    expect(ALGO_VERSION).toBe("ts-0.2");
  });

  it("gates agents without bids, payments or deliveries as Insufficient data", () => {
    const r = computeTrustScore({ ...emptyInputs(), n_bids: 2 });
    expect(r).toMatchObject({ score: null, band: "Insufficient data", components: null });
    expect(r.flags).toContain("unmapped");
  });

  it("scores once any delivery is known, even with no visible bids", () => {
    const r = computeTrustScore({ ...emptyInputs(), n_completed: 1, completion_ratio: 1 });
    // 25 + D(15) + H(15) + I(15) − P(0)
    expect(r.score).toBe(70);
    expect(r.components).toEqual({ D: 15, H: 15, I: 15, P: 0 });
    expect(r.band).toBe("Some record");
  });

  it("follows the formula for a full example", () => {
    const r = computeTrustScore({
      ...emptyInputs(),
      n_bids: 40,
      n_completed: 8,
      completion_ratio: 0.8,
      n_paid_onchain: 5,
      n_refund_after_award: 1,
      n_disputed: 1,
      bids_per_active_day: 25,
      twin_ratio_self: 0.5,
      in_cluster: true,
      shared_funder: false,
      mapped: true,
    });
    // D = 30×0.5 + 15×0.8 = 27 ; H = 15×0.5 − 5 = 2.5 ; I = 15 − 10 = 5 ; P = 8 + 5 = 13
    expect(r.components).toEqual({ D: 27, H: 2.5, I: 5, P: 13 });
    expect(r.score).toBe(46.5);
    expect(r.band).toBe("Weak record");
    expect(r.flags).toEqual([]);
  });

  it("caps D, floors H and I at 0, caps P at 25, clamps the score", () => {
    const top = computeTrustScore({
      ...emptyInputs(),
      n_bids: 100,
      n_completed: 50,
      completion_ratio: 1.4, // bad input is clamped
      n_paid_onchain: 99,
      n_refund_after_award: 0,
      mapped: true,
    });
    expect(top.components!.D).toBe(45);
    expect(top.score).toBe(100);
    const bottom = computeTrustScore({
      ...emptyInputs(),
      n_bids: 100,
      n_refund_after_award: 9,
      n_disputed: 9,
      bids_per_active_day: 99,
      twin_ratio_self: 1,
      in_cluster: true,
      shared_funder: true,
    });
    expect(bottom.components).toEqual({ D: 0, H: 0, I: 0, P: 25 });
    expect(bottom.score).toBe(0);
  });

  it("is deterministic", () => {
    const inp = { ...emptyInputs(), n_bids: 7, n_completed: 3, completion_ratio: 0.66, twin_ratio_self: 0.33 };
    expect(computeTrustScore(inp)).toEqual(computeTrustScore(structuredClone(inp)));
  });

  it("maps bands at the boundaries", () => {
    expect(bandFor(null)).toBe("Insufficient data");
    expect(bandFor(75)).toBe("Strong record");
    expect(bandFor(74.99)).toBe("Some record");
    expect(bandFor(50)).toBe("Some record");
    expect(bandFor(49.99)).toBe("Weak record");
    expect(bandFor(0)).toBe("Weak record");
  });
});

// ---------- twin bids + clusters ----------

describe("linked bidding pattern", () => {
  it("applies the twin rule: ≤1% amount, same ETA, ≤600 s, different agents", () => {
    const a = bid("j", "A", "100", 60, 0);
    expect(isTwin(a, bid("j", "B", "101", 60, 600))).toBe(true);
    expect(isTwin(a, bid("j", "B", "101.5", 60, 0))).toBe(false); // 1.48% > 1%
    expect(isTwin(a, bid("j", "B", "100", 61, 0))).toBe(false); // ETA differs
    expect(isTwin(a, bid("j", "B", "100", 60, 601))).toBe(false); // too far apart
    expect(isTwin(a, bid("j", "A", "100", 60, 0))).toBe(false); // same agent
    expect(isTwin(a, bid("k", "B", "100", 60, 0))).toBe(false); // other job
    expect(isTwin(a, bid("j", "B", null, 60, 0))).toBe(false); // unknown amount
  });

  it("builds a co_bid edge only when co_jobs ≥ 3 and twin ratio ≥ 0.6", () => {
    const { edges, twinBidIds } = analyzeCoBidding(fixtureBids());
    expect(edges).toHaveLength(1);
    const e = edges[0]!;
    expect(e).toMatchObject({ a: "A", b: "B", type: "co_bid", co_jobs: 4, twin_jobs: 3 });
    expect(e.evidence.map((x) => [x.job_id, x.twin])).toEqual([
      ["j1", true],
      ["j2", true],
      ["j3", true],
      ["j4", false],
    ]);
    // D–E are twins on 2 jobs: flagged bids, but no edge (co_jobs < 3)
    expect(twinBidIds.size).toBe(6 + 4);
  });

  it("clusters connected components with stable ids", () => {
    const edges = [
      { a: "A", b: "B", type: "co_bid" as const, co_jobs: 3, twin_jobs: 3, evidence: [] },
      { a: "B", b: "C", type: "co_bid" as const, co_jobs: 3, twin_jobs: 2, evidence: [] },
      { a: "X", b: "Y", type: "shared_funder" as const, evidence: { funder: "f", a_account: "x", b_account: "y" } },
    ];
    const cs = clusterEdges(edges);
    expect(cs.map((c) => c.members)).toEqual([["A", "B", "C"], ["X", "Y"]]);
    expect(cs[0]!.edge_count).toBe(2);
    expect(cs[0]!.id).toBe(patternId(["C", "A", "B"]));
    expect(cs[0]!.id).toMatch(/^pat_[0-9a-f]{12}$/);
    expect(clusterEdges([...edges].reverse())).toEqual(cs);
  });

  it("computes bids per active day", () => {
    expect(bidsPerActiveDay([])).toBe(0);
    expect(bidsPerActiveDay(fixtureBids().filter((b) => b.agent_id === "A"))).toBe(4);
  });
});

// ---------- identity + funder ----------

describe("identity mapping", () => {
  it("prefers api, then reward_tx (most frequent, conflicts flagged), else unknown", () => {
    const m = mapIdentities(
      [
        { id: "a1", api_account: "alice.near" },
        { id: "a2", api_account: null },
        { id: "a3", api_account: null },
        { id: "a4", api_account: null },
      ],
      [
        { agent_id: "a1", market_job_id: "j0", reward_to: ["other.near"] },
        { agent_id: "a2", market_job_id: "j1", reward_to: ["bob.near"] },
        { agent_id: "a3", market_job_id: "j2", reward_to: ["c1.near"] },
        { agent_id: "a3", market_job_id: "j3", reward_to: ["c2.near", "c1.near"] },
      ],
    );
    expect(m.get("a1")).toMatchObject({ near_account: "alice.near", mapping_method: "api", conflict: false });
    expect(m.get("a2")).toMatchObject({ near_account: "bob.near", mapping_method: "reward_tx", conflict: false });
    expect(m.get("a3")).toMatchObject({ near_account: "c1.near", candidates: ["c1.near", "c2.near"], conflict: true });
    expect(m.get("a4")).toMatchObject({ near_account: null, mapping_method: "unknown" });
  });

  it("does not mistake market UUIDs for NEAR accounts", () => {
    expect(isNearAccount("2c0ef2b1-0a5c-4f61-9a43-8f1e4b5f2e11")).toBe(false);
    expect(isNearAccount("alice.near")).toBe(true);
    expect(isNearAccount("51500a5a9387af1cf8c1a52028a9ab51c66f36db763ff09bfe1cd7a54027b2ab")).toBe(true);
    expect(apiAccountFromRaw({ owner_account_id: "2c0ef2b1-0a5c-4f61-9a43-8f1e4b5f2e11" })).toBeNull();
    expect(apiAccountFromRaw({ near_account_id: "bob.near" })).toBe("bob.near");
  });
});

describe("shared funder", () => {
  it("links agents with the same first funder, except excluded funders", () => {
    const edges = sharedFunderEdges(
      [
        { account: "x.near", funder: "f.near", excluded: false },
        { account: "y.near", funder: "f.near", excluded: false },
        { account: "z.near", funder: "relay.aurora", excluded: false },
        { account: "w.near", funder: "relay.aurora", excluded: false },
        { account: "v.near", funder: "f.near", excluded: true },
      ],
      new Map([
        ["x.near", ["A"]],
        ["y.near", ["B"]],
        ["z.near", ["C"]],
        ["w.near", ["D"]],
        ["v.near", ["E"]],
      ]),
      new Set(["relay.aurora"]),
    );
    expect(edges).toEqual([
      { a: "A", b: "B", type: "shared_funder", evidence: { funder: "f.near", a_account: "x.near", b_account: "y.near" } },
    ]);
  });
});

// ---------- engine on a seeded in-memory db ----------

describe("trust engine", () => {
  it("estimates disputes from the dispute_free axis", () => {
    expect(disputesFromReputation(100, 40)).toBe(0);
    expect(disputesFromReputation(null, 40)).toBe(0);
    expect(disputesFromReputation(95, 40)).toBe(2);
    expect(disputesFromReputation(99.9, 5)).toBe(1);
  });

  it("writes mapping, patterns and scores, idempotently", () => {
    const db = openDb(":memory:");
    const now = "2026-11-01T00:00:00.000Z";
    const agent = (id: string, delivered: number | null, success: number | null, raw: object = {}) =>
      db
        .insert(marketAgents)
        .values({ id, handle: `h-${id}`, rawJson: JSON.stringify(raw), fetchedAt: now, deliveredJobs: delivered, successRate: success })
        .run();
    agent("A", 0, null);
    agent("B", 0, null);
    agent("C", 12, 90, { near_account_id: "c.near" });
    agent("N", 0, null);
    db.insert(marketReputation)
      .values({ agentId: "C", overall: 80, axesJson: JSON.stringify({ dispute_free: 90 }), jobsCounted: 10, rawJson: "{}", fetchedAt: now })
      .run();
    for (const b of fixtureBids().filter((x) => "ABC".includes(x.agent_id)))
      db.insert(marketBids)
        .values({ id: b.id, jobId: b.job_id, agentId: b.agent_id, amount: b.amount, etaSeconds: b.eta_seconds, createdAt: b.created_at, rawJson: "{}" })
        .run();
    db.insert(marketJobs).values({ id: "j1", awardedAgentId: "C", rawJson: "{}", fetchedAt: now }).run();
    for (const [i, to] of ["c.near", "c.near"].entries())
      db.insert(escrowTransfers)
        .values({
          id: `t${i}`,
          txHash: `tx${i}`,
          ts: now,
          intentType: "transfer",
          fromAccount: "escrow.ai.near",
          toAccount: to,
          token: "nep141:usdc",
          amount: "1000000",
          succeeded: true,
          kind: "reward",
          kindMethod: "heuristic",
          memo: i === 0 ? "job j1" : null,
        })
        .run();
    db.insert(accountFunders).values({ account: "c.near", funder: "f.near" }).run();

    const r1 = runTrustEngine(db, { now: new Date(now), funderExclude: new Set() });
    expect(r1).toMatchObject({ agents: 4, mapped: 1, bids: 9, edges: { co_bid: 1, shared_funder: 0 }, patterns: 1 });

    const rows = db.select().from(trustScores).all();
    const by = Object.fromEntries(rows.map((r) => [r.agentId, r]));
    expect(by.N!.score).toBeNull();
    expect(by.N!.band).toBe("Insufficient data");
    // A: 4 bids, 3 twin → H = 15×0.25 = 3.75 ; in cluster → I = 5 ; no deliveries → D = 0
    expect(JSON.parse(by.A!.componentsJson)).toEqual({ D: 0, H: 3.75, I: 5, P: 0 });
    expect(by.A!.score).toBe(33.75);
    // C: mapped via api, 2 paid legs, success 90%, 1 dispute → D = 6 + 13.5, P = 5
    const cIn = JSON.parse(by.C!.inputsJson);
    expect(cIn).toMatchObject({ mapped: true, n_paid_onchain: 2, n_disputed: 1, n_awarded: 1, n_refund_after_award: 0 });
    expect(cIn.earned_onchain).toEqual({ "nep141:usdc": "2000000" });
    expect(by.C!.score).toBe(25 + 19.5 + 15 + 15 - 5);
    expect(db.select().from(marketAgents).all().find((a) => a.id === "C")).toMatchObject({ nearAccount: "c.near", mappingMethod: "api" });

    // shape matches the frozen API type
    TrustViewSchema.parse({
      score: by.A!.score,
      band: by.A!.band,
      components: JSON.parse(by.A!.componentsJson),
      inputs: JSON.parse(by.A!.inputsJson),
      algo_version: by.A!.algoVersion,
      computed_at: by.A!.computedAt,
      flags: [],
    });

    const p = db.select().from(patterns).all();
    expect(JSON.parse(p[0]!.membersJson)).toEqual(["A", "B"]);
    runTrustEngine(db, { now: new Date(now), funderExclude: new Set() });
    expect(db.select().from(trustScores).all()).toEqual(rows);
    expect(db.select().from(patternEdges).all()).toHaveLength(1);
    db.$client.close();
  });
});
