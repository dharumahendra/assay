import { canonicalHash, ContractJobSchema, CriteriaDocSchema, criteriaKinds, formatNear, parseNear, sha256Hex, type ContractJob } from "@juri/shared";
import { KeyPair, type Account } from "near-api-js";
import { DEFAULT_ACCOUNT_ID, DEFAULT_PRIVATE_KEY, Sandbox } from "near-sandbox";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { putBlob } from "./blobs.js";
import { openDb, REPO_ROOT } from "./db/index.js";
import { replayProvider, type ReplayCase } from "./e2e-replay.js";
import { tick, VERIFIER_GAS_TGAS, type Chain } from "./jury-runner.js";
import { accountWithKey, call, view } from "./near.js";

/**
 * pnpm e2e — the Protected Job lifecycle on a local NEAR sandbox with RECORDED jurors (T7.1, NFR-REPRO-1).
 * No LLM key, no testnet, no .env:
 *   sandbox → deploy contracts/juri/res/juri.wasm → register 3 verifiers (FCAKs) → for two eval cases
 *   (good report, injected report): create_job → submit_deliverable → the real jury runner `tick()`
 *   (start_judging → judge → commit → reveal → finalize) → assert Released / Refunded → withdraw.
 * Jurors replay eval/recorded/ (see e2e-replay.ts: only the juror id and delimiter nonce are remapped).
 * Needs Linux or macOS (near-sandbox ships no Windows binary) and the contract wasm:
 *   cd contracts/juri && cargo near build non-reproducible-wasm && mkdir -p res && cp target/near/juri.wasm res/
 */

const CASES = ["j1-economics-V1", "j1-economics-V5"];
const EVAL = join(REPO_ROOT, "eval");
const TIMEOUT_MS = Number(process.env.E2E_TIMEOUT_MS ?? 180_000);
const NEAR = (n: string) => BigInt(parseNear(n));

function wasmPath(): string {
  const c = [process.env.E2E_WASM, join(REPO_ROOT, "contracts/juri/res/juri.wasm"), join(REPO_ROOT, "contracts/juri/target/near/juri.wasm")];
  const f = c.find((p): p is string => !!p && existsSync(p));
  if (!f) throw new Error("contracts/juri/res/juri.wasm not found. Build it: cd contracts/juri && cargo near build non-reproducible-wasm && mkdir -p res && cp target/near/juri.wasm res/");
  return f;
}

function loadCase(id: string) {
  const dir = join(EVAL, "cases", id);
  const job = JSON.parse(readFileSync(join(dir, "job.json"), "utf8")) as { title: string; expected: { name: string; outcome: "Released" | "Refunded"; injection: boolean } };
  return {
    id,
    job,
    doc: CriteriaDocSchema.parse(JSON.parse(readFileSync(join(dir, "criteria.json"), "utf8"))),
    deliverable: readFileSync(join(dir, "deliverable.md"), "utf8"),
  };
}

async function main() {
  if (process.platform === "win32" && !process.env.E2E_FORCE) {
    console.error("pnpm e2e needs Linux or macOS: near-sandbox has no Windows binary. Run it in CI (job `e2e`), WSL or Docker.");
    process.exit(2);
  }
  const wasm = readFileSync(wasmPath());
  const cases = CASES.map(loadCase);
  const blobDir = mkdtempSync(join(tmpdir(), "juri-e2e-"));
  const db = openDb(":memory:");
  const t0 = Date.now();
  console.log("starting near-sandbox …");
  const sb = await Sandbox.start({});
  try {
    process.env.NEAR_NETWORK = "sandbox";
    process.env.NEAR_RPC_URL = sb.rpcUrl;
    process.env.JURI_CONTRACT_ID = `juri.${DEFAULT_ACCOUNT_ID}`;
    console.log(`sandbox at ${sb.rpcUrl}`);

    const root = await accountWithKey(DEFAULT_ACCOUNT_ID, DEFAULT_PRIVATE_KEY);
    const make = async (name: string, amount: string): Promise<Account> => {
      const id = `${name}.${DEFAULT_ACCOUNT_ID}`;
      const kp = KeyPair.fromRandom("ed25519");
      await root.createAccount(id, kp.getPublicKey(), NEAR(amount));
      return accountWithKey(id, kp.toString());
    };
    const juri = await make("juri", "20");
    const owner = await make("owner", "10");
    const requester = await make("requester", "10");
    const worker = await make("worker", "2");
    const payout = await make("payout", "1");

    await juri.deployContract(new Uint8Array(wasm));
    const params = {
      fee_bps: 300,
      jury_share_bps: 8000,
      jury_size: 3,
      commit_secs: 60,
      reveal_secs: 60,
      min_stake: parseNear("0.05"),
      verifier_seed_balance: parseNear("0.1"),
      min_amount: parseNear("0.1"),
      max_criteria: 13,
      max_restarts: 1,
    };
    await call(juri, "new", { owner_id: owner.accountId, params }, 50);
    console.log(`deployed ${juri.accountId} (${(wasm.length / 1024).toFixed(0)} KiB)`);

    // Exactly jury_size verifiers, so every one sits on every jury and maps 1:1 to a recording (v1, v2, v3).
    const recordedDir = join(EVAL, "recorded");
    const replayCases: ReplayCase[] = cases.map((c) => ({ id: c.id, deliverable: c.deliverable }));
    const signers = new Map<string, Account>();
    for (const name of ["v1", "v2", "v3"]) {
      const kp = KeyPair.fromRandom("ed25519");
      const id = `${name}.${juri.accountId}`;
      const model = replayProvider(recordedDir, replayCases, id).model;
      const r = await call<boolean>(
        owner,
        "register_verifier",
        { name, public_key: kp.getPublicKey().toString(), payout_account: payout.accountId, model_label: `recorded:${model}` },
        100,
        BigInt(params.min_stake) + BigInt(params.verifier_seed_balance),
      );
      if (r.value !== true) throw new Error(`register_verifier ${name} failed`);
      signers.set(id, await accountWithKey(id, kp.toString()));
      console.log(`registered ${id} (FCAK) model ${model}`);
    }

    // jobs: criteria + deliverable in the local blob store, hashes on-chain
    const jobs: { id: number; c: (typeof cases)[number] }[] = [];
    for (const c of cases) {
      const crit = putBlob(db, blobDir, "criteria", c.doc);
      if (crit.sha256 !== canonicalHash(c.doc)) throw new Error("criteria blob hash ≠ canonical hash");
      const del = putBlob(db, blobDir, "deliverable", c.deliverable);
      if (del.sha256 !== sha256Hex(c.deliverable)) throw new Error("deliverable blob hash ≠ sha256");
      const created = await call<number>(
        requester,
        "create_job",
        {
          worker: worker.accountId,
          criteria_hash: crit.sha256,
          criteria_uri: `juri://e2e/criteria/${crit.sha256}`,
          criteria_kinds: criteriaKinds(c.doc),
          submit_deadline_secs: 3600,
          market_job_id: null,
          payout_mode: "Binary",
        },
        30,
        NEAR("0.2"),
      );
      const id = created.value;
      await call(worker, "submit_deliverable", { job_id: id, deliverable_hash: del.sha256, deliverable_uri: `juri://e2e/deliverable/${del.sha256}` });
      jobs.push({ id, c });
      console.log(`job #${id} ${c.id} (${c.job.expected.name}, expect ${c.job.expected.outcome}): created + submitted`);
    }

    // the real runner loop; the requester doubles as keeper (start_judging / finalize are permissionless)
    const getJob = async (id: number) => ContractJobSchema.parse(await view(juri, "get_job", { job_id: id }));
    const signer = (acct: string) => signers.get(acct) ?? (() => { throw new Error(`no key for ${acct}`); })();
    const chain: Chain = {
      async activeJobs() {
        const page = (await view<unknown[]>(juri, "get_jobs", { from_index: 1, limit: 50 })).map((j) => ContractJobSchema.parse(j));
        return page.filter((j) => j.status === "Submitted" || j.status === "Committing" || j.status === "Stalled");
      },
      getJob,
      ours: () => [...signers.keys()],
      hasKeeper: () => true,
      startJudging: async (id) => (await call(requester, "start_judging", { job_id: id })).txHash,
      restartJury: async (id) => (await call(requester, "restart_jury", { job_id: id })).txHash,
      finalize: async (id) => (await call(requester, "finalize", { job_id: id })).txHash,
      commit: async (acct, id, commitment) => (await call(signer(acct), "commit_vote", { job_id: id, commitment }, VERIFIER_GAS_TGAS)).txHash,
      reveal: async (acct, args) => (await call(signer(acct), "reveal_vote", args, VERIFIER_GAS_TGAS)).txHash,
      nowNs: () => BigInt(Date.now()) * 1_000_000n,
    };
    const deps = {
      db,
      blobDir,
      chain,
      providerFor: (v: string) => replayProvider(recordedDir, replayCases, v),
      autoStart: true,
      allowlist: [],
      log: (m: string) => console.log(`  runner ${m}`),
    };
    const cache = new Map();
    const settled = new Map<number, ContractJob>();
    const deadline = Date.now() + TIMEOUT_MS;
    while (settled.size < jobs.length) {
      if (Date.now() > deadline) throw new Error(`timeout: ${jobs.length - settled.size} job(s) not settled after ${TIMEOUT_MS} ms`);
      const rep = await tick(deps, cache);
      if (rep.errors.length) throw new Error(`runner errors: ${rep.errors.join(" | ")}`);
      for (const { id } of jobs) {
        const j = await getJob(id);
        if (j.status === "Settled") settled.set(id, j);
      }
      if (settled.size < jobs.length) await new Promise((r) => setTimeout(r, 1000));
    }

    // assertions + withdrawals
    let failed = 0;
    const claimable = async (who: string) => BigInt(await view<string>(juri, "get_claimable", { account_id: who }));
    for (const { id, c } of jobs) {
      const j = settled.get(id)!;
      const ok = j.outcome === c.job.expected.outcome;
      if (!ok) failed++;
      console.log(`job #${id} ${c.id}: ${j.outcome} (expected ${c.job.expected.outcome}) ${ok ? "OK" : "FAIL"}`);
      for (const r of j.reveals) console.log(`  ${r.verifier.split(".")[0]} [${r.verdicts}] inj=${r.injection_flag} model=${r.model}`);
      const inj = j.reveals.some((r) => r.injection_flag);
      if (inj !== c.job.expected.injection) {
        failed++;
        console.log(`  FAIL injection flag ${inj}, expected ${c.job.expected.injection}`);
      }
    }
    for (const who of [worker, requester]) {
      const due = await claimable(who.accountId);
      if (due === 0n) continue;
      await call(who, "withdraw", {}, 30);
      const left = await claimable(who.accountId);
      console.log(`withdraw ${who.accountId}: ${formatNear(due.toString())} NEAR → claimable now ${formatNear(left.toString())}`);
      if (left !== 0n) failed++;
    }
    for (const [id, acct] of signers) {
      const due = await claimable(id);
      if (due === 0n) continue;
      await call(acct, "withdraw", {}, VERIFIER_GAS_TGAS);
      const left = await claimable(id);
      console.log(`withdraw ${id} (FCAK) → ${payout.accountId}: ${formatNear(due.toString(), 6)} NEAR, claimable now ${formatNear(left.toString())}`);
      if (left !== 0n) failed++;
    }
    if ((await claimable(worker.accountId)) !== 0n || (await claimable(requester.accountId)) !== 0n) failed++;

    console.log(`\ne2e ${failed ? `FAILED (${failed} check(s))` : "passed"} in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
    if (failed) process.exitCode = 1;
  } finally {
    db.$client.close();
    await sb.tearDown().catch(() => {});
    rmSync(blobDir, { recursive: true, force: true });
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? (e.stack ?? e.message) : e);
  process.exit(1);
});
