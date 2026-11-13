import { decodeExecuteIntents, type IntentLeg } from "@juri/shared";
import { asc, eq, sql } from "drizzle-orm";
import { classifyLegs, defaultClassifyConfig } from "./classify.js";
import type { Db } from "./db/index.js";
import { escrowTransfers, escrowTxns, sourceFacts } from "./db/schema.js";
import { postJson } from "./http.js";
import { getCursor, setCursor, tracked } from "./sync-state.js";

/**
 * FR-A2, adapted (docs/phase0-findings.md V4): escrow.ai.near settles through `execute_intents`
 * on intents.near. ~99.5% of its ~2M txns are failed retries, so we index only **successful**
 * txns, listed by the FastNEAR transaction API (05 §3.2 fallback; NearBlocks cannot filter on
 * status), oldest first with a resume token. Details are fetched in batches and decoded into
 * token legs. Failed-attempt totals are stored as source facts (no per-tx rows).
 *
 * Idempotent: PK = tx hash / leg id; the resume token is saved after every page.
 */
const ACCOUNT = process.env.ESCROW_ACCOUNT ?? "escrow.ai.near";
const FASTNEAR_TX = process.env.FASTNEAR_TX_API ?? "https://tx.main.fastnear.com";
const LIST_LIMIT = 200;
const DETAIL_BATCH = 20;
const OPTS = { minIntervalMs: 300, timeoutMs: 60_000 };

interface AccountTx {
  transaction_hash: string;
  tx_block_height: number;
  tx_block_timestamp: string;
  is_success: boolean;
}
interface AccountTxPage {
  account_txs: AccountTx[];
  resume_token?: string | null;
  txs_count?: number;
}
type FnAction = { FunctionCall: { method_name: string; args: string; deposit: string } };
type TransferAction = { Transfer: { deposit: string } };
interface FastTx {
  transaction: { hash: string; signer_id: string; receiver_id: string; actions: (FnAction | TransferAction | string | object)[] };
}

/** Normalised transaction, independent of the data source (also used by tests). */
export interface EscrowTx {
  hash: string;
  ts: string;
  blockHeight: number;
  signer: string;
  receiver: string;
  succeeded: boolean | null;
  actions: { method: string | null; args: unknown; deposit: string }[];
  raw?: unknown;
}

const nsToIso = (ns: string) => new Date(Number(BigInt(ns) / 1_000_000n)).toISOString();
const b64json = (s: string): unknown => {
  try {
    return JSON.parse(Buffer.from(s, "base64").toString("utf8"));
  } catch {
    return null;
  }
};

type Leg = Omit<IntentLeg, "signer"> & { signer?: string };

/** Token legs of one tx: intents, NEP-141 transfers, native transfers. */
export function legsOf(tx: EscrowTx): Leg[] {
  const legs: Leg[] = [];
  tx.actions.forEach((a, ai) => {
    if (a.method === "execute_intents") {
      for (const l of decodeExecuteIntents(a.args).legs) legs.push({ ...l, signedIdx: ai * 1000 + l.signedIdx });
    } else if (a.method === "ft_transfer" || a.method === "ft_transfer_call") {
      const args = (a.args ?? {}) as { receiver_id?: string; amount?: string; memo?: string };
      legs.push({
        signedIdx: ai * 1000, intentIdx: 0, intentType: a.method, from: tx.signer, to: args.receiver_id ?? null,
        token: `nep141:${tx.receiver}`, amount: String(args.amount ?? "0"), memo: args.memo ?? null,
      });
    } else if (a.method === null && a.deposit !== "0") {
      legs.push({
        signedIdx: ai * 1000, intentIdx: 0, intentType: "native_transfer", from: tx.signer, to: tx.receiver,
        token: "native:near", amount: a.deposit, memo: null,
      });
    }
  });
  return legs;
}

/** Stores one tx and its legs (kind provisional until `reclassify`). Returns true if new. */
export function storeTxn(db: Db, tx: EscrowTx): boolean {
  if (db.select({ h: escrowTxns.txHash }).from(escrowTxns).where(eq(escrowTxns.txHash, tx.hash)).get()) return false;
  db.insert(escrowTxns)
    .values({
      txHash: tx.hash,
      nbId: String(tx.blockHeight),
      blockHeight: tx.blockHeight,
      ts: tx.ts,
      signer: tx.signer,
      receiver: tx.receiver,
      method: tx.actions.find((a) => a.method)?.method ?? (tx.actions.length ? "transfer" : null),
      succeeded: tx.succeeded,
      rawJson: JSON.stringify(tx.raw ?? tx),
    })
    .run();
  for (const l of legsOf(tx)) {
    db.insert(escrowTransfers)
      .values({
        id: `${tx.hash}:${l.signedIdx}:${l.intentIdx}:${l.token}`,
        txHash: tx.hash,
        ts: tx.ts,
        intentType: l.intentType,
        fromAccount: l.from,
        toAccount: l.to,
        token: l.token,
        amount: l.amount,
        succeeded: tx.succeeded,
        kind: "unknown",
        kindMethod: "heuristic",
        memo: l.memo,
      })
      .onConflictDoNothing()
      .run();
  }
  return true;
}

function fromFast(list: AccountTx, d: FastTx): EscrowTx {
  const t = d.transaction;
  return {
    hash: t.hash,
    ts: nsToIso(list.tx_block_timestamp),
    blockHeight: list.tx_block_height,
    signer: t.signer_id,
    receiver: t.receiver_id,
    succeeded: list.is_success,
    actions: t.actions.map((a) => {
      if (typeof a === "object" && a && "FunctionCall" in a) {
        const f = (a as FnAction).FunctionCall;
        return { method: f.method_name, args: b64json(f.args), deposit: String(f.deposit ?? "0") };
      }
      if (typeof a === "object" && a && "Transfer" in a) return { method: null, args: null, deposit: String((a as TransferAction).Transfer.deposit) };
      return { method: typeof a === "string" ? a : Object.keys(a)[0] ?? null, args: null, deposit: "0" };
    }),
    raw: { list, transaction: t },
  };
}

/** Re-applies the heuristic to every succeeded leg, oldest first (FR-A2 `kind_method`). */
export function reclassify(db: Db): Record<string, number> {
  const legs = db
    .select({
      id: escrowTransfers.id,
      txHash: escrowTransfers.txHash,
      from: escrowTransfers.fromAccount,
      to: escrowTransfers.toAccount,
      token: escrowTransfers.token,
      amount: escrowTransfers.amount,
    })
    .from(escrowTransfers)
    .where(eq(escrowTransfers.succeeded, true))
    .orderBy(asc(escrowTransfers.ts), asc(escrowTransfers.id))
    .all();
  const kinds = classifyLegs(legs, defaultClassifyConfig());
  const counts: Record<string, number> = {};
  db.transaction((tx) => {
    tx.update(escrowTransfers).set({ kind: "unknown" }).where(sql`${escrowTransfers.succeeded} IS NOT 1`).run();
    for (const [id, kind] of kinds) {
      tx.update(escrowTransfers).set({ kind, kindMethod: "heuristic" }).where(eq(escrowTransfers.id, id)).run();
      counts[kind] = (counts[kind] ?? 0) + 1;
    }
  });
  return counts;
}

function setFact(db: Db, key: string, value: unknown, source: string) {
  const row = { key, valueJson: JSON.stringify(value), source, updatedAt: new Date().toISOString() };
  db.insert(sourceFacts).values(row).onConflictDoUpdate({ target: sourceFacts.key, set: row }).run();
}

/** Totals for all vs. successful escrow txns, and the latest successful one (for M6). */
async function recordTotals(db: Db, log: (s: string) => void) {
  const all = await postJson<AccountTxPage>(`${FASTNEAR_TX}/v0/account`, { account_id: ACCOUNT, limit: 1, desc: true }, OPTS);
  const ok = await postJson<AccountTxPage>(`${FASTNEAR_TX}/v0/account`, { account_id: ACCOUNT, is_success: true, limit: 1, desc: true }, OPTS);
  const last = ok.account_txs[0];
  const latest = all.account_txs[0];
  const v = {
    all_txs: all.txs_count ?? null,
    successful_txs: ok.txs_count ?? null,
    latest_tx_at: latest ? nsToIso(latest.tx_block_timestamp) : null,
    last_success_at: last ? nsToIso(last.tx_block_timestamp) : null,
    last_success_tx: last?.transaction_hash ?? null,
  };
  setFact(db, "escrow:totals", v, `POST ${FASTNEAR_TX}/v0/account`);
  log(`  totals: ${JSON.stringify(v)}`);
}

export interface IndexOpts {
  maxPages?: number;
  log?: (s: string) => void;
}

export async function indexEscrow(db: Db, opts: IndexOpts = {}): Promise<{ added: number; pages: number }> {
  const { maxPages = 100, log = console.log } = opts;
  return tracked(db, "escrow", async () => {
    let token = getCursor(db, "escrow:fastnear");
    let added = 0;
    let pages = 0;
    for (; pages < maxPages; pages++) {
      // Oldest first (`desc:false`; the API default is newest first), so the saved token moves forward in time.
      const body: Record<string, unknown> = { account_id: ACCOUNT, is_success: true, limit: LIST_LIMIT, desc: false };
      if (token) body.resume_token = token;
      const page = await postJson<AccountTxPage>(`${FASTNEAR_TX}/v0/account`, body, OPTS);
      const fresh = page.account_txs.filter(
        (t) => !db.select({ h: escrowTxns.txHash }).from(escrowTxns).where(eq(escrowTxns.txHash, t.transaction_hash)).get(),
      );
      for (let i = 0; i < fresh.length; i += DETAIL_BATCH) {
        const batch = fresh.slice(i, i + DETAIL_BATCH);
        const det = await postJson<{ transactions: FastTx[] }>(
          `${FASTNEAR_TX}/v0/transactions`,
          { tx_hashes: batch.map((t) => t.transaction_hash) },
          OPTS,
        );
        const byHash = new Map(det.transactions.map((d) => [d.transaction.hash, d]));
        db.transaction(() => {
          for (const t of batch) {
            const d = byHash.get(t.transaction_hash);
            if (d && storeTxn(db, fromFast(t, d))) added++;
          }
        });
      }
      const last = page.account_txs.at(-1);
      log(`  page ${pages}: ${page.account_txs.length} listed, ${fresh.length} new${last ? `, up to ${nsToIso(last.tx_block_timestamp)}` : ""}`);
      if (!page.resume_token || page.account_txs.length === 0) break; // caught up; keep the last token
      token = page.resume_token;
      setCursor(db, "escrow:fastnear", token);
    }
    await recordTotals(db, log);
    const kinds = reclassify(db);
    log(`  classified (succeeded legs): ${JSON.stringify(kinds)}`);
    return { added, pages };
  });
}
