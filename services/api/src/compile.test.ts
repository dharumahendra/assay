import { CompileResponseSchema, canonicalHash } from "@juri/shared";
import type { JudgeProvider } from "@juri/jury";
import { openDb } from "@juri/workers/src/db/index.js";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createApp } from "./app.js";

const reply = JSON.stringify({
  summary: "Fee report",
  deliverable_format: "markdown",
  criteria: [
    { text: "At least 800 words", kind: "MUST", method: "deterministic", rule: { type: "min_words", params: { n: 800 } }, rationale: "in-depth report" },
    { text: "Compares at least three marketplaces", kind: "MUST", method: "llm", rule: null, rationale: "compare marketplaces" },
    { text: "Cites sources with links", kind: "SHOULD", method: "deterministic", rule: { type: "contains_links", params: { min: 3 } }, rationale: "cite sources" },
  ],
  unverifiable: [],
  ambiguities: ["Which marketplaces count?"],
});
const provider = (text: string): JudgeProvider => ({ id: "openai_compat", model: "test-model", attested: false, complete: async () => ({ text }) });

const mk = (compiler: (() => JudgeProvider | null) | undefined) =>
  createApp({ db: openDb(":memory:"), mode: "snapshot", blobDir: mkdtempSync(join(tmpdir(), "juri-c-")), publicUrl: "http://t", network: "testnet", contractId: null, compiler, rateLimits: { get: 1000, blobs: 1000, compile: 1000 } });
const post = (app: ReturnType<typeof mk>, body: unknown) =>
  app.request("/api/criteria/compile", { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" } });

describe("POST /api/criteria/compile", () => {
  const text = "Write an in-depth report comparing fees across agent marketplaces, with sources.";

  it("200: CriteriaDoc with C0 and hash header", async () => {
    const res = await post(mk(() => provider(reply)), { text });
    expect(res.status).toBe(200);
    const doc = CompileResponseSchema.parse(await res.json());
    expect(doc.criteria.map((c) => c.id)).toEqual(["C0", "C1", "C2", "C3"]);
    expect(res.headers.get("x-criteria-sha256")).toBe(canonicalHash(doc));
    expect(res.headers.get("x-model")).toBe("test-model");
  });

  it("503 no_llm without a key, 422 on invalid output, 400 on bad body, 404 unknown market job", async () => {
    expect((await post(mk(() => null), { text })).status).toBe(503);
    const bad = await post(mk(() => provider("{}")), { text });
    expect(bad.status).toBe(422);
    expect(((await bad.json()) as { error: { code: string } }).error.code).toBe("compile_failed");
    expect((await post(mk(() => provider(reply)), {})).status).toBe(400);
    expect((await post(mk(() => provider(reply)), { market_job_id: "nope" })).status).toBe(404);
  });

  it("is rate limited (5/min default)", async () => {
    const app = createApp({ db: openDb(":memory:"), mode: "snapshot", blobDir: mkdtempSync(join(tmpdir(), "juri-c-")), publicUrl: "http://t", network: "testnet", contractId: null, compiler: () => null });
    const codes = [];
    for (let i = 0; i < 6; i++) codes.push((await post(app, { text })).status);
    expect(codes).toEqual([503, 503, 503, 503, 503, 429]);
  });
});
