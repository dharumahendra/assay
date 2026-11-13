import { and, desc, eq, gte, sql } from "drizzle-orm";
import type { Db } from "./db/index.js";
import {
  escrowTransfers,
  escrowTxns,
  marketAgents,
  marketReputation,
  metrics,
  platformStats,
  sourceFacts,
} from "./db/schema.js";

/**
 * FR-A3, Market Insight metrics. Definitions adapted to market API v2 + decision 1a
 * (jobs/bids are not public), see docs/phase0-findings.md §Metrics:
 *
 *   M1 Completion rate       delivered_jobs ÷ jobs_total            market /v1/platform/stats
 *   M2 On-chain refund ratio refund legs ÷ deposit legs             escrow intents (succeeded)
 *   M3 Delivery concentration share of delivered jobs by top-10     market /v1/agents
 *   M4 Unproven agents       listed agents with 0 delivered jobs     market /v1/agents
 *   M5 Agents with disputes  rated agents with dispute_free < 100    market /v1/agents/{id}/reputation
 *   M6 Escrow failure rate   failed ÷ all escrow.ai.near txns        FastNEAR tx API (extra)
 *
 * Every row stores numerator, denominator and `sources_json` (record ids) for drill-down (FR-A5).
 */
export interface MetricRow {
  id: string;
  window: "all" | "30d";
  value: number | null;
  numerator: number | null;
  denominator: number | null;
  unit: string;
  note: string;
  sources: unknown;
}

const ratio = (n: number, d: number) => (d > 0 ? n / d : null);

function m1(db: Db): MetricRow {
  const s = db.select().from(platformStats).orderBy(desc(platformStats.fetchedAt)).limit(1).get();
  return {
    id: "M1",
    window: "all",
    value: s ? ratio(s.deliveredJobs, s.jobsTotal) : null,
    numerator: s?.deliveredJobs ?? null,
    denominator: s?.jobsTotal ?? null,
    unit: "ratio",
    note: s
      ? "Delivered ÷ all jobs ever posted, as reported by the market (not award-based: awards are not public)."
      : "No platform stats synced.",
    sources: s ? { endpoint: "GET /v1/platform/stats", fetched_at: s.fetchedAt } : null,
  };
}

function m2(db: Db, window: "all" | "30d"): MetricRow {
  const since = window === "30d" ? new Date(Date.now() - 30 * 86400_000).toISOString() : "";
  const legs = db
    .select({
      id: escrowTransfers.id,
      tx: escrowTransfers.txHash,
      kind: escrowTransfers.kind,
      token: escrowTransfers.token,
      amount: escrowTransfers.amount,
    })
    .from(escrowTransfers)
    .where(and(eq(escrowTransfers.succeeded, true), gte(escrowTransfers.ts, since)))
    .all();
  const deposits = legs.filter((l) => l.kind === "deposit");
  const refunds = legs.filter((l) => l.kind === "refund");
  // Value ratio per token (amounts are only comparable within a token).
  const byToken: Record<string, { deposit: string; refund: string; reward: string; fee: string; refund_ratio: number | null }> = {};
  for (const l of legs) {
    if (!["deposit", "refund", "reward", "fee"].includes(l.kind)) continue;
    const t = (byToken[l.token] ??= { deposit: "0", refund: "0", reward: "0", fee: "0", refund_ratio: null });
    const k = l.kind as "deposit" | "refund" | "reward" | "fee";
    t[k] = (BigInt(t[k]) + BigInt(l.amount)).toString();
  }
  for (const t of Object.values(byToken)) {
    const d = BigInt(t.deposit);
    t.refund_ratio = d > 0n ? Number((BigInt(t.refund) * 10_000n) / d) / 10_000 : null;
  }
  const span = db
    .select({ min: sql<string>`min(${escrowTxns.ts})`, max: sql<string>`max(${escrowTxns.ts})`, n: sql<number>`count(*)` })
    .from(escrowTxns)
    .where(gte(escrowTxns.ts, since))
    .get();
  return {
    id: "M2",
    window,
    value: ratio(refunds.length, deposits.length),
    numerator: refunds.length,
    denominator: deposits.length,
    unit: "ratio",
    note:
      `Count of refund legs ÷ deposit legs among succeeded escrow txns (kind_method=heuristic; ` +
      `flows with the operator wallet are 'internal' and excluded; value ratio per token in sources). ` +
      `Indexed ${span?.n ?? 0} escrow txns from ${span?.min ?? "-"} to ${span?.max ?? "-"}.`,
    sources: {
      by_token: byToken,
      deposit_txs: [...new Set(deposits.map((d) => d.tx))],
      refund_txs: [...new Set(refunds.map((d) => d.tx))],
    },
  };
}

function m3(db: Db): MetricRow {
  const agents = db
    .select({ id: marketAgents.id, handle: marketAgents.handle, n: marketAgents.deliveredJobs })
    .from(marketAgents)
    .all()
    .map((a) => ({ ...a, n: a.n ?? 0 }))
    .sort((a, b) => b.n - a.n);
  const total = agents.reduce((s, a) => s + a.n, 0);
  const top = agents.slice(0, 10);
  const topSum = top.reduce((s, a) => s + a.n, 0);
  return {
    id: "M3",
    window: "all",
    value: ratio(topSum, total),
    numerator: topSum,
    denominator: total,
    unit: "ratio",
    note: `Share of all delivered jobs done by the 10 busiest of ${agents.length} listed agents.`,
    sources: { top10: top.map((a) => ({ agent_id: a.id, handle: a.handle, delivered_jobs: a.n })) },
  };
}

function m4(db: Db): MetricRow {
  const agents = db.select({ id: marketAgents.id, n: marketAgents.deliveredJobs }).from(marketAgents).all();
  const unproven = agents.filter((a) => !a.n);
  return {
    id: "M4",
    window: "all",
    value: ratio(unproven.length, agents.length),
    numerator: unproven.length,
    denominator: agents.length,
    unit: "ratio",
    note: "Listed agents with zero delivered jobs: no track record a buyer can check (replaces twin-bid share; bids are private since API v2).",
    sources: { agent_ids: unproven.map((a) => a.id) },
  };
}

function m5(db: Db): MetricRow {
  const reps = db.select().from(marketReputation).all();
  const rated = reps.filter((r) => {
    const raw = JSON.parse(r.rawJson) as { min_scored_jobs?: number };
    return r.overall !== null && r.jobsCounted >= (raw.min_scored_jobs ?? 0);
  });
  const disputed = rated.filter((r) => {
    const axes = JSON.parse(r.axesJson) as { dispute_free?: number | null };
    return typeof axes.dispute_free === "number" && axes.dispute_free < 100;
  });
  return {
    id: "M5",
    window: "all",
    value: ratio(disputed.length, rated.length),
    numerator: disputed.length,
    denominator: rated.length,
    unit: "ratio",
    note: "Rated agents whose market `dispute_free` axis is below 100 (had at least one dispute). Job-level dispute status is private.",
    sources: {
      agents: disputed.map((r) => ({ agent_id: r.agentId, dispute_free: (JSON.parse(r.axesJson) as { dispute_free: number }).dispute_free })),
    },
  };
}

/** Extra: share of escrow txns that failed on-chain, plus the last successful one. */
function m6(db: Db): MetricRow {
  const f = db.select().from(sourceFacts).where(eq(sourceFacts.key, "escrow:totals")).get();
  const v = f
    ? (JSON.parse(f.valueJson) as { all_txs: number | null; successful_txs: number | null; last_success_at: string | null; last_success_tx: string | null; latest_tx_at: string | null })
    : null;
  const failed = v?.all_txs != null && v.successful_txs != null ? v.all_txs - v.successful_txs : null;
  return {
    id: "M6",
    window: "all",
    value: failed !== null && v?.all_txs ? failed / v.all_txs : null,
    numerator: failed,
    denominator: v?.all_txs ?? null,
    unit: "ratio",
    note: v
      ? `Failed ÷ all txns touching ${"escrow.ai.near"} (FastNEAR). Last successful tx ${v.last_success_at ?? "-"}; latest tx ${v.latest_tx_at ?? "-"}.`
      : "Escrow totals not indexed.",
    sources: v ? { endpoint: f!.source, fetched_at: f!.updatedAt, last_success_tx: v.last_success_tx } : null,
  };
}

export function computeMetrics(db: Db): MetricRow[] {
  const rows = [m1(db), m2(db, "all"), m2(db, "30d"), m3(db), m4(db), m5(db), m6(db)];
  const computedAt = new Date().toISOString();
  db.transaction((tx) => {
    for (const r of rows) {
      const v = {
        id: r.id,
        window: r.window,
        value: r.value,
        numerator: r.numerator,
        denominator: r.denominator,
        unit: r.unit,
        note: r.note,
        computedAt,
        sourcesJson: JSON.stringify(r.sources),
      };
      const { id: _i, window: _w, ...set } = v;
      tx.insert(metrics).values(v).onConflictDoUpdate({ target: [metrics.id, metrics.window], set }).run();
    }
  });
  return rows;
}

export function printMetrics(rows: MetricRow[]): void {
  for (const r of rows) {
    const v = r.value === null ? "n/a" : `${(r.value * 100).toFixed(1)}%`;
    console.log(`${r.id} [${r.window}] ${v.padStart(7)}  (${r.numerator ?? "-"} / ${r.denominator ?? "-"})  ${r.note}`);
  }
}
