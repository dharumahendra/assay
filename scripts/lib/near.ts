/**
 * Small NEAR helpers for repo scripts (testnet). Keys come from the near-cli legacy keychain
 * (~/.near-credentials/<network>/<account>.json), the same place P0 put them (T0.6).
 */
import { parseContractError, parseJuriEvents, type JuriEvent } from "@juri/shared";
import { Account, connect, KeyPair, keyStores, type Near } from "near-api-js";
import type { KeyPairString } from "near-api-js/lib/utils/key_pair.js";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export const NETWORK = process.env.NEAR_NETWORK ?? "testnet";
/** rpc.testnet.near.org is deprecated and rate-limits (-429); FastNEAR is the default. */
export const RPC = process.env.NEAR_RPC_URL ?? "https://test.rpc.fastnear.com";
export const ROOT = process.env.NEAR_ROOT_ACCOUNT ?? "juri-assay-jdir.testnet";
export const CONTRACT = process.env.JURI_CONTRACT_ID ?? `juri.${ROOT}`;
export const CREDS_DIR = process.env.NEAR_CREDENTIALS_DIR ?? join(homedir(), ".near-credentials");
/** Juri-specific secrets that are not account keys (e.g. the keeper FCAK) live here, outside the repo. */
export const JURI_SECRETS_DIR = join(CREDS_DIR, "juri", NETWORK);

export const TGAS = 10n ** 12n;
export const NEAR = 10n ** 24n;
export const explorerTx = (h: string) => `https://testnet.nearblocks.io/txns/${h}`;
export const explorerAccount = (a: string) => `https://testnet.nearblocks.io/address/${a}`;

export const fileKeyStore = () => new keyStores.UnencryptedFileSystemKeyStore(CREDS_DIR);

export async function nearWith(keyStore: keyStores.KeyStore): Promise<Near> {
  return connect({ networkId: NETWORK, nodeUrl: RPC, keyStore });
}

/** A connection that signs `accountId` with exactly this key (used for FCAKs). */
export async function accountWithKey(accountId: string, secretKey: string): Promise<Account> {
  const ks = new keyStores.InMemoryKeyStore();
  await ks.setKey(NETWORK, accountId, KeyPair.fromString(secretKey as KeyPairString));
  return (await nearWith(ks)).account(accountId);
}

export function readSecret(file: string): { account_id: string; public_key: string; private_key: string } {
  return JSON.parse(readFileSync(join(JURI_SECRETS_DIR, file), "utf8"));
}

export interface CallResult<T = unknown> {
  txHash: string;
  value: T;
  events: JuriEvent[];
}

/** Function call with friendly contract errors and parsed NEP-297 events. */
export async function call<T = unknown>(
  account: Account,
  methodName: string,
  args: object,
  opts: { gasTgas?: number; deposit?: bigint } = {},
): Promise<CallResult<T>> {
  try {
    const outcome = await account.functionCall({
      contractId: CONTRACT,
      methodName,
      args,
      gas: BigInt(opts.gasTgas ?? 100) * TGAS,
      attachedDeposit: opts.deposit ?? 0n,
    });
    const logs = [outcome.transaction_outcome, ...outcome.receipts_outcome].flatMap((o) => o.outcome.logs);
    const status = outcome.status as { SuccessValue?: string };
    let value: unknown = null;
    if (status.SuccessValue) {
      try {
        value = JSON.parse(Buffer.from(status.SuccessValue, "base64").toString());
      } catch {
        value = null;
      }
    }
    return { txHash: outcome.transaction.hash, value: value as T, events: parseJuriEvents(logs) };
  } catch (e) {
    const ce = parseContractError(e);
    const msg = ce ? `${ce.code} ${ce.name}: ${ce.message}` : e instanceof Error ? e.message : String(e);
    throw new Error(`${account.accountId} → ${methodName}: ${msg}`, { cause: e });
  }
}

export async function view<T>(account: Account, methodName: string, args: object = {}): Promise<T> {
  return (await account.viewFunction({ contractId: CONTRACT, methodName, args })) as T;
}

export async function balance(account: Account): Promise<bigint> {
  return BigInt((await account.getAccountBalance()).available);
}

export const fmt = (yocto: bigint | string) => `${(Number(BigInt(yocto) / 10n ** 20n) / 10_000).toFixed(4)} NEAR`;
export const log = (...a: unknown[]) => console.log(...a);
