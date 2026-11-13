import "@juri/workers/src/load-env.js"; // first: loads <repo>/.env (P0 accounts, contract id, keys)
import { serve } from "@hono/node-server";
import { DEFAULT_COMPILER_MODEL, liveProviderKind, makeProvider } from "@juri/jury";
import { DataModeSchema } from "@juri/shared";
import { openDb, REPO_ROOT } from "@juri/workers/src/db/index.js";
import { isEmpty, loadSnapshot } from "@juri/workers/src/pipeline.js";
import { resolve } from "node:path";
import { createApp } from "./app.js";

/** Entry: `pnpm --filter @juri/api start` → http://localhost:${PORT:-8787}/api/health */
const mode = DataModeSchema.catch("snapshot").parse(process.env.MODE ?? "snapshot");
const port = Number(process.env.PORT ?? 8787);
const db = openDb();

// Fresh clone / empty DB in SNAPSHOT mode: load the committed snapshot and derive metrics + trust,
// so the app runs without network or API keys (FR-A4).
if (mode === "snapshot" && isEmpty(db)) {
  const r = loadSnapshot(db);
  console.log(`empty database: loaded ${r.file} (${r.trust.agents} agents, ${r.metrics.length} metrics)`);
}

const app = createApp({
  db,
  mode,
  blobDir: resolve(REPO_ROOT, process.env.BLOB_DIR ?? "data/blobs"),
  publicUrl: process.env.PUBLIC_API_URL ?? `http://localhost:${port}`,
  network: process.env.NEAR_NETWORK ?? "testnet",
  contractId: process.env.JURI_CONTRACT_ID || null,
  // Spec Compiler: NEAR AI Cloud when NEARAI_API_KEY is set, else FALLBACK_LLM_*, else 503 no_llm.
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
