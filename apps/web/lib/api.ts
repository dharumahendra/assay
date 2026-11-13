/**
 * Typed client for the Assay read API (freeze #1, packages/shared/src/api.ts). Server-side only:
 * pages are server components that call these and pass plain data down. Browser code uses
 * relative /api/* URLs (proxied by next.config rewrites) and `import type` only.
 */
import {
  AgentDetailSchema,
  AgentsResponseSchema,
  ErrorBodySchema,
  HealthSchema,
  InsightsResponseSchema,
  JobDetailSchema,
  JobsResponseSchema,
  MetaSchema,
  PatternDetailSchema,
  PatternsResponseSchema,
  ProtectedListResponseSchema,
  TreasuryResponseSchema,
  VerifiersResponseSchema,
  type MetricWindow,
} from "@juri/shared";
import { notFound } from "next/navigation";
import type { z } from "zod";

export const API_URL = process.env.API_URL ?? "http://localhost:8787";

export class ApiFailure extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

function qs(params: Record<string, string | number | undefined | null>): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== "") p.set(k, String(v));
  const s = p.toString();
  return s ? `?${s}` : "";
}

async function get<S extends z.ZodTypeAny>(path: string, schema: S, opts: { notFoundIs404?: boolean } = {}): Promise<z.infer<S>> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, { cache: "no-store" });
  } catch {
    throw new ApiFailure(0, "unreachable", `The Assay API at ${API_URL} is not reachable. Start it with \`pnpm api\`.`);
  }
  if (res.status === 404 && opts.notFoundIs404) notFound();
  if (!res.ok) {
    const body = ErrorBodySchema.safeParse(await res.json().catch(() => null));
    throw new ApiFailure(res.status, body.success ? body.data.error.code : `http_${res.status}`, body.success ? body.data.error.message : res.statusText);
  }
  return schema.parse(await res.json());
}

export const api = {
  health: () => get("/api/health", HealthSchema),
  meta: () => get("/api/meta", MetaSchema),
  insights: (window: MetricWindow = "all") => get(`/api/insights${qs({ window })}`, InsightsResponseSchema),
  jobs: (p: { q?: string; status?: string; tag?: string; cursor?: string; limit?: number } = {}) =>
    get(`/api/jobs${qs(p)}`, JobsResponseSchema),
  job: (id: string) => get(`/api/jobs/${encodeURIComponent(id)}`, JobDetailSchema, { notFoundIs404: true }),
  agents: (p: { q?: string; sort?: "score" | "delivered" | "handle"; cursor?: string; limit?: number } = {}) =>
    get(`/api/agents${qs(p)}`, AgentsResponseSchema),
  agent: (id: string) => get(`/api/agents/${encodeURIComponent(id)}`, AgentDetailSchema, { notFoundIs404: true }),
  patterns: () => get("/api/patterns", PatternsResponseSchema),
  pattern: (id: string) => get(`/api/patterns/${encodeURIComponent(id)}`, PatternDetailSchema, { notFoundIs404: true }),
  // Contract-backed reads (testnet RPC behind a short cache): 502 rpc_error / 503 no_contract are expected states.
  protectedJobs: (p: { limit?: number; cursor?: string; account?: string; role?: "requester" | "worker" } = {}) =>
    get(`/api/protected${qs(p)}`, ProtectedListResponseSchema),
  verifiers: () => get("/api/verifiers", VerifiersResponseSchema),
  treasury: () => get("/api/treasury", TreasuryResponseSchema),
};

/** For contract-backed reads: resolve to the data, or to the failure so the page can show an error state. */
export async function attempt<T>(p: Promise<T>): Promise<{ ok: true; data: T } | { ok: false; error: ApiFailure }> {
  try {
    return { ok: true, data: await p };
  } catch (e) {
    return { ok: false, error: e instanceof ApiFailure ? e : new ApiFailure(0, "unknown", String(e)) };
  }
}

export function failureText(e: ApiFailure): string {
  if (e.code === "rpc_error") return "NEAR testnet RPC did not answer. Retry in a moment.";
  if (e.code === "no_contract") return "The API has no Assay contract configured (JURI_CONTRACT_ID).";
  return e.message;
}
