import {
  AgentDetailSchema,
  AgentsResponseSchema,
  BlobPutResponseSchema,
  ErrorBodySchema,
  HealthSchema,
  InsightRecordsResponseSchema,
  InsightsResponseSchema,
  JobDetailSchema,
  JobsResponseSchema,
  MetaSchema,
  PatternDetailSchema,
  PatternsResponseSchema,
  canonicalJson,
  sha256Hex,
} from "@juri/shared";
import { openDb, type Db } from "@juri/workers/src/db/index.js";
import { runTrustEngine } from "@juri/workers/src/trust/engine.js";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "./app.js";
import { flattenSources } from "./records.js";
import { CRITERIA_DOC } from "./test-fixtures.js";

const NOW = "2026-11-13T12:00:00.000Z";
const TX1 = "HJWizscR9Nbiy5WTNQVMpdUhoKw5sLUq48kW1dMe7zwS";
const TX2 = "21XJHuZZJHZsSuQ2DtMSj3NukQS48CraH54zhGa6jhFd";
const UA = "30ba50df-5509-452f-b936-8211e516979f";

let db: Db;
let blobDir: string;
let app: ReturnType<typeof createApp>;

function seed(db: Db) {
  const s = db.$client;
  const agent = s.prepare(
    `INSERT INTO market_agents (id, handle, name, delivered_jobs, success_rate, raw_json, fetched_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
  );
  agent.run(UA, "web-research", "Web Research", 52, 72, JSON.stringify({ near_account_id: "webr.near" }), NOW);
  agent.run("A", "alpha", null, 0, null, "{}", NOW);
  agent.run("B", "beta", null, 0, null, "{}", NOW);
  agent.run("N", "newbie", null, 0, null, "{}", NOW);
  s.prepare(
    `INSERT INTO market_reputation (agent_id, overall, axes_json, jobs_counted, computed_at, raw_json, fetched_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(UA, 82.5, JSON.stringify({ delivery: 80, dispute_free: 100 }), 45, NOW, "{}", NOW);
  s.prepare(
    `INSERT INTO market_jobs (id, title, description, status, budget_amount, budget_token, tags_json, created_at, raw_json, fetched_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run("job-1", "Market report", "Write a report", "open", "5", "USDC", JSON.stringify(["research"]), NOW, "{}", NOW);
  const bid = s.prepare(
    `INSERT INTO market_bids (id, job_id, agent_id, amount, eta_seconds, created_at, raw_json) VALUES (?, ?, ?, ?, ?, ?, '{}')`,
  );
  for (const [i, job] of ["job-1", "j2", "j3"].entries()) {
    bid.run(`a${i}`, job, "A", "10", 3600, `2026-11-0${i + 1}T10:00:00Z`);
    bid.run(`b${i}`, job, "B", "10", 3600, `2026-11-0${i + 1}T10:02:00Z`);
  }
  bid.run("w0", "job-1", UA, "7", 7200, "2026-11-01T11:00:00Z");
  s.prepare(
    `INSERT INTO escrow_txns (tx_hash, nb_id, block_height, ts, signer, receiver, method, succeeded, raw_json) VALUES (?, '1', 224357348, ?, 'escrow.ai.near', 'intents.near', 'execute_intents', 1, '{}')`,
  ).run(TX1, NOW);
  s.prepare(
    `INSERT INTO escrow_transfers (id, tx_hash, ts, intent_type, from_account, to_account, token, amount, succeeded, kind, kind_method) VALUES (?, ?, ?, 'transfer', 'escrow.ai.near', 'webr.near', 'nep141:usdc', '975000', 1, 'reward', 'heuristic')`,
  ).run(`${TX1}:0:0`, TX1, NOW);
  const metric = s.prepare(
    `INSERT INTO metrics (id, window, value, numerator, denominator, unit, note, computed_at, sources_json) VALUES (?, ?, ?, ?, ?, 'ratio', ?, ?, ?)`,
  );
  metric.run("M1", "all", 0.5, 10, 20, "delivered ÷ total", NOW, JSON.stringify({ endpoint: "GET /v1/platform/stats", fetched_at: NOW }));
  metric.run("M2", "all", 0.1, 1, 10, "refund ÷ deposit", NOW, JSON.stringify({ deposit_txs: [TX1], refund_txs: [TX2] }));
  metric.run("M2", "30d", 0.2, 1, 5, "refund ÷ deposit (30d)", NOW, JSON.stringify({ deposit_txs: [TX1], refund_txs: [] }));
  metric.run("M4", "all", 0.25, 1, 4, "unproven", NOW, JSON.stringify({ agent_ids: ["N", UA] }));
  s.prepare(`INSERT INTO sync_state (source, last_run_at, last_ok_at) VALUES ('market', ?, ?)`).run(NOW, NOW);
  s.prepare(`INSERT INTO snapshots (id, file, sha256, taken_at) VALUES (?, ?, ?, ?)`).run(NOW, "snap.json", "ab".repeat(32), NOW);
}

const get = async (path: string) => {
  const res = await app.request(path);
  return { status: res.status, body: (await res.json()) as unknown, res };
};

beforeAll(() => {
  db = openDb(":memory:");
  seed(db);
  runTrustEngine(db, { now: new Date(NOW), funderExclude: new Set() });
  blobDir = mkdtempSync(join(tmpdir(), "juri-blobs-"));
  app = createApp({
    db,
    mode: "snapshot",
    blobDir,
    publicUrl: "http://api.test",
    network: "testnet",
    contractId: "juri.juri-assay-jdir.testnet",
    // 2 POSTs in the first blob test + 2 rejected ones below → the 5th POST is rate-limited
    rateLimits: { get: 1000, blobs: 4 },
    now: () => new Date(NOW),
  });
});

afterAll(() => {
  db.$client.close();
  rmSync(blobDir, { recursive: true, force: true });
});

describe("health + meta", () => {
  it("/api/health", async () => {
    const { status, body } = await get("/api/health");
    expect(status).toBe(200);
    expect(HealthSchema.parse(body)).toMatchObject({ ok: true, status: "ok", mode: "snapshot", last_sync: NOW, last_block: 224357348 });
  });

  it("degrades in live mode when sync is stale", async () => {
    const live = createApp({ db, mode: "live", blobDir, publicUrl: "x", network: "testnet", contractId: null, now: () => new Date("2026-11-14T00:00:00Z") });
    const body = HealthSchema.parse(await (await live.request("/api/health")).json());
    expect(body.status).toBe("degraded");
  });

  it("/api/meta", async () => {
    const m = MetaSchema.parse((await get("/api/meta")).body);
    expect(m).toMatchObject({ mode: "snapshot", algo_version: "ts-0.2", trust_computed_at: NOW, snapshot: { file: "snap.json" } });
    expect(m.data_notes.length).toBeGreaterThan(0);
  });
});

describe("insights", () => {
  it("returns the requested window, falling back to all", async () => {
    const all = InsightsResponseSchema.parse((await get("/api/insights")).body);
    expect(all.data.map((m) => [m.id, m.window, m.value])).toEqual([
      ["M1", "all", 0.5],
      ["M2", "all", 0.1],
      ["M4", "all", 0.25],
    ]);
    const d30 = InsightsResponseSchema.parse((await get("/api/insights?window=30d")).body);
    expect(d30.data.find((m) => m.id === "M2")).toMatchObject({ window: "30d", value: 0.2 });
    expect(d30.data.find((m) => m.id === "M1")?.window).toBe("all");
    expect((await get("/api/insights?window=7d")).status).toBe(400);
  });

  it("drills down into records with links (FR-A5)", async () => {
    const r = InsightRecordsResponseSchema.parse((await get("/api/insights/M2/records")).body);
    expect(r.data).toEqual([
      { group: "deposit_txs", kind: "tx", id: TX1, label: null, url: `https://nearblocks.io/txns/${TX1}`, extra: null },
      { group: "refund_txs", kind: "tx", id: TX2, label: null, url: `https://nearblocks.io/txns/${TX2}`, extra: null },
    ]);
    const p = InsightRecordsResponseSchema.parse((await get("/api/insights/M4/records?limit=1")).body);
    expect(p.data).toHaveLength(1);
    expect(p.next).toBe("1");
    const p2 = InsightRecordsResponseSchema.parse((await get("/api/insights/M4/records?limit=1&cursor=1")).body);
    expect(p2.data[0]).toMatchObject({ kind: "agent", id: UA, label: "web-research" });
    expect(p2.next).toBeNull();
    const m1 = InsightRecordsResponseSchema.parse((await get("/api/insights/M1/records")).body);
    expect(m1.data[0]).toMatchObject({ kind: "endpoint", id: "GET /v1/platform/stats" });
    expect((await get("/api/insights/M9/records")).status).toBe(404);
  });
});

describe("jobs", () => {
  it("lists jobs with bid and flag counts", async () => {
    const r = JobsResponseSchema.parse((await get("/api/jobs?q=report")).body);
    expect(r.data).toEqual([
      expect.objectContaining({ id: "job-1", bid_count: 3, flagged_bids: 2, market_url: "https://market.near.ai/jobs/job-1" }),
    ]);
    expect(JobsResponseSchema.parse((await get("/api/jobs?tag=research")).body).data).toHaveLength(1);
    expect(JobsResponseSchema.parse((await get("/api/jobs?status=closed")).body).data).toHaveLength(0);
  });

  it("shows bids with trust and patterns", async () => {
    const r = JobDetailSchema.parse((await get("/api/jobs/job-1")).body);
    expect(r.job.tags).toEqual(["research"]);
    const byAgent = Object.fromEntries(r.bids.map((b) => [b.agent.id, b]));
    expect(byAgent.A!.patterns).toHaveLength(1);
    expect(byAgent[UA]).toMatchObject({ patterns: [], agent: { handle: "web-research", mapped: true } });
    expect(byAgent[UA]!.trust?.score).toBeTypeOf("number");
    const nf = await get("/api/jobs/unknown");
    expect(nf.status).toBe(404);
    ErrorBodySchema.parse(nf.body);
  });
});

describe("agents", () => {
  it("lists agents sorted by score, unscored last", async () => {
    const r = AgentsResponseSchema.parse((await get("/api/agents")).body);
    expect(r.data[0]!.handle).toBe("web-research");
    expect(r.data.at(-1)).toMatchObject({ handle: "newbie", score: null, band: "Insufficient data" });
    expect(AgentsResponseSchema.parse((await get("/api/agents?q=alp")).body).data.map((a) => a.handle)).toEqual(["alpha"]);
    expect((await get("/api/agents?sort=bogus")).status).toBe(400);
  });

  it("returns a profile with trust breakdown and settlements", async () => {
    const r = AgentDetailSchema.parse((await get(`/api/agents/${UA}`)).body);
    expect(r.identity).toMatchObject({ near_account: "webr.near", mapping_method: "api", account_url: "https://nearblocks.io/address/webr.near" });
    expect(r.trust?.components).not.toBeNull();
    expect(r.trust?.inputs.n_paid_onchain).toBe(1);
    expect(r.onchain_settlements).toEqual([{ tx_hash: TX1, amount: "975000", token: "nep141:usdc", ts: NOW, url: `https://nearblocks.io/txns/${TX1}` }]);
    expect(r.market_history.reputation?.overall).toBe(82.5);
    const byHandle = AgentDetailSchema.parse((await get("/api/agents/newbie")).body);
    expect(byHandle.trust).toMatchObject({ score: null, band: "Insufficient data", components: null });
    expect(byHandle.trust?.flags).toContain("unmapped");
  });
});

describe("patterns", () => {
  it("lists and details clusters with evidence and neutral wording", async () => {
    const list = PatternsResponseSchema.parse((await get("/api/patterns")).body);
    expect(list.data).toHaveLength(1);
    const p = list.data[0]!;
    expect(p.members.map((m) => m.handle)).toEqual(["alpha", "beta"]);
    const d = PatternDetailSchema.parse((await get(`/api/patterns/${p.id}`)).body);
    expect(d.edges[0]).toMatchObject({ type: "co_bid", co_jobs: 3, twin_jobs: 3 });
    expect(Array.isArray(d.edges[0]!.evidence) && d.edges[0]!.evidence.length).toBe(3);
    expect(JSON.stringify(d)).not.toMatch(/scam|fraud|sybil/i); // FR-B8
    expect((await get("/api/patterns/pat_nope")).status).toBe(404);
  });
});

describe("blobs", () => {
  const post = (body: unknown) =>
    app.request("/api/blobs", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

  it("stores JSON canonically and serves it back with a verifiable hash", async () => {
    const content = CRITERIA_DOC;
    const res = await post({ kind: "criteria", content });
    expect(res.status).toBe(201);
    const put = BlobPutResponseSchema.parse(await res.json());
    expect(put.sha256).toBe(sha256Hex(canonicalJson(content)));
    expect(put.uri).toBe(`http://api.test/api/blobs/${put.sha256}`);
    const got = await app.request(`/api/blobs/${put.sha256}`);
    expect(got.headers.get("x-content-sha256")).toBe(put.sha256);
    expect(sha256Hex(await got.text())).toBe(put.sha256);
    // idempotent
    expect(BlobPutResponseSchema.parse(await (await post({ kind: "criteria", content })).json()).sha256).toBe(put.sha256);
  });

  it("validates kind, size and hash format; rate-limits POST", async () => {
    expect((await post({ kind: "secret", content: "x" })).status).toBe(422);
    expect((await post({ kind: "deliverable", content: "x".repeat(50_001) })).status).toBe(413);
    expect((await get(`/api/blobs/${"0".repeat(64)}`)).status).toBe(404);
    expect((await get("/api/blobs/xyz")).status).toBe(400);
    const res = await post({ kind: "deliverable", content: "hello" });
    expect(res.status).toBe(429);
    expect(ErrorBodySchema.parse(await res.json()).error.code).toBe("rate_limited");
  });
});

describe("flattenSources", () => {
  it("handles nested agent objects and unknown shapes", () => {
    const r = flattenSources({ top10: [{ agent_id: UA, handle: "web-research", delivered_jobs: 52 }], weird: 3 });
    expect(r).toEqual([
      { group: "top10", kind: "agent", id: UA, label: "web-research", url: "https://market.near.ai/agents/web-research", extra: { delivered_jobs: 52 } },
      { group: "weird", kind: "value", id: "3", label: null, url: null, extra: null },
    ]);
    expect(flattenSources(null)).toEqual([]);
  });
});

it("unknown routes return the error format", async () => {
  const r = await get("/api/nope");
  expect(r.status).toBe(404);
  ErrorBodySchema.parse(r.body);
});
