import { eq } from "drizzle-orm";
import type { Db } from "../db/index.js";
import { accountFunders, marketAgents } from "../db/schema.js";
import { getJson } from "../http.js";

/**
 * Fills `account_funders` for mapped agent accounts (FR-B5, SHOULD): the funder is the signer of
 * the account's first incoming transaction on mainnet (NearBlocks). Network; skipped in snapshot mode.
 * Accounts already in the table are not fetched again.
 */
const BASE = process.env.NEARBLOCKS_API_BASE ?? "https://api.nearblocks.io";

interface NbTxn {
  transaction_hash: string;
  signer_account_id: string;
  receiver_account_id: string;
  block_timestamp: string;
}

export type FetchJson = <T>(url: string) => Promise<T>;

const defaultFetch: FetchJson = (url) =>
  getJson(url, {
    minIntervalMs: 1500,
    headers: process.env.NEARBLOCKS_API_KEY ? { authorization: `Bearer ${process.env.NEARBLOCKS_API_KEY}` } : {},
  });

export async function fetchFunders(db: Db, fetchJson: FetchJson = defaultFetch, limit = 50): Promise<number> {
  const known = new Set(db.select({ a: accountFunders.account }).from(accountFunders).all().map((r) => r.a));
  const accounts = [
    ...new Set(
      db
        .select({ acc: marketAgents.nearAccount })
        .from(marketAgents)
        .all()
        .flatMap((r) => (r.acc && !known.has(r.acc) ? [r.acc] : [])),
    ),
  ].slice(0, limit);

  let n = 0;
  for (const acc of accounts) {
    const res = await fetchJson<{ txns?: NbTxn[] }>(
      `${BASE}/v1/account/${encodeURIComponent(acc)}/txns-only?order=asc&per_page=5`,
    );
    const first = (res.txns ?? []).find((t) => t.receiver_account_id === acc && t.signer_account_id !== acc);
    const ts = first ? new Date(Number(BigInt(first.block_timestamp) / 1_000_000n)).toISOString() : null;
    db.insert(accountFunders)
      .values({ account: acc, funder: first?.signer_account_id ?? null, firstTxHash: first?.transaction_hash ?? null, ts })
      .onConflictDoNothing()
      .run();
    n++;
  }
  return n;
}

export function setFunderExcluded(db: Db, account: string, excluded: boolean): void {
  db.update(accountFunders).set({ excluded }).where(eq(accountFunders.account, account)).run();
}
