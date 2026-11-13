import { openDb } from "./db/index.js";
import { indexEscrow } from "./index-escrow.js";
import { computeMetrics, printMetrics } from "./metrics.js";
import { exportSnapshot, importSnapshot, latestSnapshotFile } from "./snapshot.js";
import { syncMarket } from "./sync-market.js";

/**
 * Usage: tsx src/cli.ts <command> [--pages N] [file]
 *   migrate | sync | sync:market | index:escrow | metrics | snapshot:export | snapshot:import [file]
 * MODE=snapshot refuses network commands (05 §1).
 */
const [cmd, ...rest] = process.argv.slice(2);
const flag = (name: string, d: number) => {
  const i = rest.indexOf(`--${name}`);
  return i >= 0 ? Number(rest[i + 1]) : d;
};
const positional = rest.filter((a, i) => !a.startsWith("--") && !rest[i - 1]?.startsWith("--"));

const NETWORK = new Set(["sync", "sync:market", "index:escrow"]);
if (process.env.MODE === "snapshot" && cmd && NETWORK.has(cmd)) {
  console.error(`MODE=snapshot: '${cmd}' needs the network; run snapshot:import instead`);
  process.exit(2);
}

const db = openDb();
const escrowOpts = { maxPages: flag("pages", 100) };

switch (cmd) {
  case "migrate":
    console.log("migrated");
    break;
  case "sync:market":
    await syncMarket(db);
    break;
  case "index:escrow":
    await indexEscrow(db, escrowOpts);
    break;
  case "sync":
    await syncMarket(db);
    await indexEscrow(db, escrowOpts);
    break;
  case "metrics":
    printMetrics(computeMetrics(db));
    break;
  case "snapshot:export": {
    const r = exportSnapshot(db);
    console.log(`snapshot ${r.file}\nsha256 ${r.sha256}\nrows ${JSON.stringify(r.rows)}`);
    break;
  }
  case "snapshot:import": {
    const file = positional[0] ?? latestSnapshotFile();
    if (!file) throw new Error("no snapshot file found in data/snapshots");
    const r = importSnapshot(db, file);
    console.log(`imported ${file}\nsha256 ${r.sha256}\nrows ${JSON.stringify(r.rows)}`);
    break;
  }
  default:
    console.error("commands: migrate | sync | sync:market | index:escrow | metrics | snapshot:export | snapshot:import [file]");
    process.exit(1);
}
db.$client.close();
