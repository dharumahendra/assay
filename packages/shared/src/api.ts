import { z } from "zod";

/**
 * Read API response types (05 §8) — FREEZE #1 (T2.6).
 * The API service validates its own responses against these in tests; the web app imports them.
 * Change here first (and in docs/05 §8), then in code.
 */

/** Trust Score algorithm version (05 §5.2 + ts-0.2 addendum). Bump when the formula or gate changes. */
export const TRUST_ALGO_VERSION = "ts-0.2";

export const TRUST_BANDS = ["Strong record", "Some record", "Weak record", "Insufficient data"] as const;
export const TrustBandSchema = z.enum(TRUST_BANDS);
export type TrustBand = z.infer<typeof TrustBandSchema>;

export const MAPPING_METHODS = ["api", "reward_tx", "unknown"] as const;
export const MappingMethodSchema = z.enum(MAPPING_METHODS);
export type MappingMethod = z.infer<typeof MappingMethodSchema>;

export const DATA_MODES = ["live", "snapshot", "recorded"] as const;
export const DataModeSchema = z.enum(DATA_MODES);
export type DataMode = z.infer<typeof DataModeSchema>;

/** Linked bidding pattern thresholds (05 §5.3). Shown on the pattern page and /methodology. */
export const PATTERN_THRESHOLDS = {
  twin_amount_pct: 0.01,
  twin_max_dt_seconds: 600,
  twin_same_eta: true,
  edge_min_co_jobs: 3,
  edge_min_twin_ratio: 0.6,
} as const;

export const PATTERN_DISCLAIMER = "This is a statistical pattern, not proof of common ownership.";

// ---------- links (one place, so BE and FE agree) ----------

export const nearblocksTxUrl = (txHash: string) => `https://nearblocks.io/txns/${txHash}`;
export const nearblocksAccountUrl = (account: string) => `https://nearblocks.io/address/${account}`;
export const marketJobUrl = (jobId: string) => `https://market.near.ai/jobs/${jobId}`;
/** Assumed public profile route; agents are addressed by handle on market.near.ai. */
export const marketAgentUrl = (handle: string) => `https://market.near.ai/agents/${handle}`;

// ---------- common ----------

export const ErrorBodySchema = z.object({ error: z.object({ code: z.string(), message: z.string() }) });
export type ErrorBody = z.infer<typeof ErrorBodySchema>;

const page = <T extends z.ZodTypeAny>(item: T) => z.object({ data: z.array(item), next: z.string().nullable() });

// ---------- /health, /meta ----------

export const HealthSchema = z.object({
  ok: z.boolean(),
  status: z.enum(["ok", "degraded"]),
  mode: DataModeSchema,
  last_sync: z.string().nullable(),
  last_block: z.number().nullable(),
  sources: z.array(
    z.object({ source: z.string(), last_ok_at: z.string().nullable(), error: z.string().nullable() }),
  ),
});
export type Health = z.infer<typeof HealthSchema>;

export const SnapshotInfoSchema = z.object({ file: z.string(), sha256: z.string(), taken_at: z.string() });

export const MetaSchema = z.object({
  mode: DataModeSchema,
  snapshot: SnapshotInfoSchema.nullable(),
  network: z.string(),
  contract_id: z.string().nullable(),
  algo_version: z.string(),
  trust_computed_at: z.string().nullable(),
  /** Honest notes about data coverage (NFR-HONEST-1), e.g. "bids are private since market API v2". */
  data_notes: z.array(z.string()),
});
export type Meta = z.infer<typeof MetaSchema>;

// ---------- /insights ----------

export const MetricWindowSchema = z.enum(["all", "30d"]);
export type MetricWindow = z.infer<typeof MetricWindowSchema>;

export const InsightSchema = z.object({
  id: z.string(),
  window: MetricWindowSchema,
  value: z.number().nullable(),
  numerator: z.number().nullable(),
  denominator: z.number().nullable(),
  unit: z.string().nullable(),
  note: z.string().nullable(),
  computed_at: z.string(),
});
export type Insight = z.infer<typeof InsightSchema>;

export const InsightsResponseSchema = z.object({ window: MetricWindowSchema, data: z.array(InsightSchema) });
export type InsightsResponse = z.infer<typeof InsightsResponseSchema>;

/** One record behind a metric, for the Source drawer (FR-A5). */
export const SourceRecordSchema = z.object({
  group: z.string(),
  kind: z.enum(["tx", "agent", "job", "endpoint", "value"]),
  id: z.string(),
  label: z.string().nullable(),
  url: z.string().nullable(),
  extra: z.record(z.unknown()).nullable(),
});
export type SourceRecord = z.infer<typeof SourceRecordSchema>;

export const InsightRecordsResponseSchema = page(SourceRecordSchema).extend({
  metric_id: z.string(),
  window: MetricWindowSchema,
});
export type InsightRecordsResponse = z.infer<typeof InsightRecordsResponseSchema>;

// ---------- trust ----------

export const TrustComponentsSchema = z.object({ D: z.number(), H: z.number(), I: z.number(), P: z.number() });
export type TrustComponents = z.infer<typeof TrustComponentsSchema>;

export const TrustInputsSchema = z.object({
  n_bids: z.number(),
  n_awarded: z.number().nullable(),
  n_completed: z.number(),
  completion_ratio: z.number().nullable(),
  n_paid_onchain: z.number(),
  earned_onchain: z.record(z.string()), // token → raw amount
  n_refund_after_award: z.number().nullable(),
  n_disputed: z.number(),
  bids_per_active_day: z.number(),
  twin_ratio_self: z.number(),
  in_cluster: z.boolean(),
  shared_funder: z.boolean(),
  mapped: z.boolean(),
  /** Where each input came from, e.g. { n_completed: "market:/v1/agents delivered_jobs" }. */
  sources: z.record(z.string()),
});
export type TrustInputs = z.infer<typeof TrustInputsSchema>;

export const TrustBriefSchema = z.object({ score: z.number().nullable(), band: TrustBandSchema });
export type TrustBrief = z.infer<typeof TrustBriefSchema>;

export const TrustViewSchema = TrustBriefSchema.extend({
  components: TrustComponentsSchema.nullable(),
  inputs: TrustInputsSchema,
  algo_version: z.string(),
  computed_at: z.string(),
  flags: z.array(z.string()),
});
export type TrustView = z.infer<typeof TrustViewSchema>;

// ---------- /jobs ----------

export const BudgetSchema = z.object({ amount: z.string().nullable(), token: z.string().nullable() });

export const JobSummarySchema = z.object({
  id: z.string(),
  title: z.string().nullable(),
  status: z.string().nullable(),
  budget: BudgetSchema,
  bid_count: z.number(),
  flagged_bids: z.number(),
  created_at: z.string().nullable(),
  market_url: z.string(),
});
export type JobSummary = z.infer<typeof JobSummarySchema>;

export const JobsResponseSchema = page(JobSummarySchema);
export type JobsResponse = z.infer<typeof JobsResponseSchema>;

export const BidViewSchema = z.object({
  id: z.string(),
  agent: z.object({ id: z.string(), handle: z.string().nullable(), mapped: z.boolean() }),
  amount: z.string().nullable(),
  eta_seconds: z.number().nullable(),
  created_at: z.string().nullable(),
  status: z.string().nullable(),
  trust: TrustBriefSchema.nullable(),
  patterns: z.array(z.string()),
});
export type BidView = z.infer<typeof BidViewSchema>;

export const JobDetailSchema = z.object({
  job: JobSummarySchema.extend({
    description: z.string().nullable(),
    tags: z.array(z.string()),
    creator_id: z.string().nullable(),
    awarded_agent_id: z.string().nullable(),
  }),
  bids: z.array(BidViewSchema),
  criteria_docs: z.array(z.object({ id: z.string(), blob_sha256: z.string(), created_at: z.string() })),
});
export type JobDetail = z.infer<typeof JobDetailSchema>;

// ---------- /agents ----------

export const AgentSummarySchema = z.object({
  id: z.string(),
  handle: z.string(),
  name: z.string().nullable(),
  score: z.number().nullable(),
  band: TrustBandSchema,
  mapped: z.boolean(),
  delivered_jobs: z.number().nullable(),
  market_overall: z.number().nullable(),
  patterns: z.array(z.string()),
});
export type AgentSummary = z.infer<typeof AgentSummarySchema>;

export const AgentsResponseSchema = page(AgentSummarySchema);
export type AgentsResponse = z.infer<typeof AgentsResponseSchema>;

export const OnchainSettlementSchema = z.object({
  tx_hash: z.string(),
  amount: z.string(),
  token: z.string(),
  ts: z.string(),
  url: z.string(),
});

export const AgentDetailSchema = z.object({
  identity: z.object({
    id: z.string(),
    handle: z.string(),
    name: z.string().nullable(),
    category: z.string().nullable(),
    near_account: z.string().nullable(),
    mapping_method: MappingMethodSchema,
    market_url: z.string(),
    account_url: z.string().nullable(),
  }),
  trust: TrustViewSchema.nullable(),
  market_history: z.object({
    delivered_jobs: z.number().nullable(),
    success_rate: z.number().nullable(),
    created_at: z.string().nullable(),
    reputation: z
      .object({
        overall: z.number().nullable(),
        axes: z.record(z.number().nullable()),
        jobs_counted: z.number(),
        computed_at: z.string().nullable(),
      })
      .nullable(),
  }),
  onchain_settlements: z.array(OnchainSettlementSchema),
  /** From the Juri contract (`get_agent_stats`), filled after P3; null until then. */
  juri_stats: z
    .object({
      worker_settled: z.number(),
      worker_passed: z.number(),
      worker_failed: z.number(),
      worker_earned: z.string(),
      requester_jobs: z.number(),
    })
    .nullable(),
  patterns: z.array(z.string()),
});
export type AgentDetail = z.infer<typeof AgentDetailSchema>;

// ---------- /patterns ----------

export const PatternMemberSchema = z.object({ id: z.string(), handle: z.string().nullable() });

export const PatternSummarySchema = z.object({
  id: z.string(),
  size: z.number(),
  edge_count: z.number(),
  members: z.array(PatternMemberSchema),
  computed_at: z.string(),
});
export type PatternSummary = z.infer<typeof PatternSummarySchema>;

export const PatternsResponseSchema = z.object({ data: z.array(PatternSummarySchema) });
export type PatternsResponse = z.infer<typeof PatternsResponseSchema>;

export const BidEvidenceSchema = z.object({
  bid_id: z.string(),
  agent_id: z.string(),
  amount: z.string().nullable(),
  eta_seconds: z.number().nullable(),
  created_at: z.string().nullable(),
});

/** One shared job behind a co_bid edge. */
export const CoJobEvidenceSchema = z.object({
  job_id: z.string(),
  twin: z.boolean(),
  a: BidEvidenceSchema,
  b: BidEvidenceSchema,
  dt_seconds: z.number().nullable(),
});
export type CoJobEvidence = z.infer<typeof CoJobEvidenceSchema>;

export const SharedFunderEvidenceSchema = z.object({
  funder: z.string(),
  a_account: z.string(),
  b_account: z.string(),
});

export const PatternEdgeSchema = z.object({
  a: z.string(),
  b: z.string(),
  type: z.enum(["co_bid", "shared_funder"]),
  co_jobs: z.number().nullable(),
  twin_jobs: z.number().nullable(),
  evidence: z.union([z.array(CoJobEvidenceSchema), SharedFunderEvidenceSchema]),
});
export type PatternEdge = z.infer<typeof PatternEdgeSchema>;

export const PatternDetailSchema = PatternSummarySchema.extend({
  label: z.literal("Linked bidding pattern (heuristic)"),
  edges: z.array(PatternEdgeSchema),
  thresholds: z.object({
    twin_amount_pct: z.number(),
    twin_max_dt_seconds: z.number(),
    twin_same_eta: z.boolean(),
    edge_min_co_jobs: z.number(),
    edge_min_twin_ratio: z.number(),
  }),
  disclaimer: z.string(),
});
export type PatternDetail = z.infer<typeof PatternDetailSchema>;

// ---------- /blobs ----------

export const BLOB_KINDS = ["criteria", "deliverable", "evidence", "attestation"] as const;
export const BlobKindSchema = z.enum(BLOB_KINDS);
export type BlobKind = z.infer<typeof BlobKindSchema>;

/** Max content length per kind, in characters (NFR-SEC-3). */
export const BLOB_MAX_CHARS: Record<BlobKind, number> = {
  criteria: 64_000,
  deliverable: 50_000,
  evidence: 256_000,
  // NEAR AI attestation reports (TDX quote + NVIDIA payload + event log) are ≈0.3–1 MB. Written by the jury
  // runner; public POST /api/blobs is still capped at 1 MB per request.
  attestation: 2_000_000,
};

export const BlobPutRequestSchema = z.object({
  kind: BlobKindSchema,
  /** A string is stored as-is (UTF-8); an object/array is stored as canonical JSON (FR-C5). */
  content: z.union([z.string(), z.record(z.unknown()), z.array(z.unknown())]),
});
export type BlobPutRequest = z.infer<typeof BlobPutRequestSchema>;

export const BlobPutResponseSchema = z.object({
  sha256: z.string(),
  uri: z.string(),
  size: z.number(),
  kind: BlobKindSchema,
  content_type: z.string(),
});
export type BlobPutResponse = z.infer<typeof BlobPutResponseSchema>;
