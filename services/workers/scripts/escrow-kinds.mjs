// Kind breakdown: operator wallet vs others, per token, per month. Usage: node scripts/escrow-kinds.mjs [db]
import Database from "better-sqlite3";
const db = new Database(process.argv[2] ?? "../../data/juri.db", { readonly: true });
const OP = "5cdaee04aeec7abf076fd197411ffab6b08cf7aaefba14b57f6fc5fbececc3c8";
const sym = `case when token like 'nep141:1720%' then 'USDC' when token='nep141:wrap.near' then 'wNEAR' when token='native:near' then 'NEAR' else token end`;
console.table(db.prepare(`select kind, ${sym} tok,
   case when from_account=@op or to_account=@op then 'operator' else 'other' end party,
   count(*) n, round(sum(cast(amount as real))/case when token like 'nep141:1720%' then 1e6 else 1e24 end, 2) amount
 from escrow_transfers where succeeded=1 and kind!='relay' group by 1,2,3 order by 2,1,3`).all({ op: OP }));
console.table(db.prepare(`select substr(ts,1,7) month, sum(kind='deposit') dep, sum(kind='reward') rew, sum(kind='fee') fee, sum(kind='refund') ref
 from escrow_transfers where succeeded=1 group by 1 order by 1`).all());
