import "./load-env.js";
import { parseNear } from "@juri/shared";
import { accountWithKey, explorerTx, secretFor } from "./near.js";

/** pnpm --filter @juri/workers fund:demo <from> <to> <near>  — testnet transfer between our own demo accounts. */
const [from, to, amt] = process.argv.slice(2);
if (!from || !to || !amt) throw new Error("usage: fund-demo <from> <to> <near>");
const a = await accountWithKey(from, secretFor(from) ?? "");
const r = await a.sendMoney(to, BigInt(parseNear(amt)));
console.log(`${from} → ${to}: ${amt} NEAR ${explorerTx(r.transaction.hash)}`);
