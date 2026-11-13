import "./load-env.js";
import { ContractJobSchema, ContractVerifierSchema, type ContractJob } from "@juri/shared";
import { liveProviderKind } from "@juri/jury";
import type { Account } from "near-api-js";
import { resolve } from "node:path";
import { openDb, REPO_ROOT } from "./db/index.js";
import { providerResolver, tick, VERIFIER_GAS_TGAS, type Chain } from "./jury-runner.js";
import { accountWithKey, call, CONTRACT, explorerTx, keeperSecret, NETWORK, secretFor, view, viewer } from "./near.js";

/**
 * pnpm jury [--once] [--interval 5000]
 * Runs the jury loop against JURI_CONTRACT_ID with the verifier keys in the near-cli keychain
 * (or VERIFIER_KEYS_JSON) and the keeper FCAK. Without an LLM key every verifier uses the offline
 * rules juror (model "rules:v1", not attested) — see devlog P4.
 */
const argv = process.argv.slice(2);
const once = argv.includes("--once");
const interval = Number(argv.includes("--interval") ? argv[argv.indexOf("--interval") + 1] : process.env.JURY_INTERVAL_MS ?? 5000);

async function liveChain(): Promise<Chain> {
  const v = await viewer();
  const explicit = JSON.parse(process.env.VERIFIER_KEYS_JSON || "{}") as Record<string, string>;
  const verifiers = (await view<unknown[]>(v, "get_verifiers")).map((x) => ContractVerifierSchema.parse(x));
  const signers = new Map<string, Account>();
  for (const ver of verifiers.filter((x) => x.active)) {
    const sk = secretFor(ver.account_id, explicit);
    if (sk) signers.set(ver.account_id, await accountWithKey(ver.account_id, sk));
  }
  const ks = keeperSecret();
  const keeper = ks ? await accountWithKey(ks.account_id, ks.private_key) : null;
  const getJob = async (id: number) => ContractJobSchema.parse(await view(v, "get_job", { job_id: id }));
  const signer = (acct: string) => signers.get(acct) ?? (() => { throw new Error(`no key for ${acct}`); })();
  const keeperCall = async (method: string, id: number) => {
    if (!keeper) throw new Error("no keeper key");
    return (await call(keeper, method, { job_id: id })).txHash;
  };
  return {
    async activeJobs() {
      const out: ContractJob[] = [];
      for (let from = 1; ; from += 50) {
        const page = (await view<unknown[]>(v, "get_jobs", { from_index: from, limit: 50 })).map((j) => ContractJobSchema.parse(j));
        out.push(...page.filter((j) => j.status === "Submitted" || j.status === "Committing" || j.status === "Stalled"));
        if (page.length < 50) break;
      }
      return out;
    },
    getJob,
    ours: () => [...signers.keys()],
    hasKeeper: () => !!keeper,
    startJudging: (id) => keeperCall("start_judging", id),
    restartJury: (id) => keeperCall("restart_jury", id),
    finalize: (id) => keeperCall("finalize", id),
    commit: async (acct, id, commitment) => (await call(signer(acct), "commit_vote", { job_id: id, commitment }, VERIFIER_GAS_TGAS)).txHash,
    reveal: async (acct, args) => (await call(signer(acct), "reveal_vote", args, VERIFIER_GAS_TGAS)).txHash,
    nowNs: () => BigInt(Date.now()) * 1_000_000n,
  };
}

async function main() {
  const db = openDb();
  const blobDir = resolve(REPO_ROOT, process.env.BLOB_DIR ?? "data/blobs");
  const chain = await liveChain();
  const providerFor = providerResolver();
  const kind = liveProviderKind() ?? "rules (no LLM key: offline juror, not attested)";
  console.log(`jury runner · ${NETWORK()} · ${CONTRACT()} · provider ${kind}`);
  console.log(`  verifiers with keys: ${chain.ours().map((v) => `${v}=${providerFor(v).model}`).join(", ") || "none"}`);
  console.log(`  keeper: ${chain.hasKeeper() ? "yes" : "NO (start/finalize/restart disabled)"} · auto-start: ${process.env.AUTO_START !== "false"}`);
  const deps = {
    db,
    blobDir,
    chain,
    providerFor,
    autoStart: process.env.AUTO_START !== "false",
    allowlist: (process.env.DELIVERABLE_URI_ALLOWLIST ?? "").split(",").map((s) => s.trim()).filter(Boolean),
    log: (m: string) => console.log(`${new Date().toISOString()} ${m.replace(/ ([1-9A-HJ-NP-Za-km-z]{43,44})$/, (_, h) => ` ${explorerTx(h)}`)}`),
  };
  const cache = new Map();
  for (;;) {
    try {
      await tick(deps, cache);
    } catch (e) {
      console.error(`tick failed: ${e instanceof Error ? e.message : e}`);
    }
    if (once) break;
    await new Promise((r) => setTimeout(r, interval));
  }
  db.$client.close();
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
