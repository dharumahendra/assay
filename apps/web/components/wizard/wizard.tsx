"use client";

/** /protected/new: four-step wizard that compiles criteria and funds a protected job (T6.2, FR-C4, FR-D1). */
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { ContractParams, VerifierView } from "@juri/shared";
import { TxModal, type TxPhase } from "@/components/tx-modal";
import { useTxReturn, useWallet } from "@/components/wallet";
import { isCriteriaDoc, validateCriteria, type CriteriaDoc } from "@/lib/criteria";
import { accountBalance, canonicalJson, formatNear, GAS, outcomeValue, parseNear, sha256Hex, STORAGE_RESERVE, view } from "@/lib/wallet/near";
import { briefKey, clearDraft, deadlineSecs, emptyDraft, loadDraft, marketIdFrom, saveDraft, type Draft } from "./draft";
import { StepCriteria, kindsOf, useCriteriaHash } from "./step-criteria";
import { StepJob } from "./step-job";
import { StepReview } from "./step-review";
import { StepTerms, termsError } from "./step-terms";
import { Hand } from "./ui";

const STEPS = ["Job", "Criteria", "Terms", "Review & fund"] as const;
const TITLES = ["Describe the work", "Lock what “done” means", "Set the stakes", "Fund & lock it in"] as const;

type Busy = { s: "idle" } | { s: "compiling" } | { s: "uploading" } | { s: "error"; msg: string };

async function compileError(res: Response): Promise<string> {
  const body = (await res.json().catch(() => null)) as { error?: { code?: string; message?: string } } | null;
  if (res.status === 503) return "No model is configured for the criteria compiler on this API.";
  if (res.status === 422) return `The model returned criteria that failed validation. ${body?.error?.message ?? ""} Retry.`;
  if (res.status === 429) return "Too many compile requests. Wait a minute, then retry.";
  if (res.status === 502) return /unavailable/i.test(body?.error?.message ?? "") ? "The compiler model is temporarily unavailable at NEAR AI. Retry in a minute." : "The model provider returned an error. Retry in a moment.";
  if (res.status === 500 || res.status === 504) return "The compile request timed out on the way to the API. Retry.";
  return body?.error?.message ?? `Compiling failed (HTTP ${res.status}).`;
}

export function Wizard({ from }: { from: string | null }) {
  const router = useRouter();
  const { accountId, connect, call, ready } = useWallet();
  const [d, setD] = useState<Draft | null>(null);
  const [busy, setBusy] = useState<Busy>({ s: "idle" });
  const [params, setParams] = useState<ContractParams | null>(null);
  const [verifiers, setVerifiers] = useState<VerifierView[] | null>(null);
  const [balance, setBalance] = useState<bigint | null>(null);
  const [jobCount, setJobCount] = useState<number | null>(null);
  const [tx, setTx] = useState<{ uri: string; hash: string } | null>(null);
  const [txInitial, setTxInitial] = useState<TxPhase | undefined>(undefined);
  const returned = useTxReturn(accountId);

  // draft: sessionStorage first, then ?from=<market job id>
  useEffect(() => {
    const saved = loadDraft();
    const base = saved ?? emptyDraft();
    if (from && marketIdFrom(from) && base.market?.id !== marketIdFrom(from)) {
      setD({ ...emptyDraft(), marketInput: from });
    } else setD(base);
  }, [from]);
  useEffect(() => {
    if (d) saveDraft(d);
  }, [d]);
  const set = useCallback((p: Partial<Draft>) => setD((x) => (x ? { ...x, ...p } : x)), []);

  useEffect(() => {
    void fetch("/api/treasury")
      .then((r) => (r.ok ? r.json() : null))
      .then((b: { params: ContractParams | null } | null) => b?.params && setParams(b.params))
      .catch(() => undefined);
    void fetch("/api/verifiers")
      .then((r) => (r.ok ? r.json() : null))
      .then((b: { data: VerifierView[] } | null) => setVerifiers(b?.data ?? []))
      .catch(() => setVerifiers([]));
    void view<number>("get_job_count")
      .then(setJobCount)
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!accountId) return setBalance(null);
    void accountBalance(accountId).then(setBalance);
  }, [accountId]);

  // back from a redirect wallet
  useEffect(() => {
    if (!returned) return;
    setTx({ uri: "", hash: "" });
    setTxInitial(returned.kind === "ok" ? { s: "done", hash: returned.hash, outcome: returned.outcome } : { s: "failed", hash: null, error: { code: returned.code, title: "The wallet returned an error.", detail: returned.message } });
  }, [returned]);

  const hash = useCriteriaHash(d?.doc ?? null);
  const stale = !!d?.doc && d.compiledFor !== briefKey(d);

  const compile = useCallback(async () => {
    if (!d) return;
    setBusy({ s: "compiling" });
    const t0 = performance.now();
    try {
      const useMarket = d.source === "market" && d.market && d.title === (d.market.title ?? "").slice(0, 120);
      const res = await fetch("/api/criteria/compile", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(useMarket ? { market_job_id: d.market!.id } : { text: `${d.title.trim()}\n\n${d.description.trim()}` }),
      });
      if (!res.ok) return setBusy({ s: "error", msg: await compileError(res) });
      const body: unknown = await res.json();
      if (!isCriteriaDoc(body)) return setBusy({ s: "error", msg: "The compiler answered in an unexpected shape. Retry." });
      const doc: CriteriaDoc = { ...body, deliverable_format: d.format, source: { ...body.source, title: (d.title || body.source.title).slice(0, 300) } };
      setD((x) => (x ? { ...x, doc, compiledFor: briefKey(x), compileMs: Math.round(performance.now() - t0), step: 2 } : x));
      setBusy({ s: "idle" });
    } catch {
      setBusy({ s: "error", msg: "The Assay API could not be reached." });
    }
  }, [d]);

  const termsErr = d ? termsError(d, params, accountId) : null;
  const criteriaErr = d?.doc ? validateCriteria(d.doc.criteria) : "Compile criteria first.";

  async function fund() {
    if (!d?.doc || !hash) return;
    if (!accountId) return connect();
    setBusy({ s: "uploading" });
    try {
      const res = await fetch("/api/blobs", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ kind: "criteria", content: d.doc }) });
      if (!res.ok) return setBusy({ s: "error", msg: `Uploading the criteria failed (HTTP ${res.status}).` });
      const b = (await res.json()) as { sha256: string; uri: string };
      const local = await sha256Hex(canonicalJson(d.doc));
      if (b.sha256 !== local) return setBusy({ s: "error", msg: "The stored criteria hash differs from the one computed in your browser. Nothing was signed; report this." });
      setBusy({ s: "idle" });
      setTxInitial(undefined);
      setTx({ uri: b.uri, hash: b.sha256 });
    } catch {
      setBusy({ s: "error", msg: "The Assay API could not be reached." });
    }
  }

  const amount = d ? (parseNear(d.amount) ?? 0n) : 0n;
  const txRows = useMemo<[string, string][]>(
    () =>
      d && tx?.hash
        ? [
            ["Contract call", "create_job"],
            ["Worker", d.worker],
            ["Escrow", `${formatNear(amount, 4)} Ⓝ`],
            ["Storage reserve", `${formatNear(STORAGE_RESERVE)} Ⓝ`],
            ["Criteria", `${tx.hash.slice(0, 10)}… · ${d.doc?.criteria.length ?? 0}`],
          ]
        : [],
    [d, tx, amount],
  );

  if (!d) return <div className="skeleton h-96 rounded-3xl" />;

  const canNext =
    d.step === 1
      ? d.title.trim().length > 0 && d.description.trim().length >= 20 && busy.s !== "compiling"
      : d.step === 2
        ? !criteriaErr && !stale
        : d.step === 3
          ? !termsErr
          : !criteriaErr && !termsErr && d.agree && busy.s !== "uploading";

  async function next() {
    if (!d) return;
    if (d.step === 1) {
      if (d.doc && !stale) return set({ step: 2 });
      return compile();
    }
    if (d.step < 4) return set({ step: (d.step + 1) as Draft["step"] });
    return fund();
  }

  const blocker =
    d.step === 1
      ? !d.title.trim()
        ? "Add a title to continue"
        : d.description.trim().length < 20
          ? `Describe the deliverable in at least 20 characters (${d.description.trim().length}/20)`
          : null
      : d.step === 2
        ? stale
          ? "The brief changed: recompile the criteria"
          : criteriaErr
        : d.step === 3
          ? termsErr
          : !d.agree
            ? "Tick the confirmation box to fund"
            : (criteriaErr ?? termsErr);

  const nextLabel =["Next: Compile criteria", "Next: Terms", "Next: Review & fund", accountId ? `Sign & fund ${formatNear(amount)} Ⓝ` : "Connect wallet to fund"][d.step - 1]!;
  const footNote =
    d.step === 1
      ? "Nothing is sent on-chain until you fund in step 4"
      : d.step === 2
        ? "Draft saved in this session"
        : d.step === 3
          ? hash
            ? `Criteria locked · ${hash.slice(0, 12)}…`
            : ""
          : "One transaction · funds stay in the contract until settlement";

  return (
    <div className="pb-28">
      <div className="flex flex-wrap items-end justify-between gap-6">
        <div>
          <Hand className="text-muted">new protected job</Hand>
          <h1 className="mt-1 text-[2.5rem] font-semibold leading-[1.05] tracking-[-0.03em] sm:text-[3.5rem]">{TITLES[d.step - 1]}</h1>
        </div>
        <ol className="flex flex-wrap gap-1.5 rounded-full border border-rule bg-surface p-1.5 text-sm">
          {STEPS.map((s, i) => {
            const n = (i + 1) as Draft["step"];
            const done = n < d.step;
            const reachable = n <= d.step || (n === 2 && !!d.doc) || (n === 3 && !!d.doc && !criteriaErr) || (n === 4 && !!d.doc && !criteriaErr && !termsErr);
            return (
              <li key={s}>
                <button
                  type="button"
                  disabled={!reachable}
                  onClick={() => set({ step: n })}
                  aria-current={n === d.step ? "step" : undefined}
                  className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 ${n === d.step ? "bg-ink text-paper" : done ? "bg-[#C8F24A] text-[#0D0F14]" : "text-muted"} disabled:cursor-not-allowed`}
                >
                  <span className={`grid size-5 place-items-center rounded-full text-[0.6875rem] font-semibold ${n === d.step ? "bg-paper text-ink" : done ? "bg-[#0D0F14] text-[#C8F24A]" : "border border-rule"}`}>{done ? "✓" : n}</span>
                  {s}
                </button>
              </li>
            );
          })}
        </ol>
      </div>

      {from && d.step === 1 && !d.market && (
        <p className="mt-4 text-sm text-muted">
          Importing market job <span className="font-mono">{marketIdFrom(from)}</span>: press Fetch.{" "}
          <Link href={`/jobs/${encodeURIComponent(from)}`} className="link">
            Back to the job
          </Link>
        </p>
      )}

      <div className="mt-8">
        {d.step === 1 && <StepJob d={d} set={set} />}
        {d.step === 2 && d.doc && (
          <>
            {stale && (
              <div role="alert" className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-[#F2BC75]/40 px-4 py-3 text-sm">
                The brief changed after these criteria were compiled.
                <button type="button" onClick={compile} className="rounded-full bg-ink px-3 py-1 font-semibold text-paper">
                  Recompile
                </button>
              </div>
            )}
            <StepCriteria
              doc={d.doc}
              meta={`${d.market ? `Imported from market job ${d.market.id.slice(0, 8)}…` : "From your brief"}${d.compileMs ? ` · compiled in ${(d.compileMs / 1000).toFixed(1)}s` : ""}`}
              compiling={busy.s === "compiling"}
              onChange={(doc) => set({ doc })}
              onRegenerate={() => (confirm("Regenerating replaces your edits. Continue?") ? compile() : undefined)}
            />
          </>
        )}
        {d.step === 3 && <StepTerms d={d} set={set} params={params} verifiers={verifiers} me={accountId} criteriaHash={hash} />}
        {d.step === 4 && d.doc && <StepReview d={d} doc={d.doc} set={set} params={params} me={accountId} balance={balance} hash={hash} nextJobId={jobCount !== null ? jobCount + 1 : null} onConnect={connect} />}
      </div>

      {busy.s === "error" && (
        <div role="alert" className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-bad/40 bg-bad-bg px-4 py-3 text-sm">
          {busy.msg}
          <button type="button" onClick={() => setBusy({ s: "idle" })} className="underline">
            Dismiss
          </button>
        </div>
      )}

      <div className="fixed inset-x-0 bottom-0 z-40 px-4 pb-4">
        <div className="mx-auto flex max-w-[84rem] items-center justify-between gap-3 rounded-full border border-rule bg-surface/95 py-2 pl-5 pr-2 shadow-lg backdrop-blur">
          <p className={`min-w-0 truncate text-xs ${blocker && busy.s === "idle" ? "font-medium text-bad" : "font-mono text-muted"}`} role={blocker ? "status" : undefined}>
            {busy.s === "compiling" ? "Compiling criteria… can take up to a minute" : busy.s === "uploading" ? "Storing criteria…" : blocker ? `⚠ ${blocker}` : footNote}
          </p>
          <div className="ml-auto flex shrink-0 gap-2">
            {d.step === 1 ? (
              <button
                type="button"
                onClick={() => {
                  if (!confirm("Discard this draft?")) return;
                  clearDraft();
                  router.push(from ? `/jobs/${encodeURIComponent(from)}` : "/protected");
                }}
                className="rounded-full border border-rule px-4 py-2 text-sm hover:border-ink"
              >
                Cancel
              </button>
            ) : (
              <button type="button" onClick={() => set({ step: (d.step - 1) as Draft["step"] })} className="rounded-full border border-rule px-4 py-2 text-sm hover:border-ink">
                ← Back
              </button>
            )}
            <button
              type="button"
              onClick={() => (d.step === 4 && !accountId ? connect() : void next())}
              disabled={d.step === 4 && !accountId ? !ready : !canNext}
              className="rounded-full bg-ink px-5 py-2 text-sm font-semibold text-paper disabled:opacity-50"
            >
              {busy.s === "compiling" ? "Compiling…" : busy.s === "uploading" ? "Preparing…" : `${nextLabel} →`}
            </button>
          </div>
        </div>
      </div>

      <TxModal
        open={!!tx}
        title="Fund protected job"
        rows={txRows}
        note="Your wallet will ask you to approve one transaction to the Assay contract."
        confirmLabel="Open wallet"
        initial={txInitial}
        onClose={() => {
          setTx(null);
          setTxInitial(undefined);
        }}
        run={() => {
          if (!tx?.hash || !d.doc) return Promise.reject(new Error("Close this and press Sign & fund again."));
          return call({
            method: "create_job",
            args: {
              worker: d.worker.trim(),
              criteria_hash: tx!.hash,
              criteria_uri: tx!.uri,
              criteria_kinds: kindsOf(d.doc!),
              submit_deadline_secs: deadlineSecs(d.deadline),
              market_job_id: d.market?.id ?? null,
            },
            deposit: amount + STORAGE_RESERVE,
            gas: GAS.create_job,
          });
        }}
        done={(o) => {
          const id = outcomeValue<number>(o);
          clearDraft();
          return (
            <div className="rounded-2xl bg-[#C8F24A] p-4 text-[#0D0F14]">
              <p className="font-semibold">{id ? `Protected job #${id} is funded.` : "The job is funded."}</p>
              <p className="mt-1 text-sm">The escrow is locked. The worker can submit until the deadline.</p>
              <Link href={id ? `/protected/${id}` : "/protected"} className="mt-3 inline-block rounded-full bg-ink px-4 py-1.5 text-sm font-semibold text-paper">
                {id ? `Open job #${id}` : "See protected jobs"} →
              </Link>
            </div>
          );
        }}
      />
    </div>
  );
}
