import "./load-env.js";
import { formatNear } from "@juri/shared";
import { accountWithKey, call, explorerTx, secretFor, view, viewer } from "./near.js";

/** pnpm --filter @juri/workers withdraw <account>  — pulls an account's claimable balance (keychain key). */
const acct = process.argv[2];
if (!acct) throw new Error("usage: withdraw <account>");
const claimable = await view<string>(await viewer(), "get_claimable", { account_id: acct });
if (claimable === "0") {
  console.log(`${acct}: nothing to withdraw`);
} else {
  const a = await accountWithKey(acct, secretFor(acct) ?? "");
  const r = await call(a, "withdraw", {}, 30);
  console.log(`${acct}: withdrew ${formatNear(claimable)} NEAR ${explorerTx(r.txHash)}`);
}
