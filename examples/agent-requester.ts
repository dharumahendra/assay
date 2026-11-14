/**
 * Example requester agent (FR-H3): screens a market job's bids, compiles acceptance criteria, opens a Protected Job
 * on the Assay contract with its own testnet key, and follows the jury verdict. Standalone on purpose: it uses only
 * the public HTTP API (see GET /skill.md) and near-api-js, no Assay packages.
 *
 *   ASSAY_API=https://<api host>                      (default http://localhost:8787)
 *   REQUESTER_ACCOUNT_ID=me.testnet REQUESTER_PRIVATE_KEY=ed25519:...   (or a near-cli key in ~/.near-credentials)
 *   pnpm --filter @juri/examples agent-requester -- --worker someone.testnet --text "Write a 300-word ..." [options]
 *
 * Options
 *   --market-job <uuid>   screen this market job's bids and compile criteria from it (instead of --text)
 *   --criteria <file>     use this CriteriaDoc JSON instead of POST /api/criteria/compile (no LLM key needed)
 *   --amount <NEAR>       escrow to lock (default 0.12)
 *   --deadline <secs>     submit deadline (default 86400)
 *   --dry-run             stop before any transaction
 *   --wait                poll until Settled, then withdraw whatever the requester is owed
 *
 * Testnet only. The key never leaves this process; nothing is written to disk.
 */
import { Account, connect, KeyPair, keyStores } from "near-api-js";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const argv = process.argv.slice(2);
const opt = (n: string) => (argv.includes(`--${n}`) ? argv[argv.indexOf(`--${n}`) + 1] : undefined);
const flag = (n: string) => argv.includes(`--${n}`);

const API = (process.env.ASSAY_API ?? "http://localhost:8787").replace(/\/$/, "") + "/api";
const YOCTO = 10n ** 24n;
const toYocto = (near: string) => {
  const [w, f = ""] = near.split(".");
  return BigInt(w || "0") * YOCTO + BigInt((f + "0".repeat(24)).slice(0, 24));
};
const fmt = (yocto: string | bigint) => (Number(BigInt(yocto) / 10n ** 20n) / 10_000).toFixed(4);

async function http<T>(method: "GET" | "POST", path: string, body?: unknown): Promise<{ data: T; headers: Headers }> {
  const r = await fetch(API + path, { method, headers: body ? { "content-type": "application/json" } : {}, body: body ? JSON.stringify(body) : undefined });
  const text = await r.text();
  if (!r.ok) throw new Error(`${method} ${path} → ${r.status} ${text.slice(0, 300)}`);
  return { data: JSON.parse(text) as T, headers: r.headers };
}

interface Criterion { id: string; text: string; kind: "MUST" | "SHOULD"; method: string }
interface CriteriaDoc { version: "1"; criteria: Criterion[] }
interface Meta { network: string; contract_id: string | null; mode: string }

async function main() {
  const worker = opt("worker");
  const marketJob = opt("market-job");
  const text = opt("text");
  if (!worker || (!marketJob && !text && !opt("criteria"))) {
    console.error("usage: agent-requester --worker <account> (--text <description> | --market-job <uuid> | --criteria <file>) [--amount 0.12] [--wait] [--dry-run]");
    process.exit(2);
  }

  const meta = (await http<Meta>("GET", "/meta")).data;
  if (!meta.contract_id) throw new Error("this Assay API has no contract configured");
  if (meta.network === "mainnet") throw new Error("this example is for testnet only");
  console.log(`Assay ${API} · ${meta.network} · contract ${meta.contract_id}`);

  // 1. screen bids (FR-H2 §1)
  if (marketJob) {
    type Bid = { agent: { handle: string | null }; amount: string | null; trust: { score: number | null; band: string }; patterns: string[] };
    const { data } = await http<{ job: { title: string }; bids: Bid[] }>("GET", `/jobs/${marketJob}`);
    console.log(`\n1. bids on "${data.job.title}"`);
    if (!data.bids.length) console.log("   no bids visible (bids are private to the job's creator on market.near.ai)");
    for (const b of data.bids)
      console.log(`   @${b.agent.handle ?? "?"}  ${b.amount ?? "?"}  trust ${b.trust.score ?? "–"} (${b.trust.band})${b.patterns.length ? `  ⚠ co-bidding pattern ${b.patterns.join(",")}` : ""}`);
  }

  // 2. criteria: compile (needs an LLM key on the API) or load a file
  let doc: CriteriaDoc;
  const file = opt("criteria");
  if (file) {
    doc = JSON.parse(readFileSync(file, "utf8")) as CriteriaDoc;
  } else {
    console.log("\n2. compiling criteria (this can take up to a minute) …");
    doc = (await http<CriteriaDoc>("POST", "/criteria/compile", marketJob ? { market_job_id: marketJob, ...(text ? { text } : {}) } : { text })).data;
  }
  for (const c of doc.criteria) console.log(`   ${c.id} ${c.kind.padEnd(6)} ${c.method === "deterministic" ? "[rule]" : "[jury]"} ${c.text}`);
  const blob = (await http<{ sha256: string; uri: string }>("POST", "/blobs", { kind: "criteria", content: doc })).data;
  await verifyBlob(blob.sha256);
  console.log(`   stored and re-hashed: ${blob.uri}`);

  const args = {
    worker,
    criteria_hash: blob.sha256,
    criteria_uri: blob.uri,
    criteria_kinds: doc.criteria.map((c) => (c.kind === "MUST" ? 0 : 1)),
    submit_deadline_secs: Number(opt("deadline") ?? 86_400),
    market_job_id: marketJob ?? null,
    payout_mode: "Binary",
  };
  const amount = toYocto(opt("amount") ?? "0.12");
  console.log(`\n3. create_job on ${meta.contract_id} with ${fmt(amount)} NEAR:\n${JSON.stringify(args, null, 2)}`);
  if (flag("dry-run")) return console.log("\n--dry-run: stopping before the transaction");

  // 3. sign with the requester's own key
  const requester = await signer(meta.network);
  const out = await requester.functionCall({ contractId: meta.contract_id, methodName: "create_job", args, gas: 30n * 10n ** 12n, attachedDeposit: amount });
  const s = out.status as { SuccessValue?: string };
  const jobId = Number(JSON.parse(Buffer.from(s.SuccessValue ?? "", "base64").toString() || "null"));
  console.log(`   job #${jobId} · tx https://testnet.nearblocks.io/txns/${out.transaction.hash}`);
  console.log(`   the worker submits with: POST ${API}/blobs {kind:"deliverable"} → submit_deliverable({ job_id: ${jobId}, deliverable_hash, deliverable_uri })`);

  if (!flag("wait")) return;

  // 4. follow the verdict (FR-H2 §5)
  console.log("\n4. waiting for the deliverable and the jury …");
  type Detail = { job: { status: string; outcome: string | null; criteria_result: number[] } };
  let last = "";
  for (;;) {
    const { job } = (await http<Detail>("GET", `/protected/${jobId}`)).data;
    if (job.status !== last) console.log(`   ${new Date().toISOString()} ${(last = job.status)}`);
    if (["Settled", "Cancelled", "Expired"].includes(job.status)) {
      if (job.outcome) console.log(`   outcome ${job.outcome} · per criterion [${job.criteria_result}] (0 FAIL, 1 PASS, 2 UNSURE)`);
      break;
    }
    await new Promise((r) => setTimeout(r, 10_000));
  }
  const owed = (await requester.viewFunction({ contractId: meta.contract_id, methodName: "get_claimable", args: { account_id: requester.accountId } })) as string;
  if (BigInt(owed) > 0n) {
    const w = await requester.functionCall({ contractId: meta.contract_id, methodName: "withdraw", args: {}, gas: 30n * 10n ** 12n });
    console.log(`   withdrew ${fmt(owed)} NEAR · tx https://testnet.nearblocks.io/txns/${w.transaction.hash}`);
  } else console.log("   nothing for the requester to withdraw (the worker was paid)");
}

async function signer(network: string): Promise<Account> {
  const id = process.env.REQUESTER_ACCOUNT_ID;
  if (!id) throw new Error("set REQUESTER_ACCOUNT_ID (and REQUESTER_PRIVATE_KEY, or log in with near-cli)");
  let key = process.env.REQUESTER_PRIVATE_KEY;
  const f = join(homedir(), ".near-credentials", network, `${id}.json`);
  if (!key && existsSync(f)) key = (JSON.parse(readFileSync(f, "utf8")) as { private_key: string }).private_key;
  if (!key) throw new Error(`no key for ${id}: set REQUESTER_PRIVATE_KEY or add ${f}`);
  const ks = new keyStores.InMemoryKeyStore();
  await ks.setKey(network, id, KeyPair.fromString(key as Parameters<typeof KeyPair.fromString>[0]));
  const near = await connect({ networkId: network, nodeUrl: process.env.NEAR_RPC_URL ?? "https://test.rpc.fastnear.com", keyStore: ks });
  return near.account(id);
}

/** The hash that goes on-chain must be the hash of the bytes the jury will read: re-download and check. */
async function verifyBlob(sha: string) {
  const r = await fetch(`${API}/blobs/${sha}`);
  const got = createHash("sha256").update(Buffer.from(await r.arrayBuffer())).digest("hex");
  if (got !== sha) throw new Error(`blob ${sha} does not match its hash (${got})`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
