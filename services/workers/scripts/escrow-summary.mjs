// Quick look at what the escrow indexer has stored. Usage: node scripts/escrow-summary.mjs [db]
import Database from "better-sqlite3";
const db = new Database(process.argv[2] ?? "../../data/juri.db", { readonly: true });
const q = (sql) => console.table(db.prepare(sql).all());
q(`select succeeded, count(*) n, min(ts) first, max(ts) last from escrow_txns group by succeeded`);
q(`select intent_type, token,
     case when from_account='escrow.ai.near' then 'escrow' when length(from_account)=64 then 'implicit' else from_account end f,
     case when to_account='escrow.ai.near' then 'escrow' when to_account=from_account then 'self'
          when length(to_account)=64 then 'implicit' else to_account end t,
     succeeded, kind, count(*) n
   from escrow_transfers group by 1,2,3,4,5,6 order by n desc limit 25`);
q(`select from_account, count(*) n from escrow_transfers where succeeded=0 group by 1 order by n desc limit 5`);
