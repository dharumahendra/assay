import {
  buildCommitment,
  canonicalHash,
  ContractJobSchema,
  CriteriaDocSchema,
  EvidenceSchema,
  sha256Hex,
  verdictCode,
  type ContractJob,
  type CriteriaDoc,
  type Evidence,
  type Fact,
  type Prescan,
  type RevealVoteArgs,
} from "@juri/shared";
import {
  DEFAULT_VERIFIER_MODELS,
  hashMismatchResult,
  judge,
  makeProvider,
  prepareFacts,
  safeFetch,
  type JudgeProvider,
  type JudgeResult,
} from "@juri/jury";
import { randomBytes } from "node:crypto";
import { BlobError, getBlob, putBlob } from "./blobs.js";
import type { Db } from "./db/index.js";

/**
 * Jury runner (05 §7.1, T4.6, NFR-REL-2). One `tick()`:
 *   Submitted → keeper.start_judging (AUTO_START) · Stalled → keeper.restart_jury
 *   Committing → per juror we hold a key for: judge → evidence blob → commit_vote → reveal_vote
 *   → keeper.finalize once everyone revealed or the reveal deadline passed.
 * Idempotent: `runner_state` (keyed by job id + jury round) plus the on-chain commits/reveals decide what
 * is left to do; the salt is persisted before commit so a restart can still reveal.
 */

export const VERIFIER_GAS_TGAS = 30; // verifier seed balance is 0.1 NEAR (P3 finding)
const COMMIT_MARGIN_NS = 10n * 1_000_000_000n; // do not start a commit tx this close to the deadline

export interface Chain {
  activeJobs(): Promise<ContractJob[]>;
  getJob(id: number): Promise<ContractJob>;
  /** Verifier accounts this runner can sign for. */
  ours(): string[];
  hasKeeper(): boolean;
  startJudging(id: number): Promise<string>;
  restartJury(id: number): Promise<string>;
  finalize(id: number): Promise<string>;
  commit(verifier: string, id: number, commitment: string): Promise<string>;
  reveal(verifier: string, args: RevealVoteArgs): Promise<string>;
  nowNs(): bigint;
}

export interface RunnerDeps {
  db: Db;
  blobDir: string;
  chain: Chain;
  providerFor: (verifier: string) => JudgeProvider;
  autoStart: boolean;
  /** DELIVERABLE_URI_ALLOWLIST for fetching blobs that are not in the local store. */
  allowlist: string[];
  log?: (msg: string) => void;
}

type Phase = "judged" | "committed" | "revealed" | "failed";
interface StateRow {
  job_id: string;
  verifier: string;
  phase: Phase;
  salt: string | null;
  evidence_sha: string | null;
  attestation_sha: string | null;
  commit_tx: string | null;
  reveal_tx: string | null;
  error: string | null;
}

/** Jury round key: a restarted jury is a fresh round for runner_state. */
export const roundKey = (job: Pick<ContractJob, "id" | "restarts">) => `${job.id}#${job.restarts}`;

function getState(db: Db, key: string, v: string): StateRow | undefined {
  return db.$client.prepare(`SELECT * FROM runner_state WHERE job_id = ? AND verifier = ?`).get(key, v) as StateRow | undefined;
}
function setState(db: Db, key: string, v: string, patch: Partial<Omit<StateRow, "job_id" | "verifier">> & { phase?: Phase }) {
  const cur = getState(db, key, v);
  const row = { phase: "judged" as Phase, salt: null, evidence_sha: null, attestation_sha: null, commit_tx: null, reveal_tx: null, error: null, ...cur, ...patch };
  db.$client
    .prepare(
      `INSERT INTO runner_state (job_id, verifier, phase, salt, evidence_sha, attestation_sha, commit_tx, reveal_tx, error, updated_at)
       VALUES (@job_id, @verifier, @phase, @salt, @evidence_sha, @attestation_sha, @commit_tx, @reveal_tx, @error, @updated_at)
       ON CONFLICT(job_id, verifier) DO UPDATE SET phase=excluded.phase, salt=excluded.salt, evidence_sha=excluded.evidence_sha,
         attestation_sha=excluded.attestation_sha, commit_tx=excluded.commit_tx, reveal_tx=excluded.reveal_tx, error=excluded.error,
         updated_at=excluded.updated_at`,
    )
    .run({ ...row, job_id: key, verifier: v, updated_at: new Date().toISOString() });
}

// ---------- context (05 §7.1 prepareContext) ----------

export interface JobContext {
  doc: CriteriaDoc | null;
  deliverable: string | null;
  facts: Record<string, Fact>;
  prescan: Prescan;
  /** Set when a blob is missing or does not match its on-chain hash → every juror FAILs everything. */
  mismatch: string | null;
}

async function loadBlob(deps: RunnerDeps, sha: string, uri: string | null, maxChars: number): Promise<{ text: string } | { error: string }> {
  try {
    return { text: getBlob(deps.db, deps.blobDir, sha).bytes.toString("utf8") };
  } catch (e) {
    if (e instanceof BlobError && e.code === "hash_mismatch") return { error: "local blob does not match its hash" };
  }
  if (!uri || !/^https?:\/\//.test(uri)) return { error: `blob ${sha.slice(0, 12)}… not in the local store and uri is not fetchable (${uri ?? "none"})` };
  try {
    const r = await safeFetch(uri, { allowlist: deps.allowlist, maxChars: maxChars + 1 });
    if (r.status !== 200) return { error: `GET ${uri} → ${r.status}` };
    if (sha256Hex(r.text) !== sha) return { error: `content at ${uri} does not match on-chain hash` };
    return { text: r.text };
  } catch (e) {
    return { error: `fetch ${uri}: ${e instanceof Error ? e.message : e}` };
  }
}

export async function prepareContext(deps: RunnerDeps, job: ContractJob): Promise<JobContext> {
  const empty = { facts: {}, prescan: { flagged: false, hits: [] } };
  const c = await loadBlob(deps, job.criteria_hash, job.criteria_uri, 64_000);
  if ("error" in c) return { doc: null, deliverable: null, ...empty, mismatch: `criteria: ${c.error}` };
  let doc: CriteriaDoc;
  try {
    doc = CriteriaDocSchema.parse(JSON.parse(c.text));
  } catch {
    return { doc: null, deliverable: null, ...empty, mismatch: "criteria: blob is not a valid CriteriaDoc v1" };
  }
  if (doc.criteria.length !== job.criteria_kinds.length || doc.criteria.some((cr, i) => (cr.kind === "MUST" ? 0 : 1) !== job.criteria_kinds[i]))
    return { doc: null, deliverable: null, ...empty, mismatch: "criteria: kinds differ from on-chain criteria_kinds" };
  if (!job.deliverable_hash) return { doc, deliverable: null, ...empty, mismatch: "deliverable: no hash on-chain" };
  const d = await loadBlob(deps, job.deliverable_hash, job.deliverable_uri, 50_000);
  if ("error" in d) return { doc, deliverable: null, ...empty, mismatch: `deliverable: ${d.error}` };
  let text = d.text;
  // A deliverable that is just a URL is fetched (SSRF guard, ≤50k chars) and judged by its content.
  const single = text.trim();
  if (/^https?:\/\/\S+$/.test(single)) {
    try {
      const r = await safeFetch(single, { maxChars: 50_000 });
      text = `Deliverable URL: ${single}\nHTTP ${r.status}${r.truncated ? " (truncated to 50000 chars)" : ""}\n\n${r.text}`;
    } catch (e) {
      text = `Deliverable URL: ${single}\n(fetch failed: ${e instanceof Error ? e.message : e})`;
    }
  }
  const { facts, prescan } = await prepareFacts(doc, text.slice(0, 50_000));
  return { doc, deliverable: text.slice(0, 50_000), facts, prescan, mismatch: null };
}

// ---------- tick ----------

export interface TickReport {
  jobs: number;
  actions: string[];
  errors: string[];
}

const evidenceOf = (deps: RunnerDeps, sha: string): Evidence => EvidenceSchema.parse(JSON.parse(getBlob(deps.db, deps.blobDir, sha).bytes.toString("utf8")));

export async function tick(deps: RunnerDeps, ctxCache = new Map<string, JobContext>()): Promise<TickReport> {
  const { chain, db } = deps;
  const log = deps.log ?? (() => {});
  const rep: TickReport = { jobs: 0, actions: [], errors: [] };
  const act = (m: string) => (rep.actions.push(m), log(m));
  const fail = (m: string) => (rep.errors.push(m), log(`! ${m}`));
  const ours = new Set(chain.ours());

  for (let job of await chain.activeJobs()) {
    rep.jobs++;
    try {
      if (job.status === "Submitted") {
        if (deps.autoStart && chain.hasKeeper()) act(`#${job.id} start_judging ${await chain.startJudging(job.id)}`);
        continue;
      }
      if (job.status === "Stalled") {
        if (chain.hasKeeper()) act(`#${job.id} restart_jury ${await chain.restartJury(job.id)}`);
        continue;
      }
      if (job.status !== "Committing") continue;

      const key = roundKey(job);
      const mine = job.jury.filter((v) => ours.has(v));
      const now = chain.nowNs();
      const commitDl = BigInt(job.commit_deadline);
      const revealDl = BigInt(job.reveal_deadline);

      // 1) judge (in parallel across our jurors) — only while a commit is still possible
      const toJudge = mine.filter((v) => !getState(db, key, v) && !job.commits.some((c) => c.verifier === v));
      if (toJudge.length) {
        if (now > commitDl - COMMIT_MARGIN_NS) {
          for (const v of toJudge) setState(db, key, v, { phase: "failed", error: "missed: commit deadline passed before judging" });
        } else {
          let ctx = ctxCache.get(key);
          if (!ctx) ctxCache.set(key, (ctx = await prepareContext(deps, job)));
          const c = ctx;
          await Promise.all(
            toJudge.map(async (v) => {
              const provider = deps.providerFor(v);
              const base = { jobId: job.id, verifier: v, provider, criteriaHash: job.criteria_hash, deliverableHash: job.deliverable_hash ?? "" };
              const r: JudgeResult =
                c.mismatch || !c.doc || c.deliverable === null
                  ? hashMismatchResult({ ...base, criteriaCount: job.criteria_kinds.length, reason: c.mismatch ?? "unavailable" })
                  : await judge({
                      ...base,
                      doc: c.doc,
                      deliverable: c.deliverable,
                      facts: c.facts,
                      prescan: c.prescan,
                      jurySize: job.jury.length,
                      storeReport: (report) => putBlob(db, deps.blobDir, "attestation", report).sha256,
                    });
              const ev = putBlob(db, deps.blobDir, "evidence", r.evidence);
              if (ev.sha256 !== canonicalHash(r.evidence)) throw new Error("evidence blob hash ≠ canonical hash");
              setState(db, key, v, { phase: "judged", salt: randomBytes(32).toString("hex"), evidence_sha: ev.sha256, attestation_sha: r.attestationHash, error: r.evidence.error });
              act(`#${job.id} ${v} judged by ${provider.model}: [${r.verdicts}] inj=${r.injectionFlag} evidence=${ev.sha256.slice(0, 12)}`);
            }),
          );
        }
      }

      // 2) commit
      for (const v of mine) {
        const st = getState(db, key, v);
        if (!st || st.phase !== "judged" || job.commits.some((c) => c.verifier === v)) continue;
        if (chain.nowNs() > commitDl - COMMIT_MARGIN_NS) {
          setState(db, key, v, { phase: "failed", error: "missed: commit deadline" });
          continue;
        }
        const ev = evidenceOf(deps, st.evidence_sha!);
        const commitment = buildCommitment({
          jobId: job.id,
          verifierId: v,
          verdicts: ev.verdicts.map((x) => verdictCode(x.verdict)),
          injectionFlag: ev.injection_flag,
          evidenceHash: st.evidence_sha!,
          saltHex: st.salt!,
        });
        try {
          const tx = await chain.commit(v, job.id, commitment);
          setState(db, key, v, { phase: "committed", commit_tx: tx, error: null });
          act(`#${job.id} ${v} commit_vote ${tx}`);
        } catch (e) {
          const m = e instanceof Error ? e.message : String(e);
          if (/E08/.test(m)) setState(db, key, v, { phase: "committed" });
          else (setState(db, key, v, { error: m.slice(0, 500) }), fail(m));
        }
      }

      // 3) reveal — after everyone committed or the commit deadline passed
      job = await chain.getJob(job.id);
      const revealOpen = (job.commits.length === job.jury.length || chain.nowNs() > commitDl) && chain.nowNs() <= revealDl;
      for (const v of mine) {
        const st = getState(db, key, v);
        if (!st || !st.evidence_sha || !st.salt || st.phase === "revealed" || st.phase === "failed") continue;
        if (job.reveals.some((r) => r.verifier === v)) {
          setState(db, key, v, { phase: "revealed" });
          continue;
        }
        if (!job.commits.some((c) => c.verifier === v) || !revealOpen) continue;
        const ev = evidenceOf(deps, st.evidence_sha);
        const args: RevealVoteArgs = {
          job_id: job.id,
          verdicts: ev.verdicts.map((x) => verdictCode(x.verdict)),
          injection_flag: ev.injection_flag,
          evidence_hash: st.evidence_sha,
          salt: st.salt,
          attestation_hash: st.attestation_sha,
          model: ev.model.slice(0, 96),
        };
        try {
          const tx = await chain.reveal(v, args);
          setState(db, key, v, { phase: "revealed", reveal_tx: tx, error: null });
          act(`#${job.id} ${v} reveal_vote ${tx}`);
        } catch (e) {
          const m = e instanceof Error ? e.message : String(e);
          if (/E21/.test(m)) setState(db, key, v, { phase: "revealed" });
          else (setState(db, key, v, { error: m.slice(0, 500) }), fail(m));
        }
      }

      // 4) finalize
      job = await chain.getJob(job.id);
      const allIn = job.commits.length === job.jury.length && job.reveals.length === job.commits.length;
      if (job.status === "Committing" && (allIn || chain.nowNs() > revealDl) && chain.hasKeeper()) {
        act(`#${job.id} finalize ${await chain.finalize(job.id)}`);
      }
    } catch (e) {
      fail(`#${job.id}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  return rep;
}

// ---------- providers per verifier ----------

/**
 * VERIFIER_MODELS_JSON maps verifier account (or its first label, e.g. "v2") to a model spec
 * ("Qwen/Qwen3.8-27B", "openai_compat:gpt-4.1", "rules"). Defaults: DEFAULT_VERIFIER_MODELS.
 */
export function providerResolver(env: NodeJS.ProcessEnv = process.env): (verifier: string) => JudgeProvider {
  const map = JSON.parse(env.VERIFIER_MODELS_JSON || "{}") as Record<string, string>;
  const cache = new Map<string, JudgeProvider>();
  return (v) => {
    const label = v.split(".")[0]!;
    const spec = map[v] ?? map[label] ?? DEFAULT_VERIFIER_MODELS[label] ?? "rules";
    if (!cache.has(v)) cache.set(v, makeProvider(spec, env));
    return cache.get(v)!;
  };
}

export const parseContractJob = (j: unknown) => ContractJobSchema.parse(j);
