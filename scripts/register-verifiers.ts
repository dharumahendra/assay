/**
 * T3.9 — register verifiers v1..vN (sub-account + FCAK, W6) and create the keeper FCAK.
 *   pnpm --filter @juri/scripts register-verifiers [--count 4]
 * Verifier private keys are written to the near-cli keychain (~/.near-credentials/testnet/vN.<contract>.json)
 * so the jury runner (P4) and demo scripts can sign with them. They never enter the repo.
 * Keeper FCAK: ~/.near-credentials/juri/testnet/keeper-fcak.json (methods start_judging, finalize, restart_jury).
 * Idempotent: registered verifiers and an existing keeper key are skipped.
 */
import { KEEPER_METHODS, VERIFIER_METHODS, type ContractParams, type ContractVerifier } from "@juri/shared";
import { KeyPair } from "near-api-js";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { call, CONTRACT, explorerAccount, fileKeyStore, JURI_SECRETS_DIR, log, NEAR, nearWith, NETWORK, ROOT, view } from "./lib/near.js";

const argv = process.argv.slice(2);
const count = Number(argv[argv.indexOf("--count") + 1] ?? 4) || 4;
const KEEPER = process.env.KEEPER_ACCOUNT_ID ?? `keeper.${ROOT}`;
/** Model labels only; the runner config (VERIFIER_MODELS_JSON) decides the real provider/model in P4. */
const MODELS = (process.env.VERIFIER_MODEL_LABELS ?? "nearai:deepseek-v3.1,nearai:qwen3,nearai:glm-4.6,openai_compat:gpt-oss-120b").split(",");

async function main() {
  const ks = fileKeyStore();
  const near = await nearWith(ks);
  const owner = await near.account(ROOT);
  const params = await view<ContractParams>(owner, "get_params");
  const deposit = BigInt(params.min_stake) + BigInt(params.verifier_seed_balance);
  const existing = new Set((await view<ContractVerifier[]>(owner, "get_verifiers")).map((v) => v.account_id));

  for (let i = 1; i <= count; i++) {
    const name = `v${i}`;
    const id = `${name}.${CONTRACT}`;
    if (existing.has(id)) {
      log(`${id}: already registered`);
      continue;
    }
    let kp = await ks.getKey(NETWORK, id);
    if (!kp) {
      kp = KeyPair.fromRandom("ed25519");
      await ks.setKey(NETWORK, id, kp); // saved before the tx so a lost response never strands the key
    }
    const r = await call<boolean>(
      owner,
      "register_verifier",
      { name, public_key: kp.getPublicKey().toString(), payout_account: ROOT, model_label: MODELS[(i - 1) % MODELS.length] },
      { gasTgas: 100, deposit },
    );
    log(`${id}: ${r.value ? "registered" : "FAILED (deposit credited to owner)"} tx ${r.txHash}`);
  }

  // keeper FCAK (03 §6): only start_judging / finalize / restart_jury on the Juri contract
  const keeperFile = join(JURI_SECRETS_DIR, "keeper-fcak.json");
  if (existsSync(keeperFile)) {
    log(`keeper FCAK: exists (${keeperFile})`);
  } else {
    const keeper = await near.account(KEEPER);
    const kp = KeyPair.fromRandom("ed25519");
    await keeper.addKey(kp.getPublicKey(), CONTRACT, [...KEEPER_METHODS], NEAR / 4n);
    mkdirSync(JURI_SECRETS_DIR, { recursive: true });
    writeFileSync(
      keeperFile,
      JSON.stringify({ account_id: KEEPER, public_key: kp.getPublicKey().toString(), private_key: kp.toString() }, null, 2),
      { mode: 0o600 },
    );
    log(`keeper FCAK: added to ${KEEPER} (${kp.getPublicKey().toString()}), secret in ${keeperFile}`);
  }

  const vs = await view<ContractVerifier[]>(owner, "get_verifiers");
  for (const v of vs) {
    const keys = await (await near.account(v.account_id)).getAccessKeys();
    const desc = keys.map((k) => {
      const p = k.access_key.permission;
      return p === "FullAccess" ? "FULL ACCESS (!)" : `FunctionCall ${p.FunctionCall.receiver_id} [${p.FunctionCall.method_names.join(",")}]`;
    });
    log(`${v.account_id} model=${v.model_label} active=${v.active} keys: ${desc.join("; ")} ${explorerAccount(v.account_id)}`);
    if (desc.length !== 1 || !desc[0]!.includes(VERIFIER_METHODS.join(","))) throw new Error(`${v.account_id}: unexpected access keys`);
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
