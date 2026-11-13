/**
 * Read-only view calls on the Juri contract over JSON-RPC (no wallet). Server-side only.
 * Failures return null so a page still renders when testnet RPC is slow or down.
 */
import { ContractJobSchema, ContractParamsSchema, ContractVerifierSchema, TotalsSchema } from "@juri/shared";
import { z } from "zod";

export const NEAR_NETWORK = process.env.NEAR_NETWORK ?? "testnet";
export const RPC_URL = process.env.NEAR_RPC_URL ?? "https://test.rpc.fastnear.com";
export const CONTRACT_ID = process.env.JURI_CONTRACT_ID || "juri.juri-assay-jdir.testnet";
export const explorerAccountUrl = (account: string) =>
  `https://${NEAR_NETWORK === "mainnet" ? "" : "testnet."}nearblocks.io/address/${account}`;

export async function view<S extends z.ZodTypeAny>(method: string, args: object, schema: S): Promise<z.infer<S> | null> {
  try {
    const res = await fetch(RPC_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: "juri-web",
        method: "query",
        params: {
          request_type: "call_function",
          finality: "final",
          account_id: CONTRACT_ID,
          method_name: method,
          args_base64: Buffer.from(JSON.stringify(args)).toString("base64"),
        },
      }),
      next: { revalidate: 30 },
      signal: AbortSignal.timeout(6000),
    });
    const body = (await res.json()) as { result?: { result?: number[] } };
    const bytes = body.result?.result;
    if (!bytes) return null;
    const parsed = schema.safeParse(JSON.parse(Buffer.from(bytes).toString("utf8")));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export const contractTotals = () => view("get_totals", {}, TotalsSchema);
export const contractParams = () => view("get_params", {}, ContractParamsSchema);
export const contractVerifiers = () => view("get_verifiers", {}, z.array(ContractVerifierSchema));
export const contractTreasury = () => view("get_treasury", {}, z.string());
/** Newest first; the contract pages ascending from id 1, max 50 per call. */
export async function contractJobs(limit = 50) {
  const n = await view("get_job_count", {}, z.number());
  if (n === null) return null;
  const from = Math.max(1, n - limit + 1);
  const jobs = await view("get_jobs", { from_index: from, limit }, z.array(ContractJobSchema));
  return jobs ? [...jobs].reverse() : null;
}

/** Contract nanosecond U64 string → ISO time. */
export const nsToIso = (ns: string) => new Date(Number(BigInt(ns) / 1_000_000n)).toISOString();
export const explorerTxUrl = (hash: string) => `https://${NEAR_NETWORK === "mainnet" ? "" : "testnet."}nearblocks.io/txns/${hash}`;
