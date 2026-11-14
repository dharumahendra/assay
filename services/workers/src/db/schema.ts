import { sqliteTable, text, integer, real, primaryKey, index } from "drizzle-orm/sqlite-core";

/**
 * SQLite schema (05 §2), adapted to market API v2 + decision 1a (docs/phase0-findings.md):
 * - jobs/bids are no longer public → market_jobs/market_bids are only filled for Juri's own jobs.
 * - escrow settles through intents.near → escrow_txns (raw) + escrow_transfers (decoded intents).
 * Amounts are raw integer strings (token base units). Timestamps are ISO strings.
 */

export const marketAgents = sqliteTable("market_agents", {
  id: text("id").primaryKey(), // market agent UUID
  handle: text("handle").notNull(),
  name: text("name"),
  ownerAccountId: text("owner_account_id"), // market account UUID, not NEAR
  category: text("category"),
  deliveredJobs: integer("delivered_jobs"),
  successRate: real("success_rate"),
  createdAt: text("created_at"),
  nearAccount: text("near_account"),
  mappingMethod: text("mapping_method", { enum: ["api", "reward_tx", "unknown"] }).notNull().default("unknown"),
  rawJson: text("raw_json").notNull(),
  fetchedAt: text("fetched_at").notNull(),
});

export const marketReputation = sqliteTable("market_reputation", {
  agentId: text("agent_id").primaryKey(),
  overall: real("overall"),
  axesJson: text("axes_json").notNull(),
  jobsCounted: integer("jobs_counted").notNull(),
  computedAt: text("computed_at"),
  rawJson: text("raw_json").notNull(),
  fetchedAt: text("fetched_at").notNull(),
});

export const platformStats = sqliteTable("platform_stats", {
  fetchedAt: text("fetched_at").primaryKey(),
  liveAgents: integer("live_agents").notNull(),
  jobsTotal: integer("jobs_total").notNull(),
  jobsThisWeek: integer("jobs_this_week").notNull(),
  activeHires: integer("active_hires").notNull(),
  deliveredJobs: integer("delivered_jobs").notNull(),
  rawJson: text("raw_json").notNull(),
});

/** One page of the market job board, read with the Assay agent token (no creator name kept). */
export const marketJobs = sqliteTable("market_jobs", {
  id: text("id").primaryKey(),
  title: text("title"),
  description: text("description"),
  status: text("status"),
  budgetAmount: text("budget_amount"),
  budgetToken: text("budget_token"),
  tagsJson: text("tags_json"),
  creatorId: text("creator_id"),
  awardedAgentId: text("awarded_agent_id"),
  createdAt: text("created_at"),
  rawJson: text("raw_json").notNull(),
  fetchedAt: text("fetched_at").notNull(),
});

export const marketBids = sqliteTable("market_bids", {
  id: text("id").primaryKey(),
  jobId: text("job_id").notNull(),
  agentId: text("agent_id").notNull(),
  amount: text("amount"),
  etaSeconds: integer("eta_seconds"),
  status: text("status"),
  createdAt: text("created_at"),
  proposal: text("proposal"),
  rawJson: text("raw_json").notNull(),
});

/** Raw escrow.ai.near transactions (NearBlocks), one row per tx. */
export const escrowTxns = sqliteTable(
  "escrow_txns",
  {
    txHash: text("tx_hash").primaryKey(),
    nbId: text("nb_id").notNull(), // NearBlocks row id (cursor)
    blockHeight: integer("block_height").notNull(),
    ts: text("ts").notNull(),
    signer: text("signer").notNull(),
    receiver: text("receiver").notNull(),
    method: text("method"),
    succeeded: integer("succeeded", { mode: "boolean" }),
    rawJson: text("raw_json").notNull(),
  },
  (t) => [index("escrow_txns_ts").on(t.ts)],
);

// Same list as @juri/shared TRANSFER_KINDS (drizzle-kit cannot load workspace TS imports;
// equality is asserted in workers.test.ts).
export const TRANSFER_KINDS = ["deposit", "reward", "refund", "fee", "internal", "relay", "unknown"] as const;
export type TransferKind = (typeof TRANSFER_KINDS)[number];

/** One token leg of one intent inside an escrow `execute_intents` tx. */
export const escrowTransfers = sqliteTable(
  "escrow_transfers",
  {
    id: text("id").primaryKey(), // `${tx_hash}:${signedIdx}:${intentIdx}:${token}`
    txHash: text("tx_hash").notNull(),
    ts: text("ts").notNull(),
    intentType: text("intent_type").notNull(),
    fromAccount: text("from_account").notNull(), // intent signer_id
    toAccount: text("to_account"),
    token: text("token").notNull(),
    amount: text("amount").notNull(),
    succeeded: integer("succeeded", { mode: "boolean" }),
    kind: text("kind", { enum: TRANSFER_KINDS }).notNull(),
    kindMethod: text("kind_method", { enum: ["api", "memo", "heuristic"] }).notNull(),
    memo: text("memo"),
  },
  (t) => [index("escrow_transfers_kind").on(t.kind), index("escrow_transfers_to").on(t.toAccount)],
);

export const accountFunders = sqliteTable("account_funders", {
  account: text("account").primaryKey(),
  funder: text("funder"),
  firstTxHash: text("first_tx_hash"),
  ts: text("ts"),
  excluded: integer("excluded", { mode: "boolean" }).notNull().default(false),
});

export const metrics = sqliteTable(
  "metrics",
  {
    id: text("id").notNull(), // M1..M5
    window: text("window").notNull(), // all | 30d
    value: real("value"),
    numerator: real("numerator"),
    denominator: real("denominator"),
    unit: text("unit"),
    note: text("note"),
    computedAt: text("computed_at").notNull(),
    sourcesJson: text("sources_json").notNull(),
  },
  (t) => [primaryKey({ columns: [t.id, t.window] })],
);

export const trustScores = sqliteTable(
  "trust_scores",
  {
    agentId: text("agent_id").notNull(),
    algoVersion: text("algo_version").notNull(),
    score: real("score"),
    band: text("band").notNull(),
    componentsJson: text("components_json").notNull(),
    inputsJson: text("inputs_json").notNull(),
    computedAt: text("computed_at").notNull(),
    snapshotId: text("snapshot_id"),
  },
  (t) => [primaryKey({ columns: [t.agentId, t.algoVersion] })],
);

export const patternEdges = sqliteTable(
  "pattern_edges",
  {
    a: text("a").notNull(),
    b: text("b").notNull(),
    type: text("type", { enum: ["co_bid", "shared_funder"] }).notNull(),
    coJobs: integer("co_jobs"),
    twinJobs: integer("twin_jobs"),
    evidenceJson: text("evidence_json").notNull(),
  },
  (t) => [primaryKey({ columns: [t.a, t.b, t.type] })],
);

export const patterns = sqliteTable("patterns", {
  id: text("id").primaryKey(),
  membersJson: text("members_json").notNull(),
  size: integer("size").notNull(),
  edgeCount: integer("edge_count").notNull(),
  computedAt: text("computed_at").notNull(),
});

export const blobs = sqliteTable("blobs", {
  sha256: text("sha256").primaryKey(),
  kind: text("kind").notNull(),
  size: integer("size").notNull(),
  contentType: text("content_type").notNull(),
  path: text("path").notNull(),
  createdAt: text("created_at").notNull(),
});

export const criteriaDocs = sqliteTable("criteria_docs", {
  id: text("id").primaryKey(),
  blobSha256: text("blob_sha256").notNull(),
  marketJobId: text("market_job_id"),
  createdAt: text("created_at").notNull(),
});

export const runnerState = sqliteTable(
  "runner_state",
  {
    jobId: text("job_id").notNull(),
    verifier: text("verifier").notNull(),
    phase: text("phase", { enum: ["judged", "committed", "revealed", "failed"] }).notNull(),
    salt: text("salt"),
    evidenceSha: text("evidence_sha"),
    attestationSha: text("attestation_sha"),
    commitTx: text("commit_tx"),
    revealTx: text("reveal_tx"),
    error: text("error"),
    updatedAt: text("updated_at").notNull(),
  },
  (t) => [primaryKey({ columns: [t.jobId, t.verifier] })],
);

export const snapshots = sqliteTable("snapshots", {
  id: text("id").primaryKey(),
  file: text("file").notNull(),
  sha256: text("sha256").notNull(),
  takenAt: text("taken_at").notNull(),
});

/** Small key/value facts about sources (e.g. escrow tx totals), with provenance. */
export const sourceFacts = sqliteTable("source_facts", {
  key: text("key").primaryKey(),
  valueJson: text("value_json").notNull(),
  source: text("source").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const syncState = sqliteTable("sync_state", {
  source: text("source").primaryKey(),
  cursor: text("cursor"),
  lastRunAt: text("last_run_at"),
  lastOkAt: text("last_ok_at"),
  error: text("error"),
});
