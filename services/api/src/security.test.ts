import { ErrorBodySchema } from "@juri/shared";
import { openDb } from "@juri/workers/src/db/index.js";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createApp, type AppConfig } from "./app.js";
import { CRITERIA_DOC } from "./test-fixtures.js";

/** T7.3 — rate limits, body/size validation (NFR-SEC-3). SSRF: packages/jury jury.test.ts; bundle scan: scripts/scan-bundle.mjs. */
const mk = (over: Partial<AppConfig> = {}) =>
  createApp({
    db: openDb(":memory:"),
    mode: "snapshot",
    blobDir: mkdtempSync(join(tmpdir(), "juri-sec-")),
    publicUrl: "http://t",
    network: "testnet",
    contractId: null,
    rateLimits: { get: 1000, blobs: 1000, compile: 1000 },
    ...over,
  });
const code = async (r: Response) => ErrorBodySchema.parse(await r.json()).error.code;
const postBlob = (app: ReturnType<typeof mk>, body: unknown, headers: Record<string, string> = {}) =>
  app.request("/api/blobs", { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) });

/** A request body streamed without Content-Length (chunked upload). */
const streamed = (bytes: number) =>
  new ReadableStream<Uint8Array>({
    start(ctl) {
      const chunk = new TextEncoder().encode("x".repeat(64 * 1024));
      for (let sent = 0; sent < bytes; sent += chunk.length) ctl.enqueue(chunk);
      ctl.close();
    },
  });

describe("rate limit", () => {
  it("GET is limited per client and answers 429 with Retry-After", async () => {
    const app = mk({ rateLimits: { get: 3, blobs: 1000 } });
    const codes = [];
    for (let i = 0; i < 4; i++) codes.push((await app.request("/api/health")).status);
    expect(codes).toEqual([200, 200, 200, 429]);
    const r = await app.request("/api/health");
    expect(r.headers.get("retry-after")).toMatch(/^\d+$/);
    expect(await code(r)).toBe("rate_limited");
  });

  it("a forged X-Forwarded-For does not get a fresh bucket by default", async () => {
    const app = mk({ rateLimits: { get: 2, blobs: 1000 } });
    const codes = [];
    for (let i = 0; i < 3; i++) codes.push((await app.request("/api/health", { headers: { "x-forwarded-for": `203.0.113.${i}` } })).status);
    expect(codes).toEqual([200, 200, 429]);
  });

  it("behind one trusted proxy the proxy-appended address counts, not the client-supplied prefix", async () => {
    const app = mk({ rateLimits: { get: 2, blobs: 1000 }, trustProxy: 1 });
    const hit = async (xff: string) => (await app.request("/api/health", { headers: { "x-forwarded-for": xff } })).status;
    // same real client (198.51.100.7), forged left-most entries vary → still one bucket
    expect([await hit("1.1.1.1, 198.51.100.7"), await hit("2.2.2.2, 198.51.100.7"), await hit("3.3.3.3, 198.51.100.7")]).toEqual([200, 200, 429]);
    // another real client has its own bucket
    expect(await hit("198.51.100.8")).toBe(200);
  });

  it("POST /blobs and /criteria/compile have their own, lower limits", async () => {
    const app = mk({ rateLimits: { get: 1000, blobs: 2, compile: 1 } });
    const blobs = [];
    for (let i = 0; i < 3; i++) blobs.push((await postBlob(app, { kind: "deliverable", content: `d${i}` })).status);
    expect(blobs).toEqual([201, 201, 429]);
    const compile = () => app.request("/api/criteria/compile", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text: "Write a 300 word Markdown report on agent marketplace fees with sources." }) });
    // first call passes the limiter (503: no LLM configured in tests), the second is limited
    expect([(await compile()).status, (await compile()).status]).toEqual([503, 429]);
  });
});

describe("GET /skill.md (FR-H2)", () => {
  it("serves the agent guide with this deployment's API, network and contract", async () => {
    const app = mk({ publicUrl: "https://api.example", contractId: "juri.x.testnet" });
    const r = await app.request("/skill.md");
    expect(r.status).toBe(200);
    expect(r.headers.get("content-type")).toMatch(/text\/markdown/);
    const md = await r.text();
    for (const s of ["https://api.example/api/jobs/{market_job_id}", "POST https://api.example/api/criteria/compile", "juri.x.testnet", "create_job", "submit_deliverable", "withdraw", "one operator"])
      expect(md).toContain(s);
  });
});

describe("size and input validation (NFR-SEC-3)", () => {
  it("rejects a streamed body over 1 MB even without Content-Length", async () => {
    const app = mk();
    const r = await app.request("/api/blobs", { method: "POST", headers: { "content-type": "application/json" }, body: streamed(1_200_000), duplex: "half" } as RequestInit);
    expect(r.status).toBe(413);
    expect(await code(r)).toBe("too_large");
  });

  it("rejects a declared Content-Length over 1 MB", async () => {
    const r = await postBlob(mk(), { kind: "deliverable", content: "y".repeat(1_100_000) });
    expect(r.status).toBe(413);
  });

  it("caps compile requests at 64 KB", async () => {
    const r = await mk().request("/api/criteria/compile", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text: "z".repeat(70_000) }) });
    expect(r.status).toBe(413);
  });

  it("deliverable ≤ 50,000 characters", async () => {
    const app = mk();
    expect((await postBlob(app, { kind: "deliverable", content: "é".repeat(50_000) })).status).toBe(201);
    expect((await postBlob(app, { kind: "deliverable", content: "x".repeat(50_001) })).status).toBe(413);
  });

  it("criteria must be a valid CriteriaDoc: ≤13 criteria, ≤500 chars each, C0..C12", async () => {
    const app = mk();
    expect((await postBlob(app, { kind: "criteria", content: CRITERIA_DOC })).status).toBe(201);
    const extra = Array.from({ length: 12 }, (_, i) => ({ id: `C${i + 2}`, text: "t", kind: "SHOULD", method: "llm", rule: null, rationale: "" }));
    const fourteen = { ...CRITERIA_DOC, criteria: [...CRITERIA_DOC.criteria, ...extra, { ...extra[0], id: "C13" }] };
    const longText = { ...CRITERIA_DOC, criteria: [CRITERIA_DOC.criteria[0], { ...CRITERIA_DOC.criteria[1], text: "w".repeat(501) }] };
    const notADoc = { version: "1", criteria: [{ id: "C0", kind: "MUST" }] };
    for (const content of [fourteen, longText, notADoc]) {
      const r = await postBlob(app, { kind: "criteria", content });
      expect(r.status).toBe(422);
      expect(await code(r)).toBe("invalid_criteria");
    }
  });

  it("malformed JSON and unknown kinds are refused", async () => {
    const app = mk();
    expect((await app.request("/api/blobs", { method: "POST", headers: { "content-type": "application/json" }, body: "{nope" })).status).toBe(400);
    expect((await postBlob(app, { kind: "attestation-but-not", content: "x" })).status).toBe(422);
  });
});
