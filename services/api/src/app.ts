import {
  BlobPutRequestSchema,
  MetricWindowSchema,
  PATTERN_DISCLAIMER,
  PATTERN_THRESHOLDS,
  TRUST_ALGO_VERSION,
  marketAgentUrl,
  marketJobUrl,
  nearblocksAccountUrl,
  nearblocksTxUrl,
  type AgentDetail,
  type AgentSummary,
  type AgentsResponse,
  type BidView,
  type DataMode,
  type Health,
  type Insight,
  type InsightRecordsResponse,
  type InsightsResponse,
  type JobDetail,
  type JobSummary,
  type JobsResponse,
  type MappingMethod,
  type Meta,
  type PatternDetail,
  type PatternEdge,
  type PatternSummary,
  type PatternsResponse,
  type TrustBand,
  type TrustView,
} from "@juri/shared";
import type { Db } from "@juri/workers/src/db/index.js";
import { CompileError, compileCriteria, ProviderError, type JudgeProvider } from "@juri/jury";
import {
  CompileRequestSchema,
  CriteriaDocSchema,
  criteriaHash,
  EvidenceSchema,
  type ContractJob,
  type CriteriaDoc,
  type DeliverableMeta,
  type Evidence,
  type JurorView,
  type ProtectedDetail,
  type ProtectedListResponse,
  type TreasuryResponse,
  type VerifiersResponse,
} from "@juri/shared";
import { RpcError, type ContractReader } from "./contract.js";
import { randomUUID } from "node:crypto";
import { Hono, type Context } from "hono";
import { bodyLimit } from "hono/body-limit";
import { cors } from "hono/cors";
import { z } from "zod";
import { BlobError, getBlob, putBlob } from "./blobs.js";
import { rateLimit } from "./ratelimit.js";
import { flattenSources } from "./records.js";
import { skillMd } from "./skill.js";

/**
 * Read API (05 §8, FR-H1): health, meta, insights, jobs, agents, patterns, blobs, criteria/compile (P4),
 * and protected / verifiers / treasury (contract views joined with the jury runner's blobs and state).
 * Reads the SQLite file the workers write; calls out only to the configured LLM (compile) and NEAR RPC (views).
 */
export interface AppConfig {
  db: Db;
  mode: DataMode;
  blobDir: string;
  publicUrl: string;
  network: string;
  contractId: string | null;
  /** Live sync older than this → /health status "degraded" (05 §10). */
  staleAfterMs?: number;
  rateLimits?: { get: number; blobs: number; compile?: number };
  /** Reverse proxies in front of the API (TRUST_PROXY); 0 = ignore X-Forwarded-For (it can be forged). */
  trustProxy?: number;
  /** Spec Compiler provider (P4); null → POST /criteria/compile answers 503 no_llm. */
  compiler?: () => JudgeProvider | null;
  /** Juri contract views for /protected, /verifiers, /treasury; absent → 503 no_contract. */
  contract?: ContractReader | null;
  /** Explorer base for links, e.g. https://testnet.nearblocks.io */
  explorerUrl?: string;
  now?: () => Date;
}

const DATA_NOTES = [
  "market.near.ai API v2: job board and bids require an agent token, so bids are only known for Juri's own jobs.",
  "Market agent objects carry market UUIDs, not NEAR accounts; most agents are Unmapped.",
  "escrow.ai.near settles through NEAR Intents (intents.near); transfer kinds are classified heuristically (kind_method).",
  "Trust Score and linked bidding patterns are heuristics, not accusations.",
];

// ---------- helpers ----------

class ApiError extends Error {
  constructor(
    readonly status: 400 | 404 | 413 | 422 | 502 | 503,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
  }
}

const parseJson = <T>(s: string | null | undefined, d: T): T => {
  if (!s) return d;
  try {
    return JSON.parse(s) as T;
  } catch {
    return d;
  }
};

const PageQuery = z.object({
  cursor: z
    .string()
    .regex(/^\d{1,9}$/, "cursor must be an offset returned as `next`")
    .optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

function q<T extends z.ZodTypeAny>(c: Context, schema: T): z.infer<T> {
  const r = schema.safeParse(c.req.query());
  if (!r.success) throw new ApiError(400, "invalid_query", r.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "));
  return r.data;
}

function paginate<T>(rows: T[], cursor: string | undefined, limit: number): { data: T[]; next: string | null } {
  const off = cursor ? Number(cursor) : 0;
  const data = rows.slice(off, off + limit);
  return { data, next: off + limit < rows.length ? String(off + limit) : null };
}

interface AgentRow {
  id: string;
  handle: string;
  name: string | null;
  category: string | null;
  delivered_jobs: number | null;
  success_rate: number | null;
  created_at: string | null;
  near_account: string | null;
  mapping_method: MappingMethod;
}
interface TrustRow {
  agent_id: string;
  score: number | null;
  band: TrustBand;
  components_json: string;
  inputs_json: string;
  algo_version: string;
  computed_at: string;
}

// ---------- app ----------

export function createApp(cfg: AppConfig): Hono {
  const { db } = cfg;
  const sql = db.$client;
  const now = cfg.now ?? (() => new Date());
  const app = new Hono();

  app.use(
    "*",
    cors({ origin: "*", allowMethods: ["GET", "POST", "OPTIONS"], exposeHeaders: ["X-Content-SHA256", "X-Criteria-SHA256", "X-Model", "X-Provider"] }),
  );
  const trustProxy = cfg.trustProxy ?? 0;
  const getLimit = rateLimit({ name: "read", max: cfg.rateLimits?.get ?? 60, trustProxy });
  const blobLimit = rateLimit({ name: "blobs", max: cfg.rateLimits?.blobs ?? 20, trustProxy });
  const compileLimit = rateLimit({ name: "compile", max: cfg.rateLimits?.compile ?? 5, trustProxy });
  app.use("/api/*", async (c, next) => (c.req.method === "GET" ? getLimit(c, next) : next()));
  // Body caps that also hold for chunked uploads without Content-Length (NFR-SEC-3).
  const tooLarge = (max: string) => (c: Context) => c.json({ error: { code: "too_large", message: `request body exceeds ${max}` } }, 413);
  const blobBody = bodyLimit({ maxSize: 1_048_576, onError: tooLarge("1 MB") });
  const compileBody = bodyLimit({ maxSize: 65_536, onError: tooLarge("64 KB") });

  app.onError((err, c) => {
    if (err instanceof ApiError)
      return c.json({ error: { code: err.code, message: err.message, ...(err.details ? { details: err.details } : {}) } }, err.status);
    if (err instanceof BlobError)
      return c.json({ error: { code: err.code, message: err.message } }, err.status);
    if (err instanceof RpcError || (err instanceof Error && err.name === "TimeoutError"))
      return c.json({ error: { code: "rpc_error", message: `contract RPC failed: ${err.message}`.slice(0, 300) } }, 502);
    console.error(err);
    return c.json({ error: { code: "internal", message: "Internal error" } }, 500);
  });
  // FR-H2: agent guide (root path, not /api; the web app rewrites /skill.md here)
  app.get("/skill.md", (c) =>
    c.body(skillMd({ publicUrl: cfg.publicUrl, network: cfg.network, contractId: cfg.contractId }), 200, { "content-type": "text/markdown; charset=utf-8", "cache-control": "public, max-age=300" }),
  );

  app.notFound((c) => c.json({ error: { code: "not_found", message: `No route ${c.req.method} ${c.req.path}` } }, 404));

  // ---- shared lookups (small tables; read per request so the API always sees the latest run) ----
  const agentPatterns = (): Map<string, string[]> => {
    const m = new Map<string, string[]>();
    for (const p of sql.prepare(`SELECT id, members_json FROM patterns ORDER BY size DESC, id`).all() as {
      id: string;
      members_json: string;
    }[])
      for (const a of parseJson<string[]>(p.members_json, [])) m.set(a, [...(m.get(a) ?? []), p.id]);
    return m;
  };
  const trustRow = (agentId: string) =>
    sql
      .prepare(`SELECT * FROM trust_scores WHERE agent_id = ? AND algo_version = ?`)
      .get(agentId, TRUST_ALGO_VERSION) as TrustRow | undefined;
  const toTrustView = (t: TrustRow): TrustView => {
    const inputs = parseJson<Record<string, unknown>>(t.inputs_json, {});
    const { flags, mapping_candidates: _mc, ...rest } = inputs as { flags?: string[]; mapping_candidates?: unknown };
    return {
      score: t.score,
      band: t.band,
      components: parseJson(t.components_json, null),
      inputs: rest as TrustView["inputs"],
      algo_version: t.algo_version,
      computed_at: t.computed_at,
      flags: flags ?? [],
    };
  };
  const handleMap = () =>
    new Map((sql.prepare(`SELECT id, handle FROM market_agents`).all() as { id: string; handle: string }[]).map((r) => [r.id, r.handle]));

  // ---- /health, /meta ----
  app.get("/api/health", (c) => {
    const sources = sql.prepare(`SELECT source, last_ok_at, error FROM sync_state ORDER BY source`).all() as Health["sources"];
    const lastSync = sources.reduce<string | null>((m, s) => (s.last_ok_at && (!m || s.last_ok_at > m) ? s.last_ok_at : m), null);
    const lastBlock = (sql.prepare(`SELECT max(block_height) AS b FROM escrow_txns`).get() as { b: number | null }).b;
    const stale = cfg.mode === "live" && (!lastSync || now().getTime() - Date.parse(lastSync) > (cfg.staleAfterMs ?? 30 * 60_000));
    const body: Health = { ok: true, status: stale ? "degraded" : "ok", mode: cfg.mode, last_sync: lastSync, last_block: lastBlock, sources };
    return c.json(body);
  });

  app.get("/api/meta", (c) => {
    const snap = sql.prepare(`SELECT file, sha256, taken_at FROM snapshots ORDER BY taken_at DESC LIMIT 1`).get() as Meta["snapshot"] | undefined;
    const tr = sql.prepare(`SELECT max(computed_at) AS t FROM trust_scores WHERE algo_version = ?`).get(TRUST_ALGO_VERSION) as { t: string | null };
    const body: Meta = {
      mode: cfg.mode,
      snapshot: snap ?? null,
      network: cfg.network,
      contract_id: cfg.contractId,
      algo_version: TRUST_ALGO_VERSION,
      trust_computed_at: tr.t,
      data_notes: DATA_NOTES,
    };
    return c.json(body);
  });

  // ---- /insights ----
  type MetricDb = { id: string; window: "all" | "30d"; value: number | null; numerator: number | null; denominator: number | null; unit: string | null; note: string | null; computed_at: string; sources_json: string };
  const metricsFor = (window: "all" | "30d"): MetricDb[] => {
    const rows = sql.prepare(`SELECT * FROM metrics ORDER BY id`).all() as MetricDb[];
    const byId = new Map<string, MetricDb>();
    for (const r of rows) {
      // Prefer the requested window; fall back to "all" for metrics without a 30d variant.
      const cur = byId.get(r.id);
      if (!cur || (r.window === window && cur.window !== window)) byId.set(r.id, r);
    }
    return [...byId.values()];
  };

  app.get("/api/insights", (c) => {
    const { window } = q(c, z.object({ window: MetricWindowSchema.default("all") }));
    const data: Insight[] = metricsFor(window).map(({ sources_json: _s, ...m }) => m);
    return c.json({ window, data } satisfies InsightsResponse);
  });

  app.get("/api/insights/:metricId/records", (c) => {
    const { window, cursor, limit } = q(c, PageQuery.extend({ window: MetricWindowSchema.default("all") }));
    const id = c.req.param("metricId");
    const m = metricsFor(window).find((r) => r.id === id);
    if (!m) throw new ApiError(404, "not_found", `metric ${id} not found`);
    const records = flattenSources(parseJson(m.sources_json, null), handleMap());
    return c.json({ metric_id: id, window: m.window, ...paginate(records, cursor, limit) } satisfies InsightRecordsResponse);
  });

  // ---- /jobs ----
  type JobDb = { id: string; title: string | null; description: string | null; status: string | null; budget_amount: string | null; budget_token: string | null; tags_json: string | null; creator_id: string | null; awarded_agent_id: string | null; created_at: string | null };
  const jobSummary = (j: JobDb, bids: { agent_id: string }[], pats: Map<string, string[]>): JobSummary => ({
    id: j.id,
    title: j.title,
    status: j.status,
    budget: { amount: j.budget_amount, token: j.budget_token },
    bid_count: bids.length,
    flagged_bids: bids.filter((b) => pats.has(b.agent_id)).length,
    created_at: j.created_at,
    market_url: marketJobUrl(j.id),
  });

  app.get("/api/jobs", (c) => {
    const { status, tag, q: text, cursor, limit } = q(c, PageQuery.extend({ status: z.string().optional(), tag: z.string().optional(), q: z.string().max(200).optional() }));
    const where: string[] = [];
    const args: string[] = [];
    if (status) (where.push("status = ?"), args.push(status));
    if (tag) (where.push("tags_json LIKE ?"), args.push(`%${JSON.stringify(tag)}%`));
    if (text) (where.push("(title LIKE ? OR description LIKE ?)"), args.push(`%${text}%`, `%${text}%`));
    const jobs = sql
      .prepare(`SELECT * FROM market_jobs ${where.length ? `WHERE ${where.join(" AND ")}` : ""} ORDER BY created_at DESC, id`)
      .all(...args) as JobDb[];
    const pats = agentPatterns();
    const bidsByJob = new Map<string, { agent_id: string }[]>();
    for (const b of sql.prepare(`SELECT job_id, agent_id FROM market_bids`).all() as { job_id: string; agent_id: string }[])
      bidsByJob.set(b.job_id, [...(bidsByJob.get(b.job_id) ?? []), b]);
    const page = paginate(jobs, cursor, limit);
    return c.json({ data: page.data.map((j) => jobSummary(j, bidsByJob.get(j.id) ?? [], pats)), next: page.next } satisfies JobsResponse);
  });

  app.get("/api/jobs/:marketJobId", (c) => {
    const id = c.req.param("marketJobId");
    const j = sql.prepare(`SELECT * FROM market_jobs WHERE id = ?`).get(id) as JobDb | undefined;
    if (!j)
      throw new ApiError(404, "not_found", "job not in this dataset (only one recent page of the market job board is synced)");
    type BidDb = { id: string; agent_id: string; amount: string | null; eta_seconds: number | null; status: string | null; created_at: string | null };
    const bids = sql.prepare(`SELECT * FROM market_bids WHERE job_id = ? ORDER BY created_at, id`).all(id) as BidDb[];
    const pats = agentPatterns();
    const agents = new Map(
      (sql.prepare(`SELECT id, handle, near_account FROM market_agents`).all() as { id: string; handle: string; near_account: string | null }[]).map((a) => [a.id, a]),
    );
    const bidViews: BidView[] = bids.map((b) => {
      const t = trustRow(b.agent_id);
      const a = agents.get(b.agent_id);
      return {
        id: b.id,
        agent: { id: b.agent_id, handle: a?.handle ?? null, mapped: !!a?.near_account },
        amount: b.amount,
        eta_seconds: b.eta_seconds,
        created_at: b.created_at,
        status: b.status,
        trust: t ? { score: t.score, band: t.band } : null,
        patterns: pats.get(b.agent_id) ?? [],
      };
    });
    const criteria = sql
      .prepare(`SELECT id, blob_sha256, created_at FROM criteria_docs WHERE market_job_id = ? ORDER BY created_at DESC`)
      .all(id) as JobDetail["criteria_docs"];
    const body: JobDetail = {
      job: {
        ...jobSummary(j, bids, pats),
        description: j.description,
        tags: parseJson<string[]>(j.tags_json, []),
        creator_id: j.creator_id,
        awarded_agent_id: j.awarded_agent_id,
      },
      bids: bidViews,
      criteria_docs: criteria,
    };
    return c.json(body);
  });

  // ---- /agents ----
  app.get("/api/agents", (c) => {
    const { q: text, sort, cursor, limit } = q(
      c,
      PageQuery.extend({ q: z.string().max(100).optional(), sort: z.enum(["score", "delivered", "handle"]).default("score") }),
    );
    const args: string[] = [TRUST_ALGO_VERSION];
    let where = "";
    if (text) {
      where = "WHERE a.handle LIKE ? OR a.name LIKE ?";
      args.push(`%${text}%`, `%${text}%`);
    }
    const order = {
      score: "t.score IS NULL, t.score DESC, a.delivered_jobs DESC, a.handle",
      delivered: "a.delivered_jobs IS NULL, a.delivered_jobs DESC, a.handle",
      handle: "a.handle",
    }[sort];
    const rows = sql
      .prepare(
        `SELECT a.id, a.handle, a.name, a.delivered_jobs, a.near_account, t.score, t.band, r.overall
         FROM market_agents a
         LEFT JOIN trust_scores t ON t.agent_id = a.id AND t.algo_version = ?
         LEFT JOIN market_reputation r ON r.agent_id = a.id
         ${where} ORDER BY ${order}`,
      )
      .all(...args) as { id: string; handle: string; name: string | null; delivered_jobs: number | null; near_account: string | null; score: number | null; band: TrustBand | null; overall: number | null }[];
    const pats = agentPatterns();
    const page = paginate(rows, cursor, limit);
    const data: AgentSummary[] = page.data.map((r) => ({
      id: r.id,
      handle: r.handle,
      name: r.name,
      score: r.score,
      band: r.band ?? "Insufficient data",
      mapped: !!r.near_account,
      delivered_jobs: r.delivered_jobs,
      market_overall: r.overall,
      patterns: pats.get(r.id) ?? [],
    }));
    return c.json({ data, next: page.next } satisfies AgentsResponse);
  });

  app.get("/api/agents/:agentId", (c) => {
    const id = c.req.param("agentId");
    const a = sql.prepare(`SELECT * FROM market_agents WHERE id = ? OR handle = ?`).get(id, id) as AgentRow | undefined;
    if (!a) throw new ApiError(404, "not_found", `agent ${id} not found`);
    const t = trustRow(a.id);
    const rep = sql.prepare(`SELECT * FROM market_reputation WHERE agent_id = ?`).get(a.id) as
      | { overall: number | null; axes_json: string; jobs_counted: number; computed_at: string | null }
      | undefined;
    const settlements = a.near_account
      ? (sql
          .prepare(
            `SELECT tx_hash, amount, token, ts FROM escrow_transfers
             WHERE to_account = ? AND kind = 'reward' AND succeeded = 1 ORDER BY ts DESC LIMIT 200`,
          )
          .all(a.near_account) as { tx_hash: string; amount: string; token: string; ts: string }[])
      : [];
    const body: AgentDetail = {
      identity: {
        id: a.id,
        handle: a.handle,
        name: a.name,
        category: a.category,
        near_account: a.near_account,
        mapping_method: a.mapping_method,
        market_url: marketAgentUrl(a.handle),
        account_url: a.near_account ? nearblocksAccountUrl(a.near_account) : null,
      },
      trust: t ? toTrustView(t) : null,
      market_history: {
        delivered_jobs: a.delivered_jobs,
        success_rate: a.success_rate,
        created_at: a.created_at,
        reputation: rep
          ? { overall: rep.overall, axes: parseJson(rep.axes_json, {}), jobs_counted: rep.jobs_counted, computed_at: rep.computed_at }
          : null,
      },
      onchain_settlements: settlements.map((s) => ({ ...s, url: nearblocksTxUrl(s.tx_hash) })),
      juri_stats: null,
      patterns: agentPatterns().get(a.id) ?? [],
    };
    return c.json(body);
  });

  // ---- /patterns ----
  type PatternDb = { id: string; members_json: string; size: number; edge_count: number; computed_at: string };
  const patternSummary = (p: PatternDb, handles: Map<string, string>): PatternSummary => ({
    id: p.id,
    size: p.size,
    edge_count: p.edge_count,
    members: parseJson<string[]>(p.members_json, []).map((m) => ({ id: m, handle: handles.get(m) ?? null })),
    computed_at: p.computed_at,
  });

  app.get("/api/patterns", (c) => {
    const handles = handleMap();
    const rows = sql.prepare(`SELECT * FROM patterns ORDER BY size DESC, edge_count DESC, id`).all() as PatternDb[];
    return c.json({ data: rows.map((p) => patternSummary(p, handles)) } satisfies PatternsResponse);
  });

  app.get("/api/patterns/:id", (c) => {
    const p = sql.prepare(`SELECT * FROM patterns WHERE id = ?`).get(c.req.param("id")) as PatternDb | undefined;
    if (!p) throw new ApiError(404, "not_found", "pattern not found");
    const members = new Set(parseJson<string[]>(p.members_json, []));
    const edges = (sql.prepare(`SELECT * FROM pattern_edges ORDER BY a, b, type`).all() as {
      a: string;
      b: string;
      type: "co_bid" | "shared_funder";
      co_jobs: number | null;
      twin_jobs: number | null;
      evidence_json: string;
    }[])
      .filter((e) => members.has(e.a) && members.has(e.b))
      .map((e): PatternEdge => ({ a: e.a, b: e.b, type: e.type, co_jobs: e.co_jobs, twin_jobs: e.twin_jobs, evidence: parseJson(e.evidence_json, []) }));
    const body: PatternDetail = {
      ...patternSummary(p, handleMap()),
      label: "Linked bidding pattern (heuristic)",
      edges,
      thresholds: { ...PATTERN_THRESHOLDS },
      disclaimer: PATTERN_DISCLAIMER,
    };
    return c.json(body);
  });

  // ---- /criteria/compile (P4, 05 §6) ----
  app.post("/api/criteria/compile", compileLimit, compileBody, async (c) => {
    let raw: unknown;
    try {
      raw = await c.req.json();
    } catch {
      throw new ApiError(400, "invalid_json", "body must be JSON: { market_job_id? , text? }");
    }
    const r = CompileRequestSchema.safeParse(raw);
    if (!r.success) throw new ApiError(400, "invalid_request", r.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "));
    let job: { title: string; description: string; tags?: string[]; budget?: string | null; market_job_id?: string | null };
    if (r.data.market_job_id) {
      const j = sql.prepare(`SELECT * FROM market_jobs WHERE id = ?`).get(r.data.market_job_id) as JobDb | undefined;
      if (!j && !r.data.text) throw new ApiError(404, "not_found", "market job not known to Juri; send its text instead");
      job = j
        ? { title: j.title ?? "", description: j.description ?? "", tags: parseJson<string[]>(j.tags_json, []), budget: j.budget_amount ? `${j.budget_amount} ${j.budget_token ?? ""}`.trim() : null, market_job_id: j.id }
        : { title: r.data.text!.split("\n")[0]!.slice(0, 200), description: r.data.text!, market_job_id: r.data.market_job_id };
    } else {
      job = { title: r.data.text!.split("\n")[0]!.slice(0, 200), description: r.data.text! };
    }
    const provider = cfg.compiler?.() ?? null;
    if (!provider) throw new ApiError(503, "no_llm", "Spec Compiler needs an LLM key (NEARAI_API_KEY or FALLBACK_LLM_*); none is configured");
    let out: Awaited<ReturnType<typeof compileCriteria>>;
    try {
      out = await compileCriteria(job, provider);
    } catch (e) {
      if (e instanceof CompileError) throw new ApiError(422, "compile_failed", e.message, { attempts: e.attempts, issues: e.issues });
      if (e instanceof ProviderError) throw new ApiError(502, "provider_error", e.message.slice(0, 300));
      throw e;
    }
    const hash = criteriaHash(out.doc);
    if (job.market_job_id) {
      const b = putBlob(db, cfg.blobDir, "criteria", out.doc, now());
      sql
        .prepare(`INSERT OR IGNORE INTO criteria_docs (id, blob_sha256, market_job_id, created_at) VALUES (?, ?, ?, ?)`)
        .run(randomUUID(), b.sha256, job.market_job_id, now().toISOString());
    }
    c.header("X-Criteria-SHA256", hash);
    c.header("X-Model", provider.model);
    c.header("X-Provider", provider.id);
    return c.json(out.doc);
  });

  // ---- /blobs ----
  app.post("/api/blobs", blobLimit, blobBody, async (c) => {
    let raw: unknown;
    try {
      raw = await c.req.json();
    } catch {
      throw new ApiError(400, "invalid_json", "body must be JSON: { kind, content }");
    }
    const r = BlobPutRequestSchema.safeParse(raw);
    if (!r.success) throw new ApiError(422, "invalid_blob", r.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "));
    // Criteria must be a valid CriteriaDoc v1 (≤13 criteria incl. C0, ≤500 chars each): the jury would reject it anyway.
    if (r.data.kind === "criteria") {
      const d = CriteriaDocSchema.safeParse(r.data.content);
      if (!d.success) throw new ApiError(422, "invalid_criteria", d.error.issues.slice(0, 5).map((i) => `${i.path.join(".")}: ${i.message}`).join("; "));
    }
    const b = putBlob(db, cfg.blobDir, r.data.kind, r.data.content, now());
    return c.json({ ...b, uri: `${cfg.publicUrl.replace(/\/$/, "")}/api/blobs/${b.sha256}` }, 201);
  });

  app.get("/api/blobs/:sha256", (c) => {
    const sha = c.req.param("sha256");
    const { bytes, contentType } = getBlob(db, cfg.blobDir, sha);
    return c.body(new Uint8Array(bytes), 200, {
      "content-type": contentType,
      "x-content-sha256": sha,
      "cache-control": "public, max-age=31536000, immutable",
    });
  });

  // ---- /protected, /verifiers, /treasury (P4/P5 integration, 05 §8) ----
  const contract = (): ContractReader => {
    if (!cfg.contract) throw new ApiError(503, "no_contract", "JURI_CONTRACT_ID is not configured");
    return cfg.contract;
  };
  const explorer = (cfg.explorerUrl ?? `https://${cfg.network === "mainnet" ? "" : "testnet."}nearblocks.io`).replace(/\/$/, "");
  const LABELS = ["FAIL", "PASS", "UNSURE"] as const;
  const tryBlob = (sha: string | null | undefined): Buffer | null => {
    if (!sha) return null;
    try {
      return getBlob(db, cfg.blobDir, sha).bytes;
    } catch {
      return null;
    }
  };
  const evidenceBlob = (sha: string | null | undefined): Evidence | null => {
    const b = tryBlob(sha);
    if (!b) return null;
    const r = EvidenceSchema.safeParse(parseJson(b.toString("utf8"), null));
    return r.success ? r.data : null;
  };
  type RunnerRow = { verifier: string; phase: JurorView["phase"]; evidence_sha: string | null; attestation_sha: string | null; commit_tx: string | null; reveal_tx: string | null; error: string | null };
  const runnerRows = (job: ContractJob) =>
    new Map(
      (sql.prepare(`SELECT verifier, phase, evidence_sha, attestation_sha, commit_tx, reveal_tx, error FROM runner_state WHERE job_id = ?`).all(`${job.id}#${job.restarts}`) as RunnerRow[]).map(
        (r) => [r.verifier, r],
      ),
    );
  const jobIdParam = (c: Context) => {
    const s = c.req.param("jobId") ?? "";
    if (!/^\d{1,12}$/.test(s)) throw new ApiError(400, "invalid_job_id", "job id must be a positive integer");
    return Number(s);
  };
  const loadJob = async (c: Context) => {
    const job = await contract().job(jobIdParam(c));
    if (!job) throw new ApiError(404, "not_found", "protected job not found on the contract");
    return job;
  };

  app.get("/api/protected", async (c) => {
    const { account, role, cursor, limit } = q(
      c,
      PageQuery.extend({ account: z.string().max(64).optional(), role: z.enum(["requester", "worker"]).optional(), limit: z.coerce.number().int().min(1).max(50).default(20) }),
    );
    const k = contract();
    if (account) {
      const roles = role ? [role] : (["requester", "worker"] as const);
      const all = new Map<number, ContractJob>();
      for (const r of roles) for (const j of await k.jobsByAccount(account, r)) all.set(j.id, j);
      const sorted = [...all.values()].sort((a, b) => b.id - a.id);
      return c.json(paginate(sorted, cursor, limit) satisfies ProtectedListResponse);
    }
    // Newest first: cursor is an offset from the newest job id.
    const n = await k.jobCount();
    const off = cursor ? Number(cursor) : 0;
    const hi = n - off;
    if (hi < 1) return c.json({ data: [], next: null } satisfies ProtectedListResponse);
    const lo = Math.max(1, hi - limit + 1);
    const data = (await k.jobs(lo, hi - lo + 1)).sort((a, b) => b.id - a.id);
    return c.json({ data, next: lo > 1 ? String(off + limit) : null } satisfies ProtectedListResponse);
  });

  app.get("/api/protected/:jobId", async (c) => {
    const job = await loadJob(c);
    // Criteria: only shown when the stored blob hashes to the on-chain criteria_hash (getBlob re-checks the bytes).
    let criteria: CriteriaDoc | null = null;
    const cb = tryBlob(job.criteria_hash);
    if (cb) {
      const r = CriteriaDocSchema.safeParse(parseJson(cb.toString("utf8"), null));
      if (r.success) criteria = r.data;
    }
    let deliverable_meta: DeliverableMeta | null = null;
    if (job.deliverable_hash) {
      const row = sql.prepare(`SELECT size, content_type FROM blobs WHERE sha256 = ?`).get(job.deliverable_hash) as { size: number; content_type: string } | undefined;
      deliverable_meta = {
        hash: job.deliverable_hash,
        uri: job.deliverable_uri,
        available: !!row && !!tryBlob(job.deliverable_hash),
        size: row?.size ?? null,
        content_type: row?.content_type ?? null,
      };
    }
    const rs = runnerRows(job);
    const jury: JurorView[] = job.jury.map((v) => {
      const reveal = job.reveals.find((r) => r.verifier === v);
      const committed = job.commits.some((x) => x.verifier === v);
      const st = rs.get(v);
      const evidence_sha = reveal?.evidence_hash ?? st?.evidence_sha ?? null;
      const ev = evidenceBlob(evidence_sha);
      // Once revealed, the evidence must be the one whose hash is on chain (evidenceBlob is content-addressed).
      const attested = !!ev?.attestation?.signature_valid && (!reveal || !!reveal.attestation_hash);
      return {
        verifier: v,
        model: reveal?.model ?? ev?.model ?? null,
        provider: ev?.provider ?? null,
        phase: reveal ? "revealed" : committed ? "committed" : st && st.phase !== "revealed" && st.phase !== "committed" ? st.phase : "pending",
        committed,
        revealed: !!reveal,
        verdicts: reveal ? reveal.verdicts.map((x) => LABELS[x] ?? "UNSURE") : null,
        injection_flag: reveal ? reveal.injection_flag : null,
        attested,
        attestation_hash: reveal?.attestation_hash ?? st?.attestation_sha ?? null,
        evidence_sha,
        evidence_available: !!ev,
        error: st?.error ?? null,
        commit_tx: st?.commit_tx ?? null,
        reveal_tx: st?.reveal_tx ?? null,
      };
    });
    const body: ProtectedDetail = {
      job,
      criteria,
      criteria_verified: !!criteria,
      deliverable_meta,
      jury,
      explorer: { contract: `${explorer}/address/${contract().contractId}` },
    };
    return c.json(body);
  });

  app.get("/api/protected/:jobId/evidence/:verifier", async (c) => {
    const job = await loadJob(c);
    const v = c.req.param("verifier");
    if (!job.jury.includes(v)) throw new ApiError(404, "not_found", `${v} is not on this job's jury`);
    const sha = job.reveals.find((r) => r.verifier === v)?.evidence_hash ?? runnerRows(job).get(v)?.evidence_sha ?? null;
    const ev = evidenceBlob(sha);
    if (!ev) throw new ApiError(404, "not_found", "evidence not available (not judged yet, or judged by another runner)");
    c.header("X-Content-SHA256", sha!);
    return c.json(ev);
  });

  const LOW_BALANCE = 50_000_000_000_000_000_000_000n; // 0.05 NEAR ≈ 100+ commit/reveal calls at 30 Tgas
  app.get("/api/verifiers", async (c) => {
    const k = contract();
    const vs = await k.verifiers();
    const attestedSet = new Set(
      (sql.prepare(`SELECT DISTINCT verifier FROM runner_state WHERE attestation_sha IS NOT NULL`).all() as { verifier: string }[]).map((r) => r.verifier),
    );
    const balances = await Promise.all(vs.map((v) => k.balance(v.account_id)));
    const latest = sql.prepare(
      `SELECT evidence_sha, updated_at FROM runner_state WHERE verifier = ? AND evidence_sha IS NOT NULL ORDER BY updated_at DESC LIMIT 1`,
    );
    const data = vs.map((v, i) => {
      const [prov, ...rest] = v.model_label.split(":");
      const hasProv = rest.length > 0;
      const bal = balances[i] ?? null;
      const last = latest.get(v.account_id) as { evidence_sha: string; updated_at: string } | undefined;
      const ev = evidenceBlob(last?.evidence_sha);
      return {
        account_id: v.account_id,
        model: ev?.model ?? (hasProv ? rest.join(":") : v.model_label),
        provider: ev?.provider ?? (hasProv ? prov! : null),
        registered_label: v.model_label,
        last_judged_at: ev?.created_at ?? null,
        attested: attestedSet.has(v.account_id),
        active: v.active,
        stake: v.stake,
        stats: { votes: v.votes, majority_agreements: v.majority_agreements, missed_reveals: v.missed_reveals, earned: v.earned },
        balance: bal,
        allowance_status: bal === null ? ("unknown" as const) : BigInt(bal) < LOW_BALANCE ? ("low" as const) : ("ok" as const),
      };
    });
    return c.json({ data } satisfies VerifiersResponse);
  });

  app.get("/api/treasury", async (c) => {
    const k = contract();
    const [treasury, totals, params] = await Promise.all([k.treasury(), k.totals(), k.params().catch(() => null)]);
    return c.json({ treasury, ...totals, params } satisfies TreasuryResponse);
  });

  return app;
}
