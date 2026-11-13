// Who receives the small leg of 2-leg escrow payouts (fee wallet?), and the leg ratio.
import Database from "better-sqlite3";
const db = new Database(process.argv[2] ?? "../../data/juri.db", { readonly: true });
const rows = db.prepare(`select tx_hash, to_account, cast(amount as real) a, token from escrow_transfers
  where from_account='escrow.ai.near' and succeeded=1 and tx_hash in
  (select tx_hash from escrow_transfers where from_account='escrow.ai.near' group by 1 having count(*)=2) order by tx_hash, a`).all();
const small = new Map(), ratios = new Map();
for (let i = 0; i + 1 < rows.length; i += 2) {
  const [s, b] = [rows[i], rows[i + 1]];
  if (s.tx_hash !== b.tx_hash) { i--; continue; }
  small.set(s.to_account, (small.get(s.to_account) ?? 0) + 1);
  const r = (s.a / (s.a + b.a) * 100).toFixed(1) + "%";
  ratios.set(r, (ratios.get(r) ?? 0) + 1);
}
const top = (m) => [...m].sort((x, y) => y[1] - x[1]).slice(0, 6);
console.log("small-leg receivers:", top(small));
console.log("small-leg share of total:", top(ratios));
console.table(db.prepare(`select to_account, count(*) n, count(distinct tx_hash) txs from escrow_transfers
  where from_account='escrow.ai.near' and succeeded=1 group by 1 order by n desc limit 8`).all());
console.table(db.prepare(`select from_account, count(*) n from escrow_transfers where kind='deposit' group by 1 order by n desc limit 6`).all());
