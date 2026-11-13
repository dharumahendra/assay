// Escrow balances inside intents.near (view call) + how many distinct payouts the failed retries represent.
import Database from "better-sqlite3";
const RPC = process.env.NEAR_MAINNET_RPC ?? "https://rpc.mainnet.fastnear.com";
const view = async (method, args) => {
  const r = await fetch(RPC, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0", id: 1, method: "query",
      params: { request_type: "call_function", finality: "final", account_id: "intents.near", method_name: method, args_base64: Buffer.from(JSON.stringify(args)).toString("base64") },
    }),
  }).then((x) => x.json());
  if (r.error || r.result?.error) return { error: r.error?.cause?.name ?? r.result.error };
  return JSON.parse(Buffer.from(r.result.result).toString());
};
const USDC = "nep141:17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1";
const tokens = [USDC, "nep141:wrap.near"];
console.log("escrow.ai.near balances in intents.near:", tokens.map((t, i) => t.slice(0, 20)), await view("mt_batch_balance_of", { account_id: "escrow.ai.near", token_ids: tokens }));

const db = new Database(process.argv[2] ?? "../../data/juri.db", { readonly: true });
console.table(db.prepare(`
  select case when to_account='treasury.ai.near' then 'fee' else 'payout' end leg,
         count(*) attempts, count(distinct to_account||amount) distinct_payouts,
         sum(cast(amount as real))/1e6 attempted_usdc,
         (select sum(a)/1e6 from (select distinct to_account t, cast(amount as real) a from escrow_transfers e2
            where e2.from_account='escrow.ai.near' and e2.token=? and (e2.to_account='treasury.ai.near') = (e.to_account='treasury.ai.near'))) distinct_usdc
  from escrow_transfers e where from_account='escrow.ai.near' and token=? group by 1`).all(USDC, USDC));
console.table(db.prepare(`select to_account, amount, count(*) retries, min(ts) first, max(ts) last from escrow_transfers
  where from_account='escrow.ai.near' group by 1,2 order by retries desc limit 8`).all());
