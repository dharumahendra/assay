import { PATTERN_THRESHOLDS, sha256Hex, type CoJobEvidence } from "@juri/shared";

/**
 * Linked bidding pattern (FR-B4), 05 §5.3. Pure.
 *
 * Twin bids: two bids by different agents on the same job with
 *   |amount_a − amount_b| ≤ 1% × max(amount_a, amount_b), same eta_seconds, |Δt| ≤ 600 s.
 * co_bid edge A–B: co_jobs ≥ 3 and twin_jobs / co_jobs ≥ 0.6.
 * Cluster: connected component (union-find) over all edges, size ≥ 2.
 *
 * Since market API v2 bids are only visible to the job creator, the input is whatever bids
 * Juri can see (its own jobs). The algorithm does not care where bids come from.
 */
export interface BidLite {
  id: string;
  job_id: string;
  agent_id: string;
  amount: string | null;
  eta_seconds: number | null;
  created_at: string | null;
}

export interface CoBidEdge {
  a: string; // a < b
  b: string;
  type: "co_bid";
  co_jobs: number;
  twin_jobs: number;
  evidence: CoJobEvidence[];
}

export interface FunderEdge {
  a: string;
  b: string;
  type: "shared_funder";
  evidence: { funder: string; a_account: string; b_account: string };
}

export type Edge = CoBidEdge | FunderEdge;

export interface Cluster {
  id: string;
  members: string[]; // sorted
  edge_count: number;
}

const T = PATTERN_THRESHOLDS;

const num = (s: string | null): number | null => {
  if (s === null || s.trim() === "") return null;
  const v = Number(s);
  return Number.isFinite(v) ? v : null;
};
const ms = (s: string | null): number | null => {
  if (!s) return null;
  const v = Date.parse(s);
  return Number.isFinite(v) ? v : null;
};

export function dtSeconds(a: BidLite, b: BidLite): number | null {
  const ta = ms(a.created_at);
  const tb = ms(b.created_at);
  return ta === null || tb === null ? null : Math.abs(ta - tb) / 1000;
}

export function isTwin(a: BidLite, b: BidLite): boolean {
  if (a.agent_id === b.agent_id || a.job_id !== b.job_id) return false;
  const x = num(a.amount);
  const y = num(b.amount);
  if (x === null || y === null) return false;
  if (Math.abs(x - y) > T.twin_amount_pct * Math.max(Math.abs(x), Math.abs(y))) return false;
  if (a.eta_seconds === null || a.eta_seconds !== b.eta_seconds) return false;
  const dt = dtSeconds(a, b);
  return dt !== null && dt <= T.twin_max_dt_seconds;
}

const ev = (x: BidLite) => ({
  bid_id: x.id,
  agent_id: x.agent_id,
  amount: x.amount,
  eta_seconds: x.eta_seconds,
  created_at: x.created_at,
});

export interface CoBidAnalysis {
  edges: CoBidEdge[];
  /** Bids that are part of at least one twin pair (M4 numerator, H component). */
  twinBidIds: Set<string>;
}

export function analyzeCoBidding(bids: BidLite[]): CoBidAnalysis {
  const byJob = new Map<string, BidLite[]>();
  for (const b of bids) {
    const arr = byJob.get(b.job_id) ?? [];
    arr.push(b);
    byJob.set(b.job_id, arr);
  }
  const twinBidIds = new Set<string>();
  const pairs = new Map<string, { a: string; b: string; co: number; twin: number; evidence: CoJobEvidence[] }>();

  for (const jobId of [...byJob.keys()].sort()) {
    const jb = byJob.get(jobId)!;
    // Per agent pair on this job: pick the closest bid pair (twin first, then smallest Δt).
    const best = new Map<string, { a: BidLite; b: BidLite; twin: boolean; dt: number | null }>();
    for (let i = 0; i < jb.length; i++) {
      for (let j = i + 1; j < jb.length; j++) {
        let x = jb[i]!;
        let y = jb[j]!;
        if (x.agent_id === y.agent_id) continue;
        if (x.agent_id > y.agent_id) [x, y] = [y, x];
        const twin = isTwin(x, y);
        if (twin) {
          twinBidIds.add(x.id);
          twinBidIds.add(y.id);
        }
        const dt = dtSeconds(x, y);
        const key = `${x.agent_id}\u0000${y.agent_id}`;
        const cur = best.get(key);
        const better =
          !cur ||
          (twin && !cur.twin) ||
          (twin === cur.twin && (dt ?? Infinity) < (cur.dt ?? Infinity));
        if (better) best.set(key, { a: x, b: y, twin, dt });
      }
    }
    for (const [key, v] of best) {
      const p = pairs.get(key) ?? { a: v.a.agent_id, b: v.b.agent_id, co: 0, twin: 0, evidence: [] };
      p.co += 1;
      if (v.twin) p.twin += 1;
      p.evidence.push({ job_id: jobId, twin: v.twin, a: ev(v.a), b: ev(v.b), dt_seconds: v.dt });
      pairs.set(key, p);
    }
  }

  const edges: CoBidEdge[] = [];
  for (const p of pairs.values()) {
    if (p.co >= T.edge_min_co_jobs && p.twin / p.co >= T.edge_min_twin_ratio) {
      edges.push({ a: p.a, b: p.b, type: "co_bid", co_jobs: p.co, twin_jobs: p.twin, evidence: p.evidence });
    }
  }
  edges.sort((x, y) => (x.a === y.a ? x.b.localeCompare(y.b) : x.a.localeCompare(y.a)));
  return { edges, twinBidIds };
}

/** Deterministic id from the member set, so ids are stable across runs with the same data. */
export function patternId(members: string[]): string {
  return `pat_${sha256Hex([...members].sort().join(",")).slice(0, 12)}`;
}

export function clusterEdges(edges: Edge[]): Cluster[] {
  const parent = new Map<string, string>();
  const find = (x: string): string => {
    let r = x;
    while (parent.get(r) !== r) r = parent.get(r)!;
    let c = x;
    while (parent.get(c) !== r) {
      const n = parent.get(c)!;
      parent.set(c, r);
      c = n;
    }
    return r;
  };
  const add = (x: string) => {
    if (!parent.has(x)) parent.set(x, x);
  };
  for (const e of edges) {
    add(e.a);
    add(e.b);
    const ra = find(e.a);
    const rb = find(e.b);
    if (ra !== rb) parent.set(ra < rb ? rb : ra, ra < rb ? ra : rb);
  }
  const groups = new Map<string, string[]>();
  for (const x of parent.keys()) {
    const r = find(x);
    groups.set(r, [...(groups.get(r) ?? []), x]);
  }
  const out: Cluster[] = [];
  for (const members of groups.values()) {
    if (members.length < 2) continue;
    members.sort();
    const set = new Set(members);
    const edgeCount = edges.filter((e) => set.has(e.a)).length;
    out.push({ id: patternId(members), members, edge_count: edgeCount });
  }
  return out.sort((x, y) => y.members.length - x.members.length || x.id.localeCompare(y.id));
}

/** Bids per distinct UTC day with at least one bid (H component penalty). */
export function bidsPerActiveDay(bids: BidLite[]): number {
  const days = new Set(bids.map((b) => b.created_at?.slice(0, 10)).filter(Boolean));
  return days.size ? bids.length / days.size : 0;
}
