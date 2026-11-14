/**
 * Live smoke test for the NearBlocks funder fetcher (T2.4, FR-B5). Uses an in-memory DB, so nothing
 * is written to data/juri.db. Accounts default to public mainnet signers of escrow.ai.near txns.
 *   pnpm --filter @juri/workers funder:smoke [account ...]
 */
import "./load-env.js";
import { openDb } from "./db/index.js";
import { accountFunders, marketAgents } from "./db/schema.js";
import { fetchFunders } from "./trust/funder-fetch.js";

const DEFAULT = ["escrow.ai.near", "5cdaee04aeec7abf076fd197411ffab6b08cf7aaefba14b57f6fc5fbececc3c8", "4677e10ead493604a039006c2ee223fd62b9a8507f31e040befb63532b2c7e32"];
const accounts = process.argv.slice(2).length ? process.argv.slice(2) : DEFAULT;

const db = openDb(":memory:");
const now = new Date().toISOString();
accounts.forEach((acc, i) =>
  db.insert(marketAgents).values({ id: `smoke-${i}`, handle: `smoke-${i}`, nearAccount: acc, mappingMethod: "api", rawJson: "{}", fetchedAt: now }).run(),
);

const n = await fetchFunders(db);
const rows = db.select().from(accountFunders).all();
console.log(`fetched ${n} account(s) from NearBlocks`);
for (const r of rows) console.log(`${r.account.slice(0, 24).padEnd(24)}  funder=${r.funder ?? "(none in first 5 txns)"}  first_tx=${r.firstTxHash ?? "-"}  ts=${r.ts ?? "-"}`);
const ok = rows.length === accounts.length && rows.some((r) => r.funder);
console.log(ok ? "OK: response parsed, at least one funder resolved" : "CHECK: no funder resolved; inspect the NearBlocks response shape");
process.exit(ok ? 0 : 1);
