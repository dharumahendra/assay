import { z } from "zod";

/**
 * Juri contract interface (docs/04) — FREEZE #2 (T3.10).
 * Mirrors contracts/juri/src/types.rs. `contract.test.ts` checks this file against the generated
 * ABI (contracts/juri/abi/juri.abi.json) and the Rust error codes, so drift fails CI.
 * JSON conventions: u128 amounts and u64 nanosecond timestamps are decimal strings.
 */

export const CRITERION_KIND = { MUST: 0, SHOULD: 1 } as const;
export type CriterionKindCode = (typeof CRITERION_KIND)[keyof typeof CRITERION_KIND];

/** Verifier FCAK scope (FR-E1) and keeper FCAK scope (03 §6). */
export const VERIFIER_METHODS = ["commit_vote", "reveal_vote", "withdraw"] as const;
export const KEEPER_METHODS = ["start_judging", "finalize", "restart_jury"] as const;

export const CHANGE_METHODS = [
  "new",
  "create_job",
  "cancel_job",
  "submit_deliverable",
  "reclaim_expired",
  "register_verifier",
  "set_verifier_active",
  "start_judging",
  "commit_vote",
  "reveal_vote",
  "finalize",
  "restart_jury",
  "withdraw",
  "withdraw_treasury",
  "set_params",
  "set_snapshot_poster",
  "post_snapshot",
] as const;

export const VIEW_METHODS = [
  "get_owner",
  "get_params",
  "get_job",
  "get_jobs",
  "get_jobs_by_account",
  "get_job_count",
  "get_verifier",
  "get_verifiers",
  "get_claimable",
  "get_treasury",
  "get_totals",
  "get_agent_stats",
  "get_snapshots",
] as const;

/** Contract panics look like "E10: CommitmentMismatch"; FE maps them to friendly text (T6.6). */
export const CONTRACT_ERRORS = {
  E01: { name: "NotOwner", message: "Only the contract owner can do this." },
  E02: { name: "NotRequester", message: "Only the requester of this job can do this." },
  E03: { name: "NotWorker", message: "Only the assigned worker can do this." },
  E04: { name: "NotJuror", message: "This account is not on the jury for this job." },
  E05: { name: "InvalidStatus", message: "The job is not in a state that allows this action." },
  E06: { name: "DeadlinePassed", message: "The deadline for this action has passed." },
  E07: { name: "DeadlineNotReached", message: "Too early: the deadline for this step has not passed yet." },
  E08: { name: "AlreadyCommitted", message: "This verifier already committed a vote." },
  E09: { name: "NotCommitted", message: "This verifier has not committed a vote." },
  E10: { name: "CommitmentMismatch", message: "The revealed vote does not match the commitment." },
  E11: { name: "InvalidCriteria", message: "Criteria must have 1–13 items and at least one MUST." },
  E12: { name: "InvalidVerdicts", message: "Verdicts must have one value (0, 1 or 2) per criterion." },
  E13: { name: "InsufficientDeposit", message: "The attached deposit is too small." },
  E14: { name: "NotEnoughVerifiers", message: "Not enough active verifiers to form a jury." },
  E15: { name: "InvalidParams", message: "Invalid parameters." },
  E16: { name: "NothingToWithdraw", message: "There is nothing to withdraw." },
  E17: { name: "InvalidHash", message: "Hashes must be 64 lowercase hex characters." },
  E18: { name: "StringTooLong", message: "A text field is too long." },
  E19: { name: "SelfDealing", message: "Requester and worker must be different accounts." },
  E20: { name: "VerifierExists", message: "A verifier with this name already exists." },
  E21: { name: "AlreadyRevealed", message: "This verifier already revealed its vote." },
  E22: { name: "JobNotFound", message: "No job with this id." },
  E23: { name: "VerifierNotFound", message: "No verifier with this account." },
} as const;
export type ContractErrorCode = keyof typeof CONTRACT_ERRORS;

/** Finds "Exx: Name" in a NEAR error message/object and returns the code + friendly text. */
export function parseContractError(err: unknown): { code: ContractErrorCode; name: string; message: string } | null {
  const text = typeof err === "string" ? err : err instanceof Error ? err.message : JSON.stringify(err ?? "");
  const m = /\b(E\d{2}): ([A-Za-z]+)/.exec(text);
  if (!m || !(m[1]! in CONTRACT_ERRORS)) return null;
  const code = m[1] as ContractErrorCode;
  return { code, ...CONTRACT_ERRORS[code] };
}

// ---------- types ----------

const U128 = z.string().regex(/^\d+$/);
const U64 = z.string().regex(/^\d+$/);

export const JobStatusSchema = z.enum(["Funded", "Submitted", "Committing", "Stalled", "Settled", "Cancelled", "Expired"]);
export type JobStatus = z.infer<typeof JobStatusSchema>;
export const OutcomeSchema = z.enum(["Released", "Refunded", "Split", "RefundedNoFee"]);
export type Outcome = z.infer<typeof OutcomeSchema>;
export const PayoutModeSchema = z.union([z.literal("Binary"), z.object({ Partial: z.object({ base_pct: z.number().int().min(0).max(100) }) })]);
export type PayoutMode = z.infer<typeof PayoutModeSchema>;

export const RevealSchema = z.object({
  verifier: z.string(),
  verdicts: z.array(z.number().int().min(0).max(2)),
  injection_flag: z.boolean(),
  evidence_hash: z.string(),
  attestation_hash: z.string().nullable(),
  model: z.string(),
});
export type Reveal = z.infer<typeof RevealSchema>;

export const SettlementSchema = z.object({
  fee: U128,
  jury_pool: U128,
  net: U128,
  to_worker: U128,
  to_requester: U128,
  to_treasury: U128,
  shares: z.array(z.object({ verifier: z.string(), agree: z.number(), amount: U128 })),
});
export type Settlement = z.infer<typeof SettlementSchema>;

export const ContractJobSchema = z.object({
  id: z.number().int(),
  requester: z.string(),
  worker: z.string(),
  amount: U128,
  criteria_hash: z.string(),
  criteria_uri: z.string(),
  criteria_kinds: z.array(z.number().int().min(0).max(1)),
  market_job_id: z.string().nullable(),
  payout_mode: PayoutModeSchema,
  created_at: U64,
  submit_deadline: U64,
  deliverable_hash: z.string().nullable(),
  deliverable_uri: z.string().nullable(),
  submitted_at: U64.nullable(),
  jury: z.array(z.string()),
  commit_deadline: U64,
  reveal_deadline: U64,
  restarts: z.number().int(),
  commits: z.array(z.object({ verifier: z.string(), commitment: z.string() })),
  reveals: z.array(RevealSchema),
  status: JobStatusSchema,
  outcome: OutcomeSchema.nullable(),
  criteria_result: z.array(z.number().int()),
  injection_flagged: z.boolean(),
  settlement: SettlementSchema.nullable(),
});
export type ContractJob = z.infer<typeof ContractJobSchema>;

export const ContractVerifierSchema = z.object({
  account_id: z.string(),
  payout_account: z.string(),
  model_label: z.string(),
  stake: U128,
  active: z.boolean(),
  votes: z.number().int(),
  majority_agreements: z.number().int(),
  missed_reveals: z.number().int(),
  earned: U128,
});
export type ContractVerifier = z.infer<typeof ContractVerifierSchema>;

export const ContractParamsSchema = z.object({
  fee_bps: z.number().int(),
  jury_share_bps: z.number().int(),
  jury_size: z.number().int(),
  commit_secs: z.number().int(),
  reveal_secs: z.number().int(),
  min_stake: U128,
  verifier_seed_balance: U128,
  min_amount: U128,
  max_criteria: z.number().int(),
  max_restarts: z.number().int(),
});
export type ContractParams = z.infer<typeof ContractParamsSchema>;

export const AgentStatsSchema = z.object({
  worker_settled: z.number().int(),
  worker_passed: z.number().int(),
  worker_failed: z.number().int(),
  worker_earned: U128,
  requester_jobs: z.number().int(),
});
export type AgentStats = z.infer<typeof AgentStatsSchema>;

export const TotalsSchema = z.object({ total_fee: U128, total_jury_pool: U128, settled_jobs: z.number().int() });
export type Totals = z.infer<typeof TotalsSchema>;

// ---------- call args ----------

export interface CreateJobArgs {
  worker: string;
  criteria_hash: string;
  criteria_uri: string;
  criteria_kinds: CriterionKindCode[];
  submit_deadline_secs: number;
  market_job_id?: string | null;
  payout_mode?: PayoutMode | null;
}

export interface RevealVoteArgs {
  job_id: number;
  verdicts: (0 | 1 | 2)[];
  injection_flag: boolean;
  evidence_hash: string;
  salt: string;
  attestation_hash: string | null;
  model: string;
}

/** NEP-297 event envelope emitted by the contract (04 §8). */
export interface JuriEvent<T = Record<string, unknown>> {
  standard: "juri";
  version: "1.0.0";
  event: string;
  data: T[];
}

export function parseJuriEvents(logs: string[]): JuriEvent[] {
  return logs.flatMap((l) => {
    if (!l.startsWith("EVENT_JSON:")) return [];
    try {
      const e = JSON.parse(l.slice("EVENT_JSON:".length)) as JuriEvent;
      return e.standard === "juri" ? [e] : [];
    } catch {
      return [];
    }
  });
}

/** yoctoNEAR string → NEAR string with `dp` decimals (UI shows 2–4, 00 §5). */
export function formatNear(yocto: string | bigint, dp = 4): string {
  const v = BigInt(yocto);
  const whole = v / 10n ** 24n;
  const frac = (v % 10n ** 24n).toString().padStart(24, "0").slice(0, dp);
  return dp > 0 ? `${whole}.${frac}` : whole.toString();
}

export function parseNear(near: string): string {
  const [w, f = ""] = near.trim().split(".");
  if (!/^\d+$/.test(w ?? "") || !/^\d*$/.test(f) || f.length > 24) throw new Error(`invalid NEAR amount: ${near}`);
  return (BigInt(w!) * 10n ** 24n + BigInt(f.padEnd(24, "0") || "0")).toString();
}
