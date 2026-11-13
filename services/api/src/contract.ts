import { ContractJobSchema, ContractParamsSchema, ContractVerifierSchema, TotalsSchema, type ContractJob, type ContractParams, type ContractVerifier, type Totals } from "@juri/shared";
import { z } from "zod";

/** Read-only view of the Juri contract (testnet) for /protected, /verifiers, /treasury. */
export interface ContractReader {
  contractId: string;
  jobCount(): Promise<number>;
  jobs(fromIndex: number, limit: number): Promise<ContractJob[]>;
  jobsByAccount(account: string, role: "requester" | "worker"): Promise<ContractJob[]>;
  job(id: number): Promise<ContractJob | null>;
  verifiers(): Promise<ContractVerifier[]>;
  params(): Promise<ContractParams>;
  totals(): Promise<Totals>;
  treasury(): Promise<string>;
  /** Native balance in yocto; null when the account does not exist or RPC fails. */
  balance(account: string): Promise<string | null>;
}

export class RpcError extends Error {}

/** JSON-RPC client with a short TTL cache so a page load does not fan out into many RPC calls. */
export function rpcContractReader(opts: { rpcUrl: string; contractId: string; ttlMs?: number; timeoutMs?: number }): ContractReader {
  const ttl = opts.ttlMs ?? 5_000;
  const cache = new Map<string, { at: number; value: Promise<unknown> }>();
  const rpc = async (params: object): Promise<unknown> => {
    const res = await fetch(opts.rpcUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: "juri-api", method: "query", params: { finality: "final", ...params } }),
      signal: AbortSignal.timeout(opts.timeoutMs ?? 8_000),
    });
    const body = (await res.json()) as { result?: Record<string, unknown> & { result?: number[]; error?: string }; error?: { message?: string; cause?: { name?: string } } };
    if (body.error) throw new RpcError(body.error.cause?.name ?? body.error.message ?? "rpc error");
    if (!body.result || body.result.error) throw new RpcError(String(body.result?.error ?? "empty rpc result"));
    return body.result;
  };
  const cached = <T>(key: string, f: () => Promise<T>): Promise<T> => {
    const hit = cache.get(key);
    if (hit && Date.now() - hit.at < ttl) return hit.value as Promise<T>;
    const value = f().catch((e) => {
      cache.delete(key);
      throw e;
    });
    cache.set(key, { at: Date.now(), value });
    return value;
  };
  const view = <S extends z.ZodTypeAny>(method: string, args: object, schema: S): Promise<z.infer<S>> =>
    cached(`${method}:${JSON.stringify(args)}`, async () => {
      const r = (await rpc({
        request_type: "call_function",
        account_id: opts.contractId,
        method_name: method,
        args_base64: Buffer.from(JSON.stringify(args)).toString("base64"),
      })) as { result: number[] };
      return schema.parse(JSON.parse(Buffer.from(r.result).toString("utf8")));
    });

  return {
    contractId: opts.contractId,
    jobCount: () => view("get_job_count", {}, z.number().int()),
    jobs: (from_index, limit) => view("get_jobs", { from_index, limit }, z.array(ContractJobSchema)),
    jobsByAccount: (account_id, role) => view("get_jobs_by_account", { account_id, role, from_index: 0, limit: 50 }, z.array(ContractJobSchema)),
    job: (job_id) => view("get_job", { job_id }, ContractJobSchema.nullable()),
    verifiers: () => view("get_verifiers", {}, z.array(ContractVerifierSchema)),
    params: () => view("get_params", {}, ContractParamsSchema),
    totals: () => view("get_totals", {}, TotalsSchema),
    treasury: () => view("get_treasury", {}, z.string()),
    balance: (account_id) =>
      cached(`balance:${account_id}`, async () => {
        try {
          const r = (await rpc({ request_type: "view_account", account_id })) as { amount?: string };
          return r.amount ?? null;
        } catch {
          return null;
        }
      }),
  };
}
