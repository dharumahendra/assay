import { parseContractError, parseJuriEvents, type JuriEvent } from "@juri/shared";
import { Account, connect, KeyPair, keyStores } from "near-api-js";
import type { KeyPairString } from "near-api-js/lib/utils/key_pair.js";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

/** NEAR access for the jury runner (testnet). Same conventions as scripts/lib/near.ts (P3). */
export const NETWORK = () => process.env.NEAR_NETWORK ?? "testnet";
export const RPC = () => process.env.NEAR_RPC_URL ?? "https://test.rpc.fastnear.com";
export const ROOT = () => process.env.NEAR_ROOT_ACCOUNT ?? "juri-assay-jdir.testnet";
export const CONTRACT = () => process.env.JURI_CONTRACT_ID ?? `juri.${ROOT()}`;
export const CREDS_DIR = () => process.env.NEAR_CREDENTIALS_DIR ?? join(homedir(), ".near-credentials");
export const TGAS = 10n ** 12n;
export const explorerTx = (h: string) => `https://${NETWORK() === "mainnet" ? "" : "testnet."}nearblocks.io/txns/${h}`;

export async function accountWithKey(accountId: string, secretKey: string): Promise<Account> {
  const ks = new keyStores.InMemoryKeyStore();
  await ks.setKey(NETWORK(), accountId, KeyPair.fromString(secretKey as KeyPairString));
  const near = await connect({ networkId: NETWORK(), nodeUrl: RPC(), keyStore: ks });
  return near.account(accountId);
}

/** Read-only account for views. */
export async function viewer(): Promise<Account> {
  const near = await connect({ networkId: NETWORK(), nodeUrl: RPC(), keyStore: new keyStores.InMemoryKeyStore() });
  return near.account(CONTRACT());
}

/** Secret key for `accountId`: explicit map (VERIFIER_KEYS_JSON) → near-cli keychain file. */
export function secretFor(accountId: string, explicit: Record<string, string> = {}): string | null {
  if (explicit[accountId]) return explicit[accountId]!;
  const f = join(CREDS_DIR(), NETWORK(), `${accountId}.json`);
  if (!existsSync(f)) return null;
  return (JSON.parse(readFileSync(f, "utf8")) as { private_key: string }).private_key;
}

/** Keeper FCAK: KEEPER_KEY env (+ KEEPER_ACCOUNT_ID) or ~/.near-credentials/juri/<network>/keeper-fcak.json. */
export function keeperSecret(): { account_id: string; private_key: string } | null {
  if (process.env.KEEPER_KEY) return { account_id: process.env.KEEPER_ACCOUNT_ID ?? `keeper.${ROOT()}`, private_key: process.env.KEEPER_KEY };
  const f = join(CREDS_DIR(), "juri", NETWORK(), "keeper-fcak.json");
  return existsSync(f) ? (JSON.parse(readFileSync(f, "utf8")) as { account_id: string; private_key: string }) : null;
}

export interface CallResult<T = unknown> {
  txHash: string;
  value: T;
  events: JuriEvent[];
}

export async function call<T = unknown>(account: Account, methodName: string, args: object, gasTgas = 100, deposit = 0n): Promise<CallResult<T>> {
  try {
    const o = await account.functionCall({ contractId: CONTRACT(), methodName, args, gas: BigInt(gasTgas) * TGAS, attachedDeposit: deposit });
    const logs = [o.transaction_outcome, ...o.receipts_outcome].flatMap((x) => x.outcome.logs);
    const s = o.status as { SuccessValue?: string };
    let value: unknown = null;
    if (s.SuccessValue) {
      try {
        value = JSON.parse(Buffer.from(s.SuccessValue, "base64").toString());
      } catch {
        value = null;
      }
    }
    return { txHash: o.transaction.hash, value: value as T, events: parseJuriEvents(logs) };
  } catch (e) {
    const ce = parseContractError(e);
    const msg = ce ? `${ce.code} ${ce.name}` : e instanceof Error ? e.message : String(e);
    throw new Error(`${account.accountId} → ${methodName}: ${msg}`, { cause: e });
  }
}

export async function view<T>(account: Account, methodName: string, args: object = {}): Promise<T> {
  return (await account.viewFunction({ contractId: CONTRACT(), methodName, args })) as T;
}
