/**
 * T3.9 — deploy contracts/juri to testnet and initialise it.
 *   pnpm --filter @juri/scripts deploy [--wasm path] [--fund NEAR]
 * Build first (Docker, see docs/devlog.md): contracts/juri/res/juri.wasm.
 * Idempotent: if the contract account already has code, it only prints the state.
 * Demo params (cheap on testnet): stake 0.05 + seed 0.1 NEAR per verifier, 3-minute windows.
 */
import { ContractParamsSchema, parseNear, sha256Hex, type ContractParams } from "@juri/shared";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { balance, call, CONTRACT, explorerAccount, fileKeyStore, fmt, log, nearWith, ROOT, view } from "./lib/near.js";

const argv = process.argv.slice(2);
const opt = (name: string) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : undefined;
};
const wasmPath = resolve(import.meta.dirname, opt("wasm") ?? "../contracts/juri/res/juri.wasm");

export const DEMO_PARAMS: ContractParams = {
  fee_bps: 300,
  jury_share_bps: 8000,
  jury_size: 3,
  commit_secs: 180,
  reveal_secs: 180,
  min_stake: parseNear("0.05"),
  verifier_seed_balance: parseNear("0.1"),
  min_amount: parseNear("0.1"),
  max_criteria: 13,
  max_restarts: 1,
};

async function main() {
  const near = await nearWith(fileKeyStore());
  const root = await near.account(ROOT);
  const juri = await near.account(CONTRACT);
  const state = await juri.state();
  if (state.code_hash !== "11111111111111111111111111111111") {
    log(`${CONTRACT} already has code ${state.code_hash}; not redeploying.`);
    log("owner:", await view(juri, "get_owner"), "\nparams:", await view(juri, "get_params"));
    return;
  }

  const wasm = readFileSync(wasmPath);
  const need = BigInt(wasm.length) * 10n ** 19n + parseBig("0.5"); // code storage + 0.5 NEAR margin
  const have = await balance(juri);
  const fund = opt("fund") ? BigInt(parseNear(opt("fund")!)) : need > have ? need - have : 0n;
  log(`wasm ${wasm.length} bytes sha256 ${sha256Hex(wasm)}; ${CONTRACT} has ${fmt(have)}, needs ≈ ${fmt(need)}`);
  if (fund > 0n) {
    log(`funding ${CONTRACT} with ${fmt(fund)} from ${ROOT} (balance ${fmt(await balance(root))})`);
    await root.sendMoney(CONTRACT, fund);
  }

  const d = await juri.deployContract(wasm);
  log(`deployed: tx ${d.transaction.hash}`);
  const init = await call(juri, "new", { owner_id: ROOT, params: ContractParamsSchema.parse(DEMO_PARAMS) }, { gasTgas: 50 });
  log(`initialised: tx ${init.txHash}`);
  log("params:", await view(juri, "get_params"));
  log(`explorer: ${explorerAccount(CONTRACT)}`);
}

const parseBig = (n: string) => BigInt(parseNear(n));

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
