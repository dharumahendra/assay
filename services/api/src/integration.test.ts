import {
  AgentDetailSchema,
  AgentsResponseSchema,
  HealthSchema,
  InsightRecordsResponseSchema,
  InsightsResponseSchema,
  MetaSchema,
} from "@juri/shared";
import { openDb, type Db } from "@juri/workers/src/db/index.js";
import { isEmpty, loadSnapshot } from "@juri/workers/src/pipeline.js";
import { latestSnapshotFile } from "@juri/workers/src/snapshot.js";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "./app.js";
import { flattenSources } from "./records.js";

/**
 * P1 → P2 integration: the committed real snapshot is imported into an empty DB, metrics and
 * trust are derived (the same path the API takes on a fresh clone), and the read API serves it.
 */
const file = latestSnapshotFile();
let db: Db;
let blobDir: string;
let app: ReturnType<typeof createApp>;
const json = async (path: string) => {
  const res = await app.request(path);
  return { status: res.status, body: (await res.json()) as unknown };
};

describe.skipIf(!file)("real snapshot → derive → read API", () => {
  beforeAll(() => {
    db = openDb(":memory:");
    expect(isEmpty(db)).toBe(true);
    loadSnapshot(db, file!);
    blobDir = mkdtempSync(join(tmpdir(), "juri-int-"));
    app = createApp({ db, mode: "snapshot", blobDir, publicUrl: "http://api.test", network: "testnet", contractId: null });
  }, 60_000);

  afterAll(() => {
    db?.$client.close();
    if (blobDir) rmSync(blobDir, { recursive: true, force: true });
  });

  it("health + meta point at the imported snapshot", async () => {
    expect(HealthSchema.parse((await json("/api/health")).body).ok).toBe(true);
    const meta = MetaSchema.parse((await json("/api/meta")).body);
    expect(meta.snapshot?.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(meta.trust_computed_at).not.toBeNull();
  });

  it("serves M1–M6 with real values", async () => {
    const { data } = InsightsResponseSchema.parse((await json("/api/insights?window=all")).body);
    expect(data.map((m) => m.id)).toEqual(["M1", "M2", "M3", "M4", "M5", "M6"]);
    for (const m of data.filter((x) => x.id !== "M5")) expect(m.value).toBeGreaterThan(0);
  });

  it("M2 records: deposit/refund txs + per-token totals", async () => {
    const r = InsightRecordsResponseSchema.parse((await json("/api/insights/M2/records?window=all&limit=100")).body);
    const groups = new Set(r.data.map((x) => x.group));
    expect([...groups]).toEqual(expect.arrayContaining(["by_token", "deposit_txs"])); // refund_txs follow on later pages
    expect(r.data.find((x) => x.group === "by_token" && x.label === "wNEAR")).toBeTruthy();
    expect(r.data.find((x) => x.group === "deposit_txs")?.url).toMatch(/^https:\/\/nearblocks\.io\/txns\//);
  });

  it("M6 records: endpoint + clickable last successful tx", async () => {
    const r = InsightRecordsResponseSchema.parse((await json("/api/insights/M6/records?window=all")).body);
    expect(r.data.map((x) => x.kind)).toEqual(["endpoint", "tx"]);
  });

  it("every listed agent has a trust row; no internal leg counts as paid", async () => {
    const agents = AgentsResponseSchema.parse((await json("/api/agents?limit=50")).body);
    expect(agents.data.length).toBeGreaterThan(0);
    const id = agents.data[0]!.id;
    const d = AgentDetailSchema.parse((await json(`/api/agents/${id}`)).body);
    expect(d.trust).toBeTruthy();
    const internalPaid = db.$client
      .prepare(`SELECT count(*) n FROM escrow_transfers WHERE kind='internal' AND to_account IN (SELECT near_account FROM market_agents WHERE near_account IS NOT NULL)`)
      .get() as { n: number };
    expect(internalPaid.n).toBe(0);
  });
});

describe("flattenSources (P1 shapes)", () => {
  it("by_token map → one record per token with symbol", () => {
    const r = flattenSources({ by_token: { "nep141:wrap.near": { deposit: "1", refund: "0" } } });
    expect(r).toEqual([
      { group: "by_token", kind: "value", id: "nep141:wrap.near", label: "wNEAR", url: null, extra: { deposit: "1", refund: "0", decimals: 24 } },
    ]);
  });

  it("endpoint + tx hash", () => {
    const tx = "HPnA2yCSNqTPaye1DLdkLN6Ld1vUR6agrbxs7ELxqnmX";
    const r = flattenSources({ endpoint: "POST x/v0/account", fetched_at: "t", last_success_tx: tx });
    expect(r.map((x) => [x.kind, x.id])).toEqual([
      ["endpoint", "POST x/v0/account"],
      ["tx", tx],
    ]);
  });
});
