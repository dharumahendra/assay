import { z } from "zod";

/**
 * Public market.near.ai shapes, as observed on 2026-11-13 (openapi v2.0.0).
 * Samples: docs/samples/market-agents.json, docs/samples/market-agent-reputation.json.
 * Unknown fields are kept (passthrough) so raw_json stays lossless.
 */

export const MarketAgentSchema = z
  .object({
    agent_id: z.string().uuid(),
    owner_account_id: z.string(), // market account UUID, NOT a NEAR account id
    handle: z.string(),
    name: z.string(),
    description: z.string().nullable().optional(),
    category: z.string().nullable().optional(),
    tags: z.array(z.string()).nullable().optional(),
    runtime: z.string().nullable().optional(),
    listing_status: z.string().optional(),
    delivered_jobs: z.number().int().nonnegative().optional(),
    success_rate: z.number().nullable().optional(),
    response_time_seconds_median: z.number().nullable().optional(),
    sla_seconds: z.number().nullable().optional(),
    availability: z.string().optional(),
    payable_with: z.union([z.string(), z.array(z.string())]).nullable().optional(),
    builder: z
      .object({
        account_id: z.string(),
        display_name: z.string().nullable().optional(),
        verification: z.object({ level: z.string(), since: z.string().nullable() }).partial().optional(),
      })
      .passthrough()
      .optional(),
    created_at: z.string(),
    updated_at: z.string().optional(),
  })
  .passthrough();
export type MarketAgent = z.infer<typeof MarketAgentSchema>;

/** Items are validated one by one by the caller, so one odd agent does not stop a sync. */
export const MarketAgentListSchema = z.object({ agents: z.array(z.unknown()) }).passthrough();

export const ReputationAxesSchema = z
  .object({
    delivery: z.number().nullable(),
    timeliness: z.number().nullable(),
    responsiveness: z.number().nullable(),
    dispute_free: z.number().nullable(),
    repeat_hires: z.number().nullable(),
    reviews: z.number().nullable(),
  })
  .partial()
  .passthrough();

export const MarketReputationSchema = z
  .object({
    overall: z.number().nullable(),
    axes: ReputationAxesSchema,
    jobs_counted: z.number().int(),
    min_scored_jobs: z.number().int().optional(),
    min_answered_reviews: z.number().int().optional(),
    baseline: ReputationAxesSchema.nullable().optional(),
    computed_at: z.string().nullable(), // null while the agent is not rated yet
  })
  .passthrough();
export type MarketReputation = z.infer<typeof MarketReputationSchema>;

export const PlatformStatsSchema = z
  .object({
    live_agents: z.number().int(),
    jobs_total: z.number().int(),
    jobs_this_week: z.number().int(),
    active_hires: z.number().int(),
    delivered_jobs: z.number().int(),
  })
  .passthrough();
export type PlatformStats = z.infer<typeof PlatformStatsSchema>;

/**
 * Job and Bid as in openapi v2 (`components.schemas.Job` / `Bid`). Readable only with an `aat_`
 * token, so Juri stores them only for jobs it posts itself (NFR-PRIV-2).
 */
export const JOB_STATUSES = ["open", "filling", "in_progress", "completed", "closed"] as const;
export const BID_STATUSES = ["pending", "accepted", "rejected", "withdrawn"] as const;

export const MarketJobSchema = z
  .object({
    jobId: z.string(),
    creatorAccountId: z.string(),
    title: z.string(),
    description: z.string(),
    tags: z.array(z.string()),
    budgetAmount: z.string().nullable().optional(),
    budgetToken: z.string(),
    jobKind: z.string(), // standard | instant | competition
    status: z.string(), // JOB_STATUSES; kept open so a new value does not break sync
    isPrivate: z.boolean().optional(),
    createdAt: z.string(),
    updatedAt: z.string().optional(),
  })
  .passthrough();
export type MarketJob = z.infer<typeof MarketJobSchema>;

export const MarketBidSchema = z
  .object({
    bidId: z.string(),
    jobId: z.string(),
    bidderAgentId: z.string(),
    amount: z.string(),
    proposal: z.string(),
    slaSeconds: z.number().int().nullable().optional(),
    status: z.string(), // BID_STATUSES
    createdAt: z.string(),
    updatedAt: z.string().optional(),
  })
  .passthrough();
export type MarketBid = z.infer<typeof MarketBidSchema>;

/**
 * One token leg decoded from an escrow.ai.near transaction (intents `transfer`/`ft_withdraw`/
 * `token_diff`, `ft_transfer`, native transfer). Mirrors table `escrow_transfers`.
 */
/** `internal`: escrow ↔ the observed operator wallet (role inferred, kept out of refund/reward metrics). */
export const TRANSFER_KINDS = ["deposit", "reward", "refund", "fee", "internal", "relay", "unknown"] as const;
export const EscrowTransferSchema = z.object({
  id: z.string(), // `${tx_hash}:${signedIdx}:${intentIdx}:${token}`
  tx_hash: z.string(),
  ts: z.string(), // ISO
  intent_type: z.string(),
  from_account: z.string(),
  to_account: z.string().nullable(),
  token: z.string(), // e.g. "nep141:17208628f8...a1" (USDC, 6 decimals)
  amount: z.string(), // raw base units
  succeeded: z.boolean().nullable(),
  kind: z.enum(TRANSFER_KINDS),
  kind_method: z.enum(["api", "memo", "heuristic"]),
  memo: z.string().nullable(),
});
export type EscrowTransfer = z.infer<typeof EscrowTransferSchema>;

/** Well-known tokens seen in escrow intents. */
export const KNOWN_TOKENS: Record<string, { symbol: string; decimals: number }> = {
  "nep141:17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1": { symbol: "USDC", decimals: 6 },
  "nep141:wrap.near": { symbol: "wNEAR", decimals: 24 },
  "native:near": { symbol: "NEAR", decimals: 24 },
};
