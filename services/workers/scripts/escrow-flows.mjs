// Explore decoded escrow legs to tune the kind heuristic. Usage: node scripts/escrow-flows.mjs [db]
import Database from "better-sqlite3";
const db = new Database(process.argv[2] ?? "../../data/juri.db", { readonly: true });
const q = (title, sql, ...a) => { console.log(`\n# ${title}`); console.table(db.prepare(sql).all(...a)); };
const short = `case when x='escrow.ai.near' then 'escrow' when x='treasury.ai.near' then 'treasury' when length(x)=64 then 'implicit' when x like '0x%' then 'evm' else x end`;
const s = (col) => short.replaceAll("x", col);

q("legs by type/token/from/to/kind", `select intent_type, substr(token,1,22) tok, ${s("from_account")} f, ${s("to_account")} t, kind, count(*) n,
   sum(cast(amount as real)) amt from escrow_transfers where succeeded=1 group by 1,2,3,4,5 order by n desc limit 25`);
q("tx methods", `select signer = 'escrow.ai.near' esc_signed, receiver, method, count(*) n from escrow_txns group by 1,2,3 order by n desc limit 15`);
q("legs per tx (escrow-signed execute_intents)", `select n, count(*) txs from (select tx_hash, count(*) n from escrow_transfers where intent_type='transfer' group by 1) group by 1 order by 2 desc limit 8`);
q("memos", `select substr(memo,1,60) memo, count(*) n from escrow_transfers where memo is not null group by 1 order by n desc limit 10`);
q("USDC amounts out of escrow (top)", `select amount, ${s("to_account")} t, count(*) n from escrow_transfers where from_account='escrow.ai.near' and succeeded=1 group by 1,2 order by n desc limit 10`);
q("accounts both depositing and receiving", `select count(*) n from (select distinct from_account a from escrow_transfers where kind='deposit') d
   join (select distinct to_account a from escrow_transfers where from_account='escrow.ai.near') r using(a)`);
q("distinct depositors / receivers", `select (select count(distinct from_account) from escrow_transfers where kind='deposit') depositors,
   (select count(distinct to_account) from escrow_transfers where from_account='escrow.ai.near' and to_account!='treasury.ai.near') receivers`);
q("a sample tx with several legs", `select tx_hash, intent_type, ${s("from_account")} f, ${s("to_account")} t, amount, kind from escrow_transfers
   where tx_hash = (select tx_hash from escrow_transfers where from_account='escrow.ai.near' group by tx_hash having count(*)>=2 limit 1)`);
