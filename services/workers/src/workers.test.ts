import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { TRANSFER_KINDS as SHARED_KINDS } from "@juri/shared";
import { describe, expect, it } from "vitest";
import { classifyLegs } from "./classify.js";
import { loadRepoEnv } from "./env.js";
import { openDb, schema } from "./db/index.js";
import { legsOf, reclassify, storeTxn, type EscrowTx } from "./index-escrow.js";
import { computeMetrics } from "./metrics.js";
import { exportSnapshot, importSnapshot } from "./snapshot.js";
import { upsertAgent } from "./sync-market.js";

const cfg = {
  escrowIds: new Set(["escrow.ai.near"]),
  feeAccounts: new Set(["treasury.ai.near"]),
  operatorAccounts: new Set(["op.near"]),
  feeShareMax: 0.03,
};
const L = (id: string, from: string, to: string, amount = "100", txHash = id, token = "t") => ({ id, txHash, from, to, token, amount });

const agent = (id: string, handle: string, delivered: number) => ({
  agent_id: id,
  owner_account_id: "00000000-0000-4000-8000-000000000000",
  handle,
  name: handle,
  delivered_jobs: delivered,
  created_at: "2026-01-01T00:00:00Z",
});

const intentTx = (hash: string, ts: number, ok: boolean, signer: string, to: string, amount = "100"): EscrowTx => ({
  hash,
  ts: new Date(ts).toISOString(),
  blockHeight: ts,
  signer: "escrow.ai.near",
  receiver: "intents.near",
  succeeded: ok,
  actions: [
    {
      method: "execute_intents",
      deposit: "0",
      args: {
        signed: [{ payload: { message: JSON.stringify({ signer_id: signer, intents: [{ intent: "transfer", receiver_id: to, tokens: { "nep141:usdc": amount } }] }) } }],
      },
    },
  ],
});

describe("legsOf", () => {
  it("covers ft_transfer and native transfers", () => {
    const legs = legsOf({
      hash: "h", ts: "t", blockHeight: 1, signer: "escrow.ai.near", receiver: "usdc.near", succeeded: true,
      actions: [
        { method: "ft_transfer", deposit: "1", args: { receiver_id: "w.near", amount: "5" } },
        { method: null, deposit: "7", args: null },
      ],
    });
    expect(legs.map((l) => [l.intentType, l.from, l.to, l.token, l.amount])).toEqual([
      ["ft_transfer", "escrow.ai.near", "w.near", "nep141:usdc.near", "5"],
      ["native_transfer", "escrow.ai.near", "usdc.near", "native:near", "7"],
    ]);
  });
});

it("loadRepoEnv fills missing vars but never overrides existing ones", () => {
  const dir = mkdtempSync(join(tmpdir(), "juri-env-"));
  const f = join(dir, ".env");
  writeFileSync(f, "JURI_TEST_A=from-file\nJURI_TEST_B=from-file\n");
  process.env.JURI_TEST_B = "from-shell";
  expect(loadRepoEnv(f)).toBe(true);
  expect([process.env.JURI_TEST_A, process.env.JURI_TEST_B]).toEqual(["from-file", "from-shell"]);
  expect(loadRepoEnv(join(dir, "missing.env"))).toBe(false);
  delete process.env.JURI_TEST_A;
  delete process.env.JURI_TEST_B;
});

it("db TRANSFER_KINDS matches @juri/shared", () => {
  expect([...schema.TRANSFER_KINDS]).toEqual([...SHARED_KINDS]);
});

describe("classifyLegs", () => {
  it("deposit / reward / refund / fee / relay", () => {
    const k = classifyLegs(
      [
        L("1", "req.near", "escrow.ai.near"),
        L("2", "escrow.ai.near", "worker.near", "50"),
        L("3", "escrow.ai.near", "req.near"), // exact amount of req's deposit
        L("4", "escrow.ai.near", "treasury.ai.near", "1"),
        L("5", "x.near", "y.near"),
        L("6", "escrow.ai.near", "op.near"),
        L("7", "op.near", "escrow.ai.near"),
      ],
      cfg,
    );
    expect([...k.values()]).toEqual(["deposit", "reward", "refund", "fee", "relay", "internal", "internal"]);
  });

  it("2% leg of a two-leg payout is the fee, the other is the reward", () => {
    const k = classifyLegs([L("a", "escrow.ai.near", "op.near", "2", "tx"), L("b", "escrow.ai.near", "w.near", "98", "tx")], cfg);
    expect([k.get("a"), k.get("b")]).toEqual(["fee", "reward"]);
  });

  it("refund needs an earlier deposit of the same amount, and consumes it", () => {
    const k = classifyLegs(
      [
        L("1", "escrow.ai.near", "req.near"),
        L("2", "req.near", "escrow.ai.near"),
        L("3", "escrow.ai.near", "req.near", "99"),
        L("4", "escrow.ai.near", "req.near"),
        L("5", "escrow.ai.near", "req.near"),
      ],
      cfg,
    );
    expect([...k.values()]).toEqual(["reward", "deposit", "reward", "refund", "reward"]);
  });
});

describe("db pipeline", () => {
  it("agent upsert is idempotent", () => {
    const db = openDb(":memory:");
    for (let i = 0; i < 2; i++) upsertAgent(db, agent("11111111-1111-4111-8111-111111111111", "a", 3), "t");
    expect(db.select().from(schema.marketAgents).all()).toHaveLength(1);
  });

  it("stores escrow txns once, ignores failed ones in metrics, classifies", () => {
    const db = openDb(":memory:");
    const txs = [
      intentTx("h1", 1_000, true, "req.near", "escrow.ai.near"),
      intentTx("h2", 2_000, true, "escrow.ai.near", "worker.near"),
      intentTx("h3", 3_000, true, "escrow.ai.near", "req.near"),
      intentTx("h4", 4_000, false, "escrow.ai.near", "req.near"),
    ];
    expect(txs.map((t) => storeTxn(db, t))).toEqual([true, true, true, true]);
    expect(storeTxn(db, txs[0]!)).toBe(false);
    expect(reclassify(db)).toEqual({ deposit: 1, reward: 1, refund: 1 }); // h3 repays req's exact deposit
    const m2 = computeMetrics(db).find((m) => m.id === "M2" && m.window === "all")!;
    expect([m2.numerator, m2.denominator, m2.value]).toEqual([1, 1, 1]);
  });

  it("snapshot round-trips and detects tampering", () => {
    const dir = mkdtempSync(join(tmpdir(), "juri-snap-"));
    const a = openDb(":memory:");
    upsertAgent(a, agent("22222222-2222-4222-8222-222222222222", "b", 5), "t");
    storeTxn(a, intentTx("h1", 1_000, true, "req.near", "escrow.ai.near"));
    const snap = exportSnapshot(a, dir);
    const b = openDb(":memory:");
    const r = importSnapshot(b, snap.file);
    expect(r.sha256).toBe(snap.sha256);
    expect(r.rows).toMatchObject({ market_agents: 1, escrow_txns: 1, escrow_transfers: 1 });
    writeFileSync(snap.file, "{}");
    expect(() => importSnapshot(openDb(":memory:"), snap.file)).toThrow(/sha256 mismatch/);
  });
});
