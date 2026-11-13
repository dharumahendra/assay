import { canonicalHash, canonicalJson, sha256Hex, type CriteriaDoc, type Fact, type Prescan } from "@juri/shared";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

/**
 * Provider abstraction (05 §7.6). `nearai` and `openai_compat` speak the OpenAI chat-completions API over
 * fetch (no SDK); `recorded` replays eval/recorded/<case>/<verifier>.json after checking its sha256;
 * `rules` is a deterministic offline juror (no LLM) used when no key is configured — it is never attested
 * and answers UNSURE for anything an LLM would have to judge.
 */

export interface Usage {
  prompt_tokens: number;
  completion_tokens: number;
}

export interface CompletionRequest {
  system: string;
  user: string;
  jsonSchema: object;
  maxTokens: number;
  temperature: number;
  /** Structured view of the same request, for providers that do not read prose (rules). */
  context?: { criteria: CriteriaDoc["criteria"]; facts: Record<string, Fact>; prescan: Prescan };
  /**
   * "low" asks reasoning models to think briefly (reasoning_effort=low + enable_thinking=false; both were
   * accepted by every NEAR AI model in a 2026-11-13 probe). Default: the model's own setting.
   */
  reasoning?: "low";
}

export interface CompletionResult {
  text: string;
  chatId?: string;
  usage?: Usage;
}

export interface AttestationReport {
  raw: unknown;
  signing_address: string;
  signing_algo: string;
}

export interface SignatureProof {
  text: string;
  signature: string;
  signing_address: string;
  signing_algo: string;
}

export type ProviderId = "nearai" | "openai_compat" | "recorded" | "rules";

export interface JudgeProvider {
  id: ProviderId;
  model: string;
  attested: boolean;
  complete(req: CompletionRequest): Promise<CompletionResult>;
  attest?(nonce: string): Promise<AttestationReport>;
  signature?(chatId: string): Promise<SignatureProof>;
}

export class ProviderError extends Error {
  constructor(
    readonly code: "no_key" | "http" | "timeout" | "bad_response" | "recorded_missing" | "recorded_tampered",
    message: string,
    readonly status?: number,
  ) {
    super(message);
  }
}

/**
 * Completion budget. Spec 05 §6.3/§7.3 says 1500; the NEAR AI models are reasoning models and their
 * reasoning tokens count against max_tokens (content comes back null when it runs out), so we allow 4000.
 * Only tokens actually generated are billed.
 */
export const MAX_TOKENS = 4000;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ---------- OpenAI-compatible (NEAR AI Cloud, fallback) ----------

export interface OpenAICompatConfig {
  id: "nearai" | "openai_compat";
  baseUrl: string;
  apiKey: string;
  model: string;
  timeoutMs?: number;
  retries?: number;
  fetchImpl?: typeof fetch;
}

export class OpenAICompatProvider implements JudgeProvider {
  readonly id: "nearai" | "openai_compat";
  readonly model: string;
  readonly attested: boolean;
  protected readonly base: string;
  private jsonMode = true;

  constructor(protected readonly cfg: OpenAICompatConfig) {
    if (!cfg.apiKey) throw new ProviderError("no_key", `${cfg.id}: API key missing`);
    this.id = cfg.id;
    this.model = cfg.model;
    this.attested = cfg.id === "nearai";
    this.base = cfg.baseUrl.replace(/\/$/, "");
  }

  protected async request(path: string, init: RequestInit = {}): Promise<unknown> {
    const f = this.cfg.fetchImpl ?? fetch;
    const retries = this.cfg.retries ?? 2;
    let last: unknown;
    for (let attempt = 0; attempt <= retries; attempt++) {
      if (attempt) await sleep(1_000 * 2 ** (attempt - 1));
      try {
        const res = await f(`${this.base}${path}`, {
          ...init,
          headers: { authorization: `Bearer ${this.cfg.apiKey}`, "content-type": "application/json", ...(init.headers ?? {}) },
          signal: AbortSignal.timeout(this.cfg.timeoutMs ?? 90_000),
        });
        const text = await res.text();
        if (res.ok) {
          try {
            return JSON.parse(text);
          } catch {
            throw new ProviderError("bad_response", `${path}: response is not JSON`);
          }
        }
        const err = new ProviderError("http", `${this.id} ${path} → ${res.status}: ${text.slice(0, 300)}`, res.status);
        if (res.status !== 429 && res.status < 500) throw err; // 4xx other than 429: not retryable
        last = err;
      } catch (e) {
        if (e instanceof ProviderError && e.code === "http" && e.status !== 429 && (e.status ?? 0) < 500) throw e;
        if (e instanceof ProviderError && e.code === "bad_response") throw e;
        last = e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError") ? new ProviderError("timeout", `${this.id} ${path}: timeout`) : e;
      }
    }
    throw last;
  }

  async complete(req: CompletionRequest): Promise<CompletionResult> {
    const body = (json: boolean) =>
      JSON.stringify({
        model: this.model,
        messages: [
          { role: "system", content: req.system },
          { role: "user", content: req.user },
        ],
        temperature: req.temperature,
        max_tokens: req.maxTokens,
        ...(json ? { response_format: { type: "json_object" } } : {}),
        ...(req.reasoning === "low" ? { reasoning_effort: "low", chat_template_kwargs: { enable_thinking: false } } : {}),
      });
    let r: unknown;
    try {
      r = await this.request("/chat/completions", { method: "POST", body: body(this.jsonMode) });
    } catch (e) {
      // Some models reject response_format; retry once without it and remember.
      if (!(e instanceof ProviderError && e.status === 400 && /response_format|json/i.test(e.message)) || !this.jsonMode) throw e;
      this.jsonMode = false;
      r = await this.request("/chat/completions", { method: "POST", body: body(false) });
    }
    const resp = r as { id?: string; choices?: { finish_reason?: string; message?: { content?: string | null } }[]; usage?: Partial<Usage> };
    const text = resp.choices?.[0]?.message?.content;
    if (typeof text !== "string" || !text.trim())
      throw new ProviderError(
        "bad_response",
        `${this.id}: no message content (finish_reason=${resp.choices?.[0]?.finish_reason ?? "?"}, completion_tokens=${resp.usage?.completion_tokens ?? "?"}${resp.choices?.[0]?.finish_reason === "length" ? ": token budget used up by reasoning" : ""})`,
      );
    return {
      text,
      chatId: resp.id,
      usage: resp.usage ? { prompt_tokens: resp.usage.prompt_tokens ?? 0, completion_tokens: resp.usage.completion_tokens ?? 0 } : undefined,
    };
  }
}

/**
 * NEAR AI Cloud (TEE-attested models). Attestation endpoints follow the NEAR AI Cloud verification flow:
 *   GET /attestation/report?model=&nonce=&signing_algo=   → model attestation incl. signing_address
 *   GET /signature/{chat_id}?model=&signing_algo=          → { text, signature, signing_address, signing_algo }
 * Not yet exercised live (no NEARAI_API_KEY with credits, see devlog); response parsing is defensive.
 */
export class NearAIProvider extends OpenAICompatProvider {
  constructor(cfg: Omit<OpenAICompatConfig, "id">, readonly signingAlgo: "ecdsa" | "ed25519" = "ecdsa") {
    super({ ...cfg, id: "nearai" });
  }

  /**
   * Verified live 2026-11-13: the report has `model_attestations[]` with model_name, signing_address,
   * signing_algo, request_nonce (echo of our nonce), intel_quote, nvidia_payload, event_log.
   */
  async attest(nonce: string): Promise<AttestationReport> {
    const q = new URLSearchParams({ model: this.model, nonce, signing_algo: this.signingAlgo });
    const raw = (await this.request(`/attestation/report?${q}`)) as Record<string, unknown>;
    const list = (Array.isArray(raw.model_attestations) ? raw.model_attestations : []) as Record<string, unknown>[];
    const model = list.find((m) => m.model_name === this.model) ?? list[0];
    if (!model) throw new ProviderError("bad_response", "attestation report has no model_attestations");
    const echoed = model.request_nonce ?? model.nonce;
    if (echoed !== nonce) throw new ProviderError("bad_response", `attestation nonce mismatch (${String(echoed).slice(0, 12)}…)`);
    const addr = model.signing_address as string | undefined;
    if (!addr) throw new ProviderError("bad_response", "attestation report has no per-model signing_address (3P TEE): responses cannot be signature-checked");
    return { raw, signing_address: addr, signing_algo: String(model.signing_algo ?? this.signingAlgo) };
  }

  async signature(chatId: string): Promise<SignatureProof> {
    const q = new URLSearchParams({ model: this.model, signing_algo: this.signingAlgo });
    const r = (await this.request(`/signature/${encodeURIComponent(chatId)}?${q}`)) as Partial<SignatureProof>;
    if (!r.signature || !r.text) throw new ProviderError("bad_response", "signature response missing text/signature");
    return { text: r.text, signature: r.signature, signing_address: r.signing_address ?? "", signing_algo: r.signing_algo ?? this.signingAlgo };
  }
}

// ---------- recorded (eval / CI / RECORDED-JURY mode) ----------

export interface RecordedFile {
  case_id: string;
  verifier: string;
  provider: string;
  model: string;
  attested: boolean;
  /** sha256 of canonical {system, user} so a replay only answers the request it was recorded for. */
  request_sha256: string;
  response: CompletionResult;
  /** sha256 of canonical response; checked on load (tamper evidence). */
  response_sha256: string;
  recorded_at: string;
}

export const requestHash = (req: Pick<CompletionRequest, "system" | "user">) => canonicalHash({ system: req.system, user: req.user });

export class RecordedProvider implements JudgeProvider {
  readonly id = "recorded" as const;
  readonly model: string;
  readonly attested: boolean;
  private readonly rec: RecordedFile;

  constructor(readonly file: string) {
    if (!existsSync(file)) throw new ProviderError("recorded_missing", `no recording at ${file}`);
    this.rec = JSON.parse(readFileSync(file, "utf8")) as RecordedFile;
    if (canonicalHash(this.rec.response) !== this.rec.response_sha256)
      throw new ProviderError("recorded_tampered", `${file}: response sha256 mismatch`);
    this.model = this.rec.model;
    this.attested = false; // a replay proves nothing about the TEE at replay time
  }

  async complete(req: CompletionRequest): Promise<CompletionResult> {
    const h = requestHash(req);
    if (h !== this.rec.request_sha256)
      throw new ProviderError("recorded_tampered", `${this.file}: recorded for a different prompt (${this.rec.request_sha256.slice(0, 12)} ≠ ${h.slice(0, 12)})`);
    return this.rec.response;
  }
}

/** Wraps a live provider and writes every completion as a RecordedFile (pnpm eval --live). */
export class RecordingProvider implements JudgeProvider {
  readonly id: ProviderId;
  readonly model: string;
  readonly attested: boolean;
  constructor(
    private readonly inner: JudgeProvider,
    private readonly file: string,
    private readonly meta: { case_id: string; verifier: string },
  ) {
    this.id = inner.id;
    this.model = inner.model;
    this.attested = inner.attested;
    if (inner.attest) this.attest = (n) => inner.attest!(n);
    if (inner.signature) this.signature = (c) => inner.signature!(c);
  }
  attest?: (nonce: string) => Promise<AttestationReport>;
  signature?: (chatId: string) => Promise<SignatureProof>;

  async complete(req: CompletionRequest): Promise<CompletionResult> {
    const response = await this.inner.complete(req);
    const rec: RecordedFile = {
      ...this.meta,
      provider: this.inner.id,
      model: this.inner.model,
      attested: this.inner.attested,
      request_sha256: requestHash(req),
      response,
      response_sha256: canonicalHash(response),
      recorded_at: new Date().toISOString(),
    };
    mkdirSync(dirname(this.file), { recursive: true });
    writeFileSync(this.file, `${JSON.stringify(rec, null, 2)}\n`);
    return response;
  }
}

// ---------- rules (offline juror, no LLM) ----------

/**
 * Deterministic stand-in juror: rule criteria from facts, C0 FAIL when the pre-scan flags the
 * deliverable, every other LLM criterion UNSURE. Lets the runner/contract path run without any key;
 * honest by construction (it never claims to have judged content it cannot judge).
 */
export class RulesProvider implements JudgeProvider {
  readonly id = "rules" as const;
  readonly model = "rules:v1";
  readonly attested = false;

  async complete(req: CompletionRequest): Promise<CompletionResult> {
    const ctx = req.context;
    if (!ctx) throw new ProviderError("bad_response", "rules provider needs request context");
    const verdicts = ctx.criteria.map((c) => {
      const f = ctx.facts[c.id];
      if (f) return { id: c.id, verdict: f.pass ? "PASS" : "FAIL", confidence: 1, evidence: canonicalJson(f.value).slice(0, 200), reason: `rule ${f.rule}` };
      if (c.id === "C0")
        return ctx.prescan.flagged
          ? { id: c.id, verdict: "FAIL", confidence: 0.9, evidence: ctx.prescan.hits[0]?.excerpt ?? "", reason: "pre-scan flagged evaluator-directed content" }
          : { id: c.id, verdict: "PASS", confidence: 0.6, evidence: "", reason: "pre-scan found no evaluator-directed content" };
      return { id: c.id, verdict: "UNSURE", confidence: null, evidence: "", reason: "needs an LLM verifier; rules provider cannot judge this" };
    });
    const text = JSON.stringify({ verdicts, injection_suspected: ctx.prescan.flagged, injection_evidence: ctx.prescan.hits[0]?.excerpt ?? "" });
    return { text, chatId: `rules-${sha256Hex(req.user).slice(0, 16)}`, usage: { prompt_tokens: 0, completion_tokens: 0 } };
  }
}

// ---------- config ----------

export interface ModelSpec {
  provider: ProviderId;
  model: string;
}

/**
 * Default jury: NEAR AI "Private TEE" models only (near.ai/pricing, 2026-11). Their attestation report carries a
 * per-model signing key, so every response signature can be checked. "Private 3P TEE" models (e.g. Kimi K2.6 on
 * chutes) were dropped after a live probe: no signing_address in the report and upstream 429s.
 * The contract draws 3 of the 4 active verifiers per job; v1–v3 are three different model families.
 */
export const DEFAULT_VERIFIER_MODELS: Record<string, string> = {
  v1: "deepseek-ai/DeepSeek-V4.1-Flash-1017",
  v2: "Qwen/Qwen3.8-27B",
  v3: "z-ai/glm-5.3-flash",
  v4: "Qwen/Qwen3.6-35B-A3B-FP8",
};
export const DEFAULT_COMPILER_MODEL = "Qwen/Qwen3.8-27B";

export interface ProviderEnv {
  NEARAI_BASE_URL?: string;
  NEARAI_API_KEY?: string;
  FALLBACK_LLM_BASE_URL?: string;
  FALLBACK_LLM_API_KEY?: string;
  FALLBACK_LLM_MODEL?: string;
}

/** Which live provider is available; null → no key at all. */
export function liveProviderKind(env: ProviderEnv = process.env): "nearai" | "openai_compat" | null {
  if (env.NEARAI_API_KEY) return "nearai";
  if (env.FALLBACK_LLM_BASE_URL && env.FALLBACK_LLM_API_KEY) return "openai_compat";
  return null;
}

/**
 * Build the provider for a model. NEAR AI when its key is set; otherwise the fallback endpoint
 * (badge "Not attested"); otherwise the offline rules juror. `prefer` forces a kind.
 */
export function makeProvider(spec: string, env: ProviderEnv = process.env, prefer?: ProviderId): JudgeProvider {
  // "openai_compat:gpt-4.1" / "nearai:Qwen/..." / "rules" pin the provider; a bare model id auto-selects.
  const m = /^(nearai|openai_compat|rules):?(.*)$/.exec(spec);
  const pinned = m ? (m[1] as ProviderId) : undefined;
  const model = m ? m[2] || DEFAULT_COMPILER_MODEL : spec;
  const kind = prefer ?? pinned ?? liveProviderKind(env) ?? "rules";
  if (kind === "nearai")
    return new NearAIProvider({ baseUrl: env.NEARAI_BASE_URL || "https://cloud-api.near.ai/v1", apiKey: env.NEARAI_API_KEY ?? "", model });
  if (kind === "openai_compat")
    return new OpenAICompatProvider({
      id: "openai_compat",
      baseUrl: env.FALLBACK_LLM_BASE_URL ?? "",
      apiKey: env.FALLBACK_LLM_API_KEY ?? "",
      // a bare NEAR AI model id means nothing to another endpoint unless it was pinned explicitly
      model: pinned === "openai_compat" ? model : env.FALLBACK_LLM_MODEL || model,
    });
  if (kind === "rules") return new RulesProvider();
  throw new ProviderError("no_key", `provider ${kind} cannot be built from env`);
}
