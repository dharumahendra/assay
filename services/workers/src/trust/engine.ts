import type { TrustInputs } from "@juri/shared";
import { and, desc, eq } from "drizzle-orm";
import type { Db } from "../db/index.js";
import {
  accountFunders,
  escrowTransfers,
  marketAgents,
  marketBids,
  marketJobs,
  marketReputation,
  patternEdges,
  patterns,
  snapshots,
  trustScores,
} from "../db/schema.js";
import { loadFunderExclude, sharedFunderEdges } from "./funder.js";
import { apiAccountFromRaw, mapIdentities, type AwardEvidence } from "./identity.js";
import { analyzeCoBidding, bidsPerActiveDay, clusterEdges, type BidLite, type Edge } from "./patterns.js";
import { ALGO_VERSION, computeTrustScore, emptyInputs } from "./score.js";

/**
 * trust-engine (05 §1, W1): identity mapping → linked patterns → Trust Score, written to
 * market_agents (mapping), pattern_edges, patterns, trust_scores. Reads only local tables, so it
 * runs the same in LIVE and SNAPSHOT mode. Idempotent: replaces its own outputs each run.
 */
export interface TrustEngineResult {
  algo_version: string;
  computed_at: string;
  agents: number;
  scored: number;
  insufficient: number;
  mapped: number;
  mapping_conflicts: number;
  bids: number;
  twin_bids: number;
  edges: { co_bid: number; shared_funder: number };
  patterns: number;
}

export interface TrustEngineOpts {
  now?: Date;
  funderExclude?: Set<string>;
}

const addBig = (a: string | undefined, b: string): string => {
  try {
    return (BigInt(a ?? "0") + BigInt(b)).toString();
  } catch {
    return a ?? "0";
  }
};

/** Estimated number of disputed jobs from the market's `dispute_free` axis (0–100). */
export function disputesFromReputation(disputeFree: number | null | undefined, jobsCounted: number): number {
  if (typeof disputeFree !== "number" || disputeFree >= 100) return 0;
  return Math.max(1, Math.round((jobsCounted * (100 - disputeFree)) / 100));
}

export function runTrustEngine(db: Db, opts: TrustEngineOpts = {}): TrustEngineResult {
  const computedAt = (opts.now ?? new Date()).toISOString();
  const exclude = opts.funderExclude ?? loadFunderExclude();

  const agents = db.select().from(marketAgents).all();
  const reps = new Map(db.select().from(marketReputation).all().map((r) => [r.agentId, r]));
  const jobs = db.select({ id: marketJobs.id, awarded: marketJobs.awardedAgentId }).from(marketJobs).all();
  const bids: BidLite[] = db
    .select()
    .from(marketBids)
    .all()
    .map((b) => ({
      id: b.id,
      job_id: b.jobId,
      agent_id: b.agentId,
      amount: b.amount,
      eta_seconds: b.etaSeconds,
      created_at: b.createdAt,
    }));
  const legs = db
    .select()
    .from(escrowTransfers)
    .where(eq(escrowTransfers.succeeded, true))
    .all()
    .filter((l) => l.kind === "reward" || l.kind === "refund");

  // 1) identity mapping (FR-B1). A reward/refund leg is linked to a job only via its memo.
  const legsForJob = (jobId: string, kind: "reward" | "refund") =>
    legs.filter((l) => l.kind === kind && l.memo?.includes(jobId));
  const awards: AwardEvidence[] = jobs
    .filter((j) => j.awarded)
    .map((j) => ({
      agent_id: j.awarded!,
      market_job_id: j.id,
      reward_to: legsForJob(j.id, "reward").flatMap((l) => (l.toAccount ? [l.toAccount] : [])),
    }));
  const identities = mapIdentities(
    agents.map((a) => {
      let raw: unknown = null;
      try {
        raw = JSON.parse(a.rawJson);
      } catch {
        /* keep null */
      }
      return { id: a.id, api_account: apiAccountFromRaw(raw) };
    }),
    awards,
  );

  // 2) patterns (FR-B4, FR-B5)
  const { edges: coEdges, twinBidIds } = analyzeCoBidding(bids);
  const agentsByAccount = new Map<string, string[]>();
  for (const [agentId, idn] of identities) {
    if (!idn.near_account) continue;
    agentsByAccount.set(idn.near_account, [...(agentsByAccount.get(idn.near_account) ?? []), agentId]);
  }
  const funders = db.select().from(accountFunders).all();
  const funderEdges = sharedFunderEdges(funders, agentsByAccount, exclude);
  const allEdges: Edge[] = [...coEdges, ...funderEdges];
  const clusters = clusterEdges(allEdges);
  const clusterOf = new Map<string, string>();
  for (const c of clusters) for (const m of c.members) clusterOf.set(m, c.id);
  const fundedShared = new Set(funderEdges.flatMap((e) => [e.a, e.b]));

  // 3) Trust Score inputs per agent (FR-B2)
  const bidsByAgent = new Map<string, BidLite[]>();
  for (const b of bids) bidsByAgent.set(b.agent_id, [...(bidsByAgent.get(b.agent_id) ?? []), b]);
  const awardedByAgent = new Map<string, string[]>();
  for (const a of awards) awardedByAgent.set(a.agent_id, [...(awardedByAgent.get(a.agent_id) ?? []), a.market_job_id]);

  const snapshotId = db.select({ id: snapshots.id }).from(snapshots).orderBy(desc(snapshots.takenAt)).limit(1).get()?.id ?? null;

  const rows: (typeof trustScores.$inferInsert)[] = [];
  let scored = 0;
  let conflicts = 0;
  for (const a of agents) {
    const idn = identities.get(a.id)!;
    if (idn.conflict) conflicts++;
    const inp: TrustInputs = emptyInputs();
    const src: Record<string, string> = {};

    const myBids = bidsByAgent.get(a.id) ?? [];
    inp.n_bids = myBids.length;
    src.n_bids = "market_bids (Juri's own jobs only; bids are private since market API v2)";
    inp.bids_per_active_day = Math.round(bidsPerActiveDay(myBids) * 100) / 100;
    inp.twin_ratio_self = myBids.length ? myBids.filter((b) => twinBidIds.has(b.id)).length / myBids.length : 0;

    inp.n_completed = a.deliveredJobs ?? 0;
    src.n_completed = "market /v1/agents delivered_jobs";
    const awarded = awardedByAgent.get(a.id) ?? [];
    inp.n_awarded = awarded.length || null;
    if (typeof a.successRate === "number") {
      inp.completion_ratio = Math.min(1, Math.max(0, a.successRate / 100));
      src.completion_ratio = "market /v1/agents success_rate / 100";
    }
    if (awarded.length) {
      inp.n_refund_after_award = awarded.filter((j) => legsForJob(j, "refund").length > 0).length;
      src.n_refund_after_award = "escrow refund legs whose memo names an awarded job";
    }

    const rep = reps.get(a.id);
    if (rep) {
      let axes: { dispute_free?: number | null } = {};
      try {
        axes = JSON.parse(rep.axesJson);
      } catch {
        /* keep empty */
      }
      inp.n_disputed = disputesFromReputation(axes.dispute_free, rep.jobsCounted);
      src.n_disputed = "estimated from market reputation dispute_free and jobs_counted";
    }

    inp.mapped = idn.near_account !== null;
    if (idn.near_account) {
      const paid = legs.filter((l) => l.kind === "reward" && l.toAccount === idn.near_account);
      inp.n_paid_onchain = paid.length;
      for (const p of paid) inp.earned_onchain[p.token] = addBig(inp.earned_onchain[p.token], p.amount);
      src.n_paid_onchain = `escrow.ai.near reward legs to ${idn.near_account} (${idn.mapping_method})`;
    } else {
      src.n_paid_onchain = "unmapped: no NEAR account known for this agent";
    }

    inp.in_cluster = clusterOf.has(a.id);
    inp.shared_funder = fundedShared.has(a.id);
    inp.sources = src;

    const r = computeTrustScore(inp);
    if (r.score !== null) scored++;
    const flags = idn.conflict ? [...r.flags, "mapping_conflict"] : r.flags;
    rows.push({
      agentId: a.id,
      algoVersion: ALGO_VERSION,
      score: r.score,
      band: r.band,
      componentsJson: JSON.stringify(r.components),
      inputsJson: JSON.stringify({ ...inp, flags, mapping_candidates: idn.candidates }),
      computedAt,
      snapshotId,
    });
  }

  // 4) write (single transaction; replaces previous outputs)
  db.transaction((tx) => {
    for (const [agentId, idn] of identities) {
      tx.update(marketAgents)
        .set({ nearAccount: idn.near_account, mappingMethod: idn.mapping_method })
        .where(eq(marketAgents.id, agentId))
        .run();
    }
    tx.delete(patternEdges).run();
    tx.delete(patterns).run();
    tx.delete(trustScores).where(and(eq(trustScores.algoVersion, ALGO_VERSION))).run();
    for (const e of allEdges) {
      tx.insert(patternEdges)
        .values({
          a: e.a,
          b: e.b,
          type: e.type,
          coJobs: e.type === "co_bid" ? e.co_jobs : null,
          twinJobs: e.type === "co_bid" ? e.twin_jobs : null,
          evidenceJson: JSON.stringify(e.evidence),
        })
        .run();
    }
    for (const c of clusters) {
      tx.insert(patterns)
        .values({ id: c.id, membersJson: JSON.stringify(c.members), size: c.members.length, edgeCount: c.edge_count, computedAt })
        .run();
    }
    for (const r of rows) tx.insert(trustScores).values(r).run();
  });

  return {
    algo_version: ALGO_VERSION,
    computed_at: computedAt,
    agents: agents.length,
    scored,
    insufficient: agents.length - scored,
    mapped: [...identities.values()].filter((i) => i.near_account).length,
    mapping_conflicts: conflicts,
    bids: bids.length,
    twin_bids: twinBidIds.size,
    edges: { co_bid: coEdges.length, shared_funder: funderEdges.length },
    patterns: clusters.length,
  };
}
