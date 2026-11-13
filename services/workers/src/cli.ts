import "./load-env.js"; // first: loads <repo>/.env before modules read process.env
import { openDb } from "./db/index.js";
import { indexEscrow } from "./index-escrow.js";
import { computeMetrics, printMetrics } from "./metrics.js";
import { derive, loadSnapshot } from "./pipeline.js";
import { exportSnapshot, importSnapshot, latestSnapshotFile } from "./snapshot.js";
import { syncMarket } from "./sync-market.js";
import { runTrustEngine } from "./trust/engine.js";

/**
 * Usage: tsx src/cli.ts <command> [--pages N] [file]
 *   migrate          create/upgrade the database
 *   sync             sync:market + index:escrow, then metrics + trust (05 §1)
 *   sync:market      market agents, reputation, platform stats
 *   index:escrow     escrow.ai.near successful txns (FastNEAR) + classification
 *   metrics          M1–M6 (FR-A3)
 *   trust            identity mapping, patterns, Trust Scores (P2)
 *   derive           metrics + trust
 *   snapshot:export  write data/snapshots/<ISO>.json + .sha256
 *   snapshot:import  [file] replace raw tables from a snapshot (latest by default)
 *   load:snapshot    [file] snapshot:import + derive (offline demo data in one step)
 * MODE=snapshot refuses network commands.
 */
const [cmd, ...rest] = process.argv.slice(2);
const flag = (name: string, d: number) => {
  const i = rest.indexOf(`--${name}`);
  return i >= 0 ? Number(rest[i + 1]) : d;
};
const positional = rest.filter((a, i) => !a.startsWith("--") && !rest[i - 1]?.startsWith("--"));

const NETWORK = new Set(["sync", "sync:market", "index:escrow"]);
if (process.env.MODE === "snapshot" && cmd && NETWORK.has(cmd)) {
  console.error(`MODE=snapshot: '${cmd}' needs the network; run load:snapshot instead`);
  process.exit(2);
}

const db = openDb();
const escrowOpts = { maxPages: flag("pages", 100) };
const printTrust = (t: ReturnType<typeof runTrustEngine>) =>
  console.log(
    `trust ${t.algo_version}: ${t.agents} agents, ${t.scored} scored, ${t.insufficient} insufficient, ` +
      `${t.mapped} mapped, ${t.patterns} patterns`,
  );

try {
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
    case "sync": {
      await syncMarket(db);
      await indexEscrow(db, escrowOpts);
      const d = derive(db);
      printMetrics(d.metrics);
      printTrust(d.trust);
      break;
    }
    case "metrics":
      printMetrics(computeMetrics(db));
      break;
    case "trust":
      printTrust(runTrustEngine(db));
      break;
    case "derive": {
      const d = derive(db);
      printMetrics(d.metrics);
      printTrust(d.trust);
      break;
    }
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
    case "load:snapshot": {
      const r = loadSnapshot(db, positional[0] ?? latestSnapshotFile());
      console.log(`loaded ${r.file} (sha256 ${r.sha256})`);
      printMetrics(r.metrics);
      printTrust(r.trust);
      break;
    }
    default:
      console.error(
        "commands: migrate | sync | sync:market | index:escrow | metrics | trust | derive | snapshot:export | snapshot:import [file] | load:snapshot [file]",
      );
      process.exitCode = 1;
  }
} finally {
  db.$client.close();
}
