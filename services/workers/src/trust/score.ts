import { TRUST_ALGO_VERSION, type TrustBand, type TrustComponents, type TrustInputs } from "@juri/shared";

/**
 * Trust Score (FR-B2, FR-B3), 05 §5.2. Deterministic: same inputs → same score (NFR-REPRO-2).
 *
 * ts-0.2 = ts-0.1 weights, with two changes forced by market API v2 (docs/phase0-findings.md):
 *   1. Gate: "Insufficient data" when n_bids < 3 AND n_paid_onchain = 0 AND n_completed = 0.
 *      (ts-0.1 had no n_completed term; bids are private now, so ts-0.1 would gate almost everyone.)
 *   2. D's completion term uses `completion_ratio` (n_completed / n_awarded, or the market's
 *      success_rate when awards are not visible).
 *
 *   D (0–45) = 30 × min(1, n_paid_onchain / 10) + 15 × completion_ratio
 *   H (0–15) = max(0, 15 × (1 − twin_ratio_self) − (bids_per_active_day > 20 ? 5 : 0))
 *   I (0–15) = max(0, 15 − 10 × in_cluster − 5 × shared_funder)
 *   P (0–25) = min(25, 8 × n_refund_after_award + 5 × n_disputed)
 *   score    = clamp(25 + D + H + I − P, 0, 100)
 */
export const ALGO_VERSION = TRUST_ALGO_VERSION;

export interface ScoreResult {
  score: number | null;
  band: TrustBand;
  components: TrustComponents | null;
  /** Machine-readable caveats shown next to the score, e.g. "unmapped", "refunds_unknown". */
  flags: string[];
}

const round2 = (x: number) => Math.round(x * 100) / 100;
const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));

export function bandFor(score: number | null): TrustBand {
  if (score === null) return "Insufficient data";
  if (score >= 75) return "Strong record";
  if (score >= 50) return "Some record";
  return "Weak record";
}

export function computeTrustScore(inp: TrustInputs): ScoreResult {
  const flags: string[] = [];
  if (!inp.mapped) flags.push("unmapped");
  if (inp.n_refund_after_award === null) flags.push("refunds_unknown");
  if (inp.completion_ratio === null) flags.push("completion_unknown");

  if (inp.n_bids < 3 && inp.n_paid_onchain === 0 && inp.n_completed === 0) {
    return { score: null, band: "Insufficient data", components: null, flags };
  }

  const completion = clamp(inp.completion_ratio ?? 0, 0, 1);
  const D = 30 * Math.min(1, inp.n_paid_onchain / 10) + 15 * completion;
  const H = Math.max(0, 15 * (1 - clamp(inp.twin_ratio_self, 0, 1)) - (inp.bids_per_active_day > 20 ? 5 : 0));
  const I = Math.max(0, 15 - 10 * Number(inp.in_cluster) - 5 * Number(inp.shared_funder));
  const P = Math.min(25, 8 * (inp.n_refund_after_award ?? 0) + 5 * inp.n_disputed);
  const score = round2(clamp(25 + D + H + I - P, 0, 100));
  return {
    score,
    band: bandFor(score),
    components: { D: round2(D), H: round2(H), I: round2(I), P: round2(P) },
    flags,
  };
}

/** Inputs for an agent we know nothing about; callers overwrite what they have. */
export function emptyInputs(): TrustInputs {
  return {
    n_bids: 0,
    n_awarded: null,
    n_completed: 0,
    completion_ratio: null,
    n_paid_onchain: 0,
    earned_onchain: {},
    n_refund_after_award: null,
    n_disputed: 0,
    bids_per_active_day: 0,
    twin_ratio_self: 0,
    in_cluster: false,
    shared_funder: false,
    mapped: false,
    sources: {},
  };
}
