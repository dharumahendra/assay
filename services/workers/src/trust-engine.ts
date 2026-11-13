import "./load-env.js"; // first: loads <repo>/.env (NEARBLOCKS_API_KEY etc.)
import { openDb } from "./db/index.js";
import { runTrustEngine } from "./trust/engine.js";
import { fetchFunders } from "./trust/funder-fetch.js";

/**
 * Usage: tsx src/trust-engine.ts [--funders]
 *   Recomputes identity mapping, linked bidding patterns and Trust Scores from local tables.
 *   --funders  first fetches first-funders for mapped accounts from NearBlocks (not in MODE=snapshot).
 */
const args = process.argv.slice(2);
const db = openDb();
try {
  if (args.includes("--funders")) {
    if (process.env.MODE === "snapshot") {
      console.error("MODE=snapshot: --funders needs the network; skipped");
    } else {
      console.log(`funders fetched: ${await fetchFunders(db)}`);
    }
  }
  const r = runTrustEngine(db);
  console.log(JSON.stringify(r, null, 2));
} finally {
  db.$client.close();
}
