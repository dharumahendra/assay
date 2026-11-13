// T1.7: cross-check 3 decoded escrow legs against NEAR RPC (status + dip4 events) and 3 agents
// against the live market API. Usage: node scripts/verify-sample.mjs [db]
import Database from "better-sqlite3";
const db = new Database(process.argv[2] ?? "../../data/juri.db", { readonly: true });
const RPC = "https://archival-rpc.mainnet.fastnear.com";

const legs = ["reward", "deposit", "fee"].map((k) =>
  db.prepare(`select * from escrow_transfers where kind=? and intent_type='transfer' and succeeded=1 order by ts desc limit 1`).get(k),
);
for (const l of legs) {
  const tx = db.prepare("select signer from escrow_txns where tx_hash=?").get(l.tx_hash);
  const r = await fetch(RPC, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "EXPERIMENTAL_tx_status", params: { tx_hash: l.tx_hash, sender_account_id: tx.signer, wait_until: "NONE" } }),
  }).then((x) => x.json());
  const ok = r.result?.status && "SuccessValue" in r.result.status;
  const events = (r.result?.receipts_outcome ?? []).flatMap((o) => o.outcome.logs)
    .filter((s) => s.startsWith("EVENT_JSON:")).map((s) => JSON.parse(s.slice(11)))
    .filter((e) => e.event === "transfer").flatMap((e) => e.data);
  const match = events.some((e) => e.account_id === l.from_account && e.receiver_id === l.to_account && e.tokens?.[l.token] === l.amount);
  console.log(`${l.kind.padEnd(8)} ${l.tx_hash} ${l.ts}  rpc_success=${ok}  event_match=${match}  ${l.from_account.slice(0, 14)} -> ${(l.to_account ?? "").slice(0, 14)} ${l.amount} ${l.token.slice(0, 22)}`);
  console.log(`         https://nearblocks.io/txns/${l.tx_hash}`);
}

const agents = db.prepare(`select id, handle, delivered_jobs, success_rate from market_agents where delivered_jobs > 0 order by delivered_jobs desc limit 3`).all();
for (const a of agents) {
  const live = await fetch(`https://market.near.ai/v1/agents/${a.id}`).then((x) => x.json());
  console.log(`agent ${a.handle.padEnd(20)} db delivered=${a.delivered_jobs} success=${a.success_rate} | live delivered=${live.delivered_jobs} success=${live.success_rate} | https://market.near.ai/agents/${a.handle}`);
  await new Promise((r) => setTimeout(r, 1000));
}
