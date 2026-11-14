import "@juri/workers/src/load-env.js"; // first: loads <repo>/.env (P0 accounts, contract id, keys)
import { serve } from "@hono/node-server";
import { DEFAULT_COMPILER_MODEL, liveProviderKind, makeProvider } from "@juri/jury";
import { DataModeSchema } from "@juri/shared";
import { openDb, REPO_ROOT } from "@juri/workers/src/db/index.js";
import { loadSnapshot, pendingSnapshot } from "@juri/workers/src/pipeline.js";
import { resolve } from "node:path";
import { createApp } from "./app.js";
import { rpcContractReader } from "./contract.js";

/** Entry: `pnpm --filter @juri/api start` → http://localhost:${PORT:-8787}/api/health */
const mode = DataModeSchema.catch("snapshot").parse(process.env.MODE ?? "snapshot");
const port = Number(process.env.PORT ?? 8787);
const db = openDb();
// Same default as the workers and the web app (P0 deploy).
const contractId = process.env.JURI_CONTRACT_ID || `juri.${process.env.NEAR_ROOT_ACCOUNT ?? "juri-assay-jdir.testnet"}`;

// SNAPSHOT mode: load the latest committed snapshot when the database is empty or was filled from an older
// one (a persistent volume outlives deploys), then derive metrics + trust. No network or API keys (FR-A4).
const pending = mode === "snapshot" ? pendingSnapshot(db) : null;
if (pending) {
  const r = loadSnapshot(db, pending);
  console.log(`loaded snapshot ${r.file} (${r.trust.agents} agents, ${r.metrics.length} metrics)`);
}

const app = createApp({
  db,
  mode,
  blobDir: resolve(REPO_ROOT, process.env.BLOB_DIR ?? "data/blobs"),
  publicUrl: process.env.PUBLIC_API_URL ?? `http://localhost:${port}`,
  network: process.env.NEAR_NETWORK ?? "testnet",
  contractId,
  contract: rpcContractReader({ rpcUrl: process.env.NEAR_RPC_URL ?? "https://test.rpc.fastnear.com", contractId }),
  // Spec Compiler: NEAR AI Cloud when NEARAI_API_KEY is set, else FALLBACK_LLM_*, else 503 no_llm.
  // Railway/Fly put one proxy in front: TRUST_PROXY=1. Unset locally so X-Forwarded-For can't dodge rate limits.
  trustProxy: Number(process.env.TRUST_PROXY ?? 0) || 0,
  compiler: () => (liveProviderKind() ? makeProvider(process.env.COMPILER_MODEL || DEFAULT_COMPILER_MODEL) : null),
});

const server = serve({ fetch: app.fetch, port }, (info) => console.log(`juri api (${mode}) on http://localhost:${info.port}`));
const stop = () => {
  server.close();
  db.$client.close();
  process.exit(0);
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
