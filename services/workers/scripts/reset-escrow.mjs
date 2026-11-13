// Drops locally indexed escrow data so index:escrow starts from scratch. Usage: node scripts/reset-escrow.mjs [db]
import Database from "better-sqlite3";
const db = new Database(process.argv[2] ?? "../../data/juri.db");
const del = (sql) => db.prepare(sql).run().changes;
console.log({
  escrow_transfers: del("delete from escrow_transfers"),
  escrow_txns: del("delete from escrow_txns"),
  sync_state: del("delete from sync_state where source like 'escrow%'"),
});
