import {
  C0,
  canonicalHash,
  criteriaKinds,
  ProtectedDetailSchema,
  ProtectedListResponseSchema,
  sha256Hex,
  TreasuryResponseSchema,
  VerifiersResponseSchema,
  type ContractJob,
  type CriteriaDoc,
  type Evidence,
} from "@juri/shared";
import { openDb } from "@juri/workers/src/db/index.js";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createApp } from "./app.js";
import { putBlob } from "./blobs.js";
import type { ContractReader } from "./contract.js";

const doc: CriteriaDoc = {
  version: "1",
  source: { type: "demo", market_job_id: null, title: "api test" },
  summary: "",
  deliverable_format: "markdown",
  criteria: [C0, { id: "C1", text: "≥ 5 words", kind: "MUST", method: "deterministic", rule: { type: "min_words", params: { n: 5 } }, rationale: "" }],
  unverifiable: [],
  ambiguities: [],
};
const deliverable = "# Note\n\none two three four five six";
const evidence = (verifier: string, attested: boolean): Evidence => ({
  job_id: 2,
  verifier,
  provider: "nearai",
  model: "deepseek-ai/DeepSeek-V4.1-Flash-1017",
  criteria_hash: canonicalHash(doc),
  deliverable_hash: sha256Hex(deliverable),
  facts: {},
  prescan: { flagged: false, hits: [] },
  verdicts: [
    { id: "C0", verdict: "PASS", confidence: 0.9, evidence: "", reason: "", source: "llm" },
    { id: "C1", verdict: "PASS", confidence: 1, evidence: "6", reason: "deterministic rule min_words", source: "rule" },
  ],
  injection_suspected: false,
  injection_evidence: "",
  injection_flag: false,
  attestation: attested
    ? { nonce: "a".repeat(64), report_sha256: "b".repeat(64), chat_id: "chat-1", signing_address: "0xabc", signing_algo: "ecdsa", signature: "0xsig", signature_valid: true, report_blob: null }
    : null,
  error: null,
  latency_ms: 1200,
  usage: null,
  algo: "jury-0.1",
  created_at: "2026-11-13T00:00:00.000Z",
});

function setup() {
  const db = openDb(":memory:");
  const blobDir = mkdtempSync(join(tmpdir(), "juri-p-"));
  const crit = putBlob(db, blobDir, "criteria", doc);
  const del = putBlob(db, blobDir, "deliverable", deliverable);
  const e1 = putBlob(db, blobDir, "evidence", evidence("v1.t", true));
  const e2 = putBlob(db, blobDir, "evidence", evidence("v2.t", false));
  const base = (id: number): ContractJob => ({
    id, requester: "r.t", worker: "w.t", amount: "110000000000000000000000", criteria_hash: crit.sha256, criteria_uri: "x", criteria_kinds: criteriaKinds(doc),
    market_job_id: null, payout_mode: "Binary", created_at: "0", submit_deadline: "0", deliverable_hash: null, deliverable_uri: null, submitted_at: null,
    jury: [], commit_deadline: "0", reveal_deadline: "0", restarts: 0, commits: [], reveals: [], status: "Funded", outcome: null, criteria_result: [],
    injection_flagged: false, settlement: null,
  });
  const jobs: ContractJob[] = [
    { ...base(1), requester: "other.t" },
    {
      ...base(2),
      deliverable_hash: del.sha256,
      deliverable_uri: `http://t/api/blobs/${del.sha256}`,
      status: "Committing",
      jury: ["v1.t", "v2.t", "v3.t"],
      commits: [{ verifier: "v1.t", commitment: "c" }, { verifier: "v2.t", commitment: "c" }],
      reveals: [{ verifier: "v1.t", verdicts: [1, 1], injection_flag: false, evidence_hash: e1.sha256, attestation_hash: "d".repeat(64), model: "deepseek-ai/DeepSeek-V4.1-Flash-1017" }],
    },
    base(3),
  ];
  db.$client
    .prepare(`INSERT INTO runner_state (job_id, verifier, phase, evidence_sha, attestation_sha, error, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`)
    .run("2#0", "v2.t", "committed", e2.sha256, null, null, "t");
  db.$client
    .prepare(`INSERT INTO runner_state (job_id, verifier, phase, evidence_sha, attestation_sha, error, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`)
    .run("2#0", "v1.t", "revealed", e1.sha256, "d".repeat(64), null, "t");
  db.$client
    .prepare(`INSERT INTO runner_state (job_id, verifier, phase, evidence_sha, attestation_sha, error, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`)
    .run("2#0", "v3.t", "failed", null, null, "missed: commit deadline", "t");
  const reader: ContractReader = {
    contractId: "juri.t",
    jobCount: async () => jobs.length,
    jobs: async (from, limit) => jobs.filter((j) => j.id >= from).slice(0, limit),
    jobsByAccount: async (a, role) => jobs.filter((j) => (role === "requester" ? j.requester : j.worker) === a),
    job: async (id) => jobs.find((j) => j.id === id) ?? null,
    verifiers: async () =>
      ["v1.t", "v2.t"].map((account_id, i) => ({
        account_id, payout_account: account_id, model_label: i ? "nearai:Qwen/Qwen3.8-27B" : "rules", stake: "0", active: true, votes: 3, majority_agreements: 3, missed_reveals: 0, earned: "1",
      })),
    params: async () => ({ fee_bps: 300, jury_share_bps: 8000, jury_size: 3, commit_secs: 180, reveal_secs: 180, min_stake: "0", verifier_seed_balance: "0", min_amount: "1", max_criteria: 13, max_restarts: 1 }),
    totals: async () => ({ total_fee: "30", total_jury_pool: "24", settled_jobs: 5 }),
    treasury: async () => "6",
    balance: async (a) => (a === "v1.t" ? "1000000000000000000000000" : "1000"),
  };
  const app = createApp({ db, mode: "snapshot", blobDir, publicUrl: "http://t", network: "testnet", contractId: "juri.t", contract: reader, rateLimits: { get: 1000, blobs: 1000 } });
  return { app, e1 };
}

describe("protected / verifiers / treasury", () => {
  it("lists newest first with offset paging, and by account", async () => {
    const { app } = setup();
    const p1 = ProtectedListResponseSchema.parse(await (await app.request("/api/protected?limit=2")).json());
    expect([p1.data.map((j) => j.id), p1.next]).toEqual([[3, 2], "2"]);
    const p2 = ProtectedListResponseSchema.parse(await (await app.request("/api/protected?limit=2&cursor=2")).json());
    expect([p2.data.map((j) => j.id), p2.next]).toEqual([[1], null]);
    const mine = ProtectedListResponseSchema.parse(await (await app.request("/api/protected?account=r.t&role=requester")).json());
    expect(mine.data.map((j) => j.id)).toEqual([3, 2]);
  });

  it("detail joins verified criteria, deliverable meta and per-juror state", async () => {
    const { app, e1 } = setup();
    const res = await app.request("/api/protected/2");
    expect(res.status).toBe(200);
    const d = ProtectedDetailSchema.parse(await res.json());
    expect(d.criteria_verified).toBe(true);
    expect(d.criteria?.criteria.length).toBe(2);
    expect(d.deliverable_meta).toMatchObject({ available: true, content_type: "text/plain; charset=utf-8" });
    const [v1, v2, v3] = d.jury;
    expect(v1).toMatchObject({ phase: "revealed", attested: true, verdicts: ["PASS", "PASS"], evidence_sha: e1.sha256, evidence_available: true });
    expect(v2).toMatchObject({ phase: "committed", attested: false, revealed: false, verdicts: null, evidence_available: true });
    expect(v3).toMatchObject({ phase: "failed", error: "missed: commit deadline", evidence_available: false });
  });

  it("evidence by verifier; 404 for non-jurors and missing evidence; 400 bad id; 404 unknown job", async () => {
    const { app, e1 } = setup();
    const ok = await app.request("/api/protected/2/evidence/v1.t");
    expect(ok.status).toBe(200);
    expect(ok.headers.get("x-content-sha256")).toBe(e1.sha256);
    expect(((await ok.json()) as Evidence).attestation?.signature_valid).toBe(true);
    expect((await app.request("/api/protected/2/evidence/x.t")).status).toBe(404);
    expect((await app.request("/api/protected/2/evidence/v3.t")).status).toBe(404);
    expect((await app.request("/api/protected/abc")).status).toBe(400);
    expect((await app.request("/api/protected/99")).status).toBe(404);
  });

  it("verifiers with provider split, attested flag and low balance; treasury", async () => {
    const { app } = setup();
    const v = VerifiersResponseSchema.parse(await (await app.request("/api/verifiers")).json());
    // model comes from the latest evidence (the registered label may be stale)
    expect(v.data.map((x) => [x.account_id, x.provider, x.model, x.registered_label, x.attested, x.allowance_status])).toEqual([
      ["v1.t", "nearai", "deepseek-ai/DeepSeek-V4.1-Flash-1017", "rules", true, "ok"],
      ["v2.t", "nearai", "deepseek-ai/DeepSeek-V4.1-Flash-1017", "nearai:Qwen/Qwen3.8-27B", false, "low"],
    ]);
    const t = TreasuryResponseSchema.parse(await (await app.request("/api/treasury")).json());
    expect([t.treasury, t.settled_jobs, t.params?.fee_bps]).toEqual(["6", 5, 300]);
  });

  it("503 without a contract", async () => {
    const app = createApp({ db: openDb(":memory:"), mode: "snapshot", blobDir: mkdtempSync(join(tmpdir(), "juri-p-")), publicUrl: "http://t", network: "testnet", contractId: null });
    expect((await app.request("/api/protected")).status).toBe(503);
  });
});
