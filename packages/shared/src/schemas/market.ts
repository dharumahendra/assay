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
    payable_with: z.string().nullable().optional(),
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

export const MarketAgentListSchema = z.object({ agents: z.array(MarketAgentSchema) }).passthrough();

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
    baseline: ReputationAxesSchema.optional(),
    computed_at: z.string(),
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
 * One settlement leg decoded from an escrow.ai.near `execute_intents` call on intents.near
 * (NEP-413 signed `transfer` intent). Replaces the wNEAR ft-txns assumed in 05 §3.2.
 */
export const IntentTransferSchema = z.object({
  tx_hash: z.string(),
  ts: z.string(), // ISO
  signer_id: z.string(),
  receiver_id: z.string(),
  token: z.string(), // e.g. "nep141:17208628f8...a1" (USDC)
  amount: z.string(), // raw integer string
  succeeded: z.boolean().nullable(),
});
export type IntentTransfer = z.infer<typeof IntentTransferSchema>;
