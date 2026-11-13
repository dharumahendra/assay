/**
 * Browser-safe NEAR helpers for the wallet flows: network config, view calls over JSON-RPC,
 * yocto math and reading a transaction's return value. No node:* imports.
 */

export const NETWORK = (process.env.NEXT_PUBLIC_NEAR_NETWORK ?? "testnet") as "testnet" | "mainnet";
export const RPC_URL = process.env.NEXT_PUBLIC_NEAR_RPC_URL ?? (NETWORK === "mainnet" ? "https://rpc.mainnet.fastnear.com" : "https://test.rpc.fastnear.com");
export const CONTRACT_ID = process.env.NEXT_PUBLIC_JURI_CONTRACT_ID || "juri.juri-assay-jdir.testnet";
export const EXPLORER = `https://${NETWORK === "mainnet" ? "" : "testnet."}nearblocks.io`;
export const txUrl = (hash: string) => `${EXPLORER}/txns/${hash}`;
export const accountUrl = (id: string) => `${EXPLORER}/address/${id}`;

/** 30 Tgas covers withdraw / cancel / reclaim; create_job writes ~1 KB of state. */
export const GAS = { create_job: 100_000_000_000_000n, default: 30_000_000_000_000n, withdraw: 50_000_000_000_000n } as const;
/** Attached on top of the escrow for create_job storage; whatever is unused stays in the escrow. */
export const STORAGE_RESERVE = 10_000_000_000_000_000_000_000n; // 0.01 NEAR

const ONE_NEAR = 10n ** 24n;
const ACCOUNT_RE = /^(?=.{2,64}$)(([a-z\d]+[-_])*[a-z\d]+\.)*([a-z\d]+[-_])*[a-z\d]+$/;
export const isAccountId = (s: string) => ACCOUNT_RE.test(s);

/** "1.25" → yocto bigint; null when not a positive decimal with ≤ 24 fraction digits. */
export function parseNear(s: string): bigint | null {
  const m = s.trim().match(/^(\d+)(?:\.(\d{0,24}))?$/);
  if (!m) return null;
  return BigInt(m[1]!) * ONE_NEAR + BigInt((m[2] ?? "").padEnd(24, "0") || "0");
}

/** yocto → "1.2500" (fixed digits, rounded down). */
export function formatNear(yocto: bigint | string | null | undefined, digits = 2): string {
  if (yocto === null || yocto === undefined) return "–";
  const y = BigInt(yocto);
  const neg = y < 0n;
  const a = neg ? -y : y;
  const whole = a / ONE_NEAR;
  const frac = ((a % ONE_NEAR) * 10n ** BigInt(digits)) / ONE_NEAR;
  return `${neg ? "−" : ""}${whole.toLocaleString("en-US")}${digits ? `.${frac.toString().padStart(digits, "0")}` : ""}`;
}

export const mulBps = (amount: bigint, bps: number) => (amount * BigInt(bps)) / 10_000n;

async function rpc<T>(method: string, params: unknown): Promise<T> {
  const res = await fetch(RPC_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: "assay-web", method, params }),
    signal: AbortSignal.timeout(10_000),
  });
  const body = (await res.json()) as { result?: T; error?: { cause?: { name?: string }; data?: unknown; message?: string } };
  if (body.error) throw new Error(`RPC ${method}: ${body.error.cause?.name ?? body.error.message ?? "error"}`);
  return body.result as T;
}

/** View call on the Assay contract. */
export async function view<T>(method: string, args: object = {}): Promise<T> {
  const r = await rpc<{ result: number[] }>("query", {
    request_type: "call_function",
    finality: "optimistic",
    account_id: CONTRACT_ID,
    method_name: method,
    args_base64: btoa(JSON.stringify(args)),
  });
  return JSON.parse(new TextDecoder().decode(new Uint8Array(r.result))) as T;
}

/** Native balance (available, i.e. amount minus locked storage is not subtracted here). */
export async function accountBalance(accountId: string): Promise<bigint | null> {
  try {
    const r = await rpc<{ amount: string }>("query", { request_type: "view_account", finality: "optimistic", account_id: accountId });
    return BigInt(r.amount);
  } catch {
    return null;
  }
}

export async function accountExists(accountId: string): Promise<boolean> {
  return (await accountBalance(accountId)) !== null;
}

export interface Outcome {
  transaction?: { hash?: string };
  transaction_outcome?: { id?: string };
  status?: { SuccessValue?: string; Failure?: unknown } | string;
}

export const outcomeHash = (o: Outcome | null | undefined) => o?.transaction?.hash ?? o?.transaction_outcome?.id ?? null;

/** Decoded JSON return value of a successful call (e.g. the job id from create_job). */
export function outcomeValue<T>(o: Outcome | null | undefined): T | null {
  const s = o?.status;
  if (!s || typeof s === "string" || !s.SuccessValue) return null;
  try {
    return JSON.parse(atob(s.SuccessValue)) as T;
  } catch {
    return null;
  }
}

/** Failure of a finished transaction, as a string the error mapper understands. */
export function outcomeFailure(o: Outcome | null | undefined): string | null {
  const s = o?.status;
  if (!s || typeof s === "string" || !s.Failure) return null;
  return JSON.stringify(s.Failure);
}

/** For wallets that redirect: look a transaction up by hash once the user is back. */
export async function txOutcome(hash: string, sender: string): Promise<Outcome> {
  return rpc<Outcome>("EXPERIMENTAL_tx_status", { tx_hash: hash, sender_account_id: sender, wait_until: "EXECUTED_OPTIMISTIC" });
}

/** Canonical JSON (keys sorted, no whitespace) — same rule as packages/shared/src/hash.ts. */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((v) => (v === undefined ? "null" : canonicalJson(v))).join(",")}]`;
  const o = value as Record<string, unknown>;
  return `{${Object.keys(o)
    .filter((k) => o[k] !== undefined)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${canonicalJson(o[k])}`)
    .join(",")}}`;
}

export async function sha256Hex(text: string): Promise<string> {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
