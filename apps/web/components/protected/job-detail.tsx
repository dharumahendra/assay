"use client";

/**
 * /protected/[id]: one protected job, live (T6.3, 07 §2.9, Assay.pen "Job Detail").
 * Polls the Assay API while the job is moving; the jury panel shows each juror's phase, model,
 * attestation and verdicts; the worker can submit from here; every hash can be re-checked in the browser.
 */
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { ContractParams, Evidence, JurorView } from "@juri/shared";
import { CopyButton } from "@/components/copy-button";
import { TxModal } from "@/components/tx-modal";
import { useWallet } from "@/components/wallet";
import { Card, Eyebrow, Row } from "@/components/wizard/ui";
import { accountUrl, formatNear, mulBps, txUrl, view, type Outcome } from "@/lib/wallet/near";
import { EvidenceDrawer } from "./evidence-drawer";
import { FINAL, modelName, nsMs, relative, short, TONE, uiStatus, verifierName, when, type Detail } from "./lib";
import { SubmitCard } from "./submit-card";
import { VerifyHash } from "./verify-hash";

const LABEL = ["FAIL", "PASS", "UNSURE"] as const;
const CHIP: Record<string, string> = { PASS: "bg-[#C8F24A]", FAIL: "bg-[#F98F68]", UNSURE: "bg-[#F2BC75]" };

export function JobDetail({ id }: { id: number }) {
  const { ready, accountId, connect, call } = useWallet();
  const [d, setD] = useState<Detail | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [params, setParams] = useState<ContractParams | null>(null);
  const [evidence, setEvidence] = useState<Record<string, Evidence | null>>({});
  const [drawer, setDrawer] = useState<JurorView | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [full, setFull] = useState(false);
  const [claimable, setClaimable] = useState<string | null>(null);
  const [action, setAction] = useState<"cancel" | "reclaim" | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await fetch(`/api/protected/${id}`, { cache: "no-store" });
      if (r.status === 404) return setNotFound(true);
      if (!r.ok) throw new Error(String(r.status));
      setD((await r.json()) as Detail);
      setLoadErr(null);
    } catch {
      setLoadErr("The Assay API could not be reached. Retrying…");
    }
  }, [id]);

  useEffect(() => {
    void load();
    fetch("/api/treasury")
      .then((r) => (r.ok ? r.json() : null))
      .then((b: { params: ContractParams | null } | null) => setParams(b?.params ?? null))
      .catch(() => {});
  }, [load]);

  // live: fast while the jury works, slow while waiting for a submission, stop once final
  const status = d?.job.status;
  useEffect(() => {
    if (!status || FINAL.has(status)) return;
    const t = setInterval(() => void load(), status === "Funded" ? 15_000 : 4_000);
    return () => clearInterval(t);
  }, [status, load]);

  // evidence is content-addressed: fetch each juror's once
  const asked = useRef(new Set<string>());
  useEffect(() => {
    if (!d) return;
    for (const j of d.jury) {
      if (!j.evidence_available || !j.evidence_sha || asked.current.has(j.evidence_sha)) continue;
      const sha = j.evidence_sha;
      asked.current.add(sha);
      fetch(`/api/protected/${id}/evidence/${encodeURIComponent(j.verifier)}`)
        .then((r) => (r.ok ? (r.json() as Promise<Evidence>) : null))
        .then((ev) => setEvidence((e) => ({ ...e, [sha]: ev })))
        .catch(() => setEvidence((e) => ({ ...e, [sha]: null })));
    }
  }, [d, id]);

  const delivHash = d?.deliverable_meta?.available ? d.deliverable_meta.hash : null;
  useEffect(() => {
    if (!delivHash) return;
    fetch(`/api/blobs/${delivHash}`)
      .then((r) => (r.ok ? r.text() : null))
      .then(setPreview)
      .catch(() => setPreview(null));
  }, [delivHash]);

  const job = d?.job;
  const role = job && accountId ? (accountId === job.requester ? "Requester" : accountId === job.worker ? "Worker" : null) : null;
  const settledKey = job?.settlement ? "s" : "";
  useEffect(() => {
    if (!accountId || !role) return setClaimable(null);
    view<string>("get_claimable", { account_id: accountId })
      .then(setClaimable)
      .catch(() => setClaimable(null));
  }, [accountId, role, settledKey]);

  const ids = useMemo(() => (d ? (d.criteria?.criteria.map((c) => c.id) ?? d.job.criteria_kinds.map((_, i) => `C${i}`)) : []), [d]);
  const firstEvidence = useMemo(() => d?.jury.map((j) => (j.evidence_sha ? evidence[j.evidence_sha] : null)).find((e) => e) ?? null, [d, evidence]);

  if (notFound)
    return (
      <Card className="mx-auto max-w-xl text-center">
        <h1 className="text-2xl font-semibold tracking-tight">Protected job #{id} doesn’t exist</h1>
        <p className="mt-2 text-muted">The contract has no job with this id.</p>
        <Link href="/protected" className="link mt-4 inline-block">
          All protected jobs
        </Link>
      </Card>
    );
  if (!d || !job)
    return loadErr ? (
      <p role="alert" className="rounded-2xl border border-bad/40 bg-bad-bg p-4 text-sm">
        {loadErr}
      </p>
    ) : (
      <div className="space-y-5">
        <div className="skeleton h-40 rounded-3xl" />
        <div className="skeleton h-96 rounded-3xl" />
      </div>
    );

  const st = uiStatus(job);
  const title = d.criteria?.source.title || `Protected job #${job.id}`;
  const deadline = nsMs(job.submit_deadline)!;
  const pastDeadline = deadline < Date.now();
  const s = job.settlement;
  const fee = s ? BigInt(s.fee) : params ? mulBps(BigInt(job.amount), params.fee_bps) : null;
  const pool = s ? BigInt(s.jury_pool) : fee !== null && params ? mulBps(fee, params.jury_share_bps) : null;
  const juryN = job.jury.length || params?.jury_size || 3;

  return (
    <div className="space-y-5">
      {/* header */}
      <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-sm text-muted">
        <Link href="/protected" className="hover:text-ink">
          Protected Jobs
        </Link>
        <span aria-hidden>/</span>
        <span className="font-mono text-ink">#{job.id}</span>
      </nav>

      <Card className="p-6 sm:p-8">
        <div className="flex flex-wrap items-center gap-2">
          <span className={`rounded-full px-3 py-1 text-sm font-semibold text-[#0D0F14] ${TONE[st] ?? "bg-paper"}`}>{st}</span>
          {job.injection_flagged && <span className="rounded-full bg-[#12151F] px-3 py-1 text-sm font-semibold text-[#F98F68]">Injection attempt detected</span>}
          {!FINAL.has(job.status) && (
            <span className="inline-flex items-center gap-1.5 text-xs text-muted">
              <span className="size-1.5 animate-pulse rounded-full bg-[#1D3BFF]" /> live
            </span>
          )}
          {role && <span className="ml-auto rounded-full border border-rule px-3 py-1 text-xs">Viewing as {role}</span>}
        </div>
        <div className="mt-4 flex flex-wrap items-end justify-between gap-6">
          <div className="min-w-0 max-w-3xl">
            <h1 className="display text-[2rem] leading-tight sm:text-[2.75rem]">{title}</h1>
            {d.criteria?.summary && <p className="mt-2 text-muted">{d.criteria.summary}</p>}
          </div>
          <p className="text-right text-[3.5rem] font-semibold leading-none tracking-[-0.04em]">
            {formatNear(job.amount)}
            <span className="ml-1.5 font-mono text-base tracking-normal text-muted">NEAR</span>
          </p>
        </div>
        <dl className="mt-6 grid gap-4 border-t border-rule pt-5 text-sm sm:grid-cols-2 lg:grid-cols-4">
          <Meta k="Requester" v={<AccountLink id={job.requester} me={accountId} />} />
          <Meta k="Worker" v={<AccountLink id={job.worker} me={accountId} />} />
          <Meta k="Payout" v={job.payout_mode === "Binary" ? "All-or-nothing" : `Graded · base ${job.payout_mode.Partial.base_pct}%`} />
          <Meta k="Criteria" v={<span className="font-mono">{short(job.criteria_hash)} · {job.criteria_kinds.length}</span>} />
        </dl>
        <div className="mt-5 flex flex-wrap gap-2">
          <CopyButton text={typeof window === "undefined" ? "" : `${window.location.origin}/protected/${job.id}`} label="Copy share link" />
          {job.market_job_id && (
            <a href={`https://market.near.ai/jobs/${job.market_job_id}`} target="_blank" rel="noreferrer" className="rounded-md border border-rule px-2 py-0.5 text-sm hover:border-ink">
              Open market job ↗
            </a>
          )}
          <a href={d.explorer.contract} target="_blank" rel="noreferrer" className="rounded-md border border-rule px-2 py-0.5 text-sm hover:border-ink">
            Contract on explorer ↗
          </a>
          {role === "Requester" && job.status === "Funded" && (
            <button type="button" onClick={() => setAction(pastDeadline ? "reclaim" : "cancel")} className="rounded-md border border-rule px-2 py-0.5 text-sm hover:border-ink">
              {pastDeadline ? "Reclaim escrow (expired)" : "Cancel & refund"}
            </button>
          )}
        </div>
      </Card>

      <Timeline d={d} juryN={juryN} />

      {loadErr && (
        <p role="status" className="text-sm text-bad">
          {loadErr}
        </p>
      )}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_24rem]">
        <div className="min-w-0 space-y-5">
          {job.status === "Funded" &&
            (role === "Worker" && !pastDeadline ? (
              <SubmitCard job={job} onDone={() => void load()} />
            ) : (
              <Card tone="peach">
                <p className="font-semibold">{pastDeadline ? "The submit deadline passed without a deliverable." : `Waiting for the worker to submit · due ${when(deadline)} (${relative(deadline)})`}</p>
                <p className="mt-1 text-sm">
                  {pastDeadline
                    ? "The requester can reclaim the full escrow, no fee."
                    : !ready
                      ? ""
                      : !accountId
                        ? "Are you the worker? Connect that wallet to submit here."
                        : `Only ${job.worker} can submit.`}
                </p>
                {ready && !accountId && !pastDeadline && (
                  <button type="button" onClick={connect} className="mt-3 rounded-full bg-ink px-4 py-1.5 text-sm font-semibold text-paper">
                    Connect wallet
                  </button>
                )}
              </Card>
            ))}

          {/* jury panel */}
          <section className="relative overflow-hidden rounded-3xl bg-[#12151F] p-5 text-[#EEF0F4] sm:p-6">
            <div aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(80%_90%_at_50%_0%,#1D3BFF55_0%,#1D3BFF00_100%)]" />
            <div className="relative flex flex-wrap items-baseline justify-between gap-2">
              <div>
                <Eyebrow>
                  AI jury · {juryN} of {params ? "the active" : ""} verifiers
                </Eyebrow>
                <h2 className="mt-1 text-xl font-semibold tracking-tight">Independent verdicts, committed then revealed</h2>
              </div>
              {params && (
                <p className="font-mono text-xs opacity-60">
                  Commit {params.commit_secs}s · Reveal {params.reveal_secs}s · majority {Math.floor(juryN / 2) + 1}/{juryN}
                </p>
              )}
            </div>

            {d.jury.length === 0 ? (
              <p className="relative mt-5 rounded-2xl border border-dashed border-white/20 p-5 text-sm opacity-80">
                {job.status === "Funded" ? `${juryN} jurors are drawn at random the moment the work is submitted.` : job.status === "Submitted" ? "Drawing the jury…" : "This job never reached a jury."}
              </p>
            ) : (
              <div className="relative mt-5 grid gap-3 md:grid-cols-3">
                {d.jury.map((j) => (
                  <JurorCard key={j.verifier} j={j} ids={ids} share={s?.shares.find((x) => x.verifier === j.verifier)} judging={job.status === "Committing" || job.status === "Submitted"} onOpen={() => setDrawer(j)} />
                ))}
              </div>
            )}

            {job.reveals.length > 0 && (
              <div className="relative mt-4 flex flex-wrap gap-2">
                {ids.map((cid, i) => {
                  const pass = job.reveals.filter((r) => r.verdicts[i] === 1).length;
                  const res = job.criteria_result[i];
                  const lbl = res !== undefined ? LABEL[res] : null;
                  return (
                    <div key={cid} className="rounded-xl bg-white/5 px-3 py-2 text-xs">
                      <span className="font-mono font-semibold">{cid}</span>{" "}
                      {lbl && <span className={`ml-1 rounded-full px-1.5 py-0.5 text-[0.625rem] font-bold text-[#0D0F14] ${CHIP[lbl]}`}>{lbl}</span>}
                      <p className="mt-0.5 font-mono text-[0.625rem] opacity-60">
                        {pass}/{job.reveals.length} PASS · {job.criteria_kinds[i] === 0 ? "MUST" : "SHOULD"}
                      </p>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {/* criteria */}
          <Card>
            <div className="flex flex-wrap items-baseline justify-between gap-3">
              <h2 className="text-lg font-semibold">Acceptance criteria</h2>
              <VerifyHash jobId={job.id} field="criteria_hash" />
            </div>
            {!d.criteria_verified && <p className="mt-2 text-sm text-bad">The criteria text isn’t stored on this server or doesn’t match the on-chain hash, so only the hash is shown.</p>}
            <ul className="mt-3 divide-y divide-rule">
              {(d.criteria?.criteria ?? []).map((c, i) => {
                const res = job.criteria_result[i];
                const lbl = res !== undefined ? LABEL[res] : null;
                return (
                  <li key={c.id} className="grid grid-cols-[2.5rem_minmax(0,1fr)_auto] items-start gap-3 py-3">
                    <span className="font-mono text-sm font-semibold">{c.id}</span>
                    <div className="min-w-0">
                      <p className="text-sm">{c.text}</p>
                      <p className="mt-1 flex flex-wrap gap-1.5 text-[0.6875rem]">
                        <span className={`rounded-full px-2 py-0.5 font-semibold ${c.kind === "MUST" ? "bg-ink text-paper" : "border border-rule"}`}>{c.kind}</span>
                        <span className="rounded-full border border-rule px-2 py-0.5 text-muted">{c.method === "deterministic" ? "Deterministic" : "AI-judged"}</span>
                      </p>
                    </div>
                    {lbl ? <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold text-[#0D0F14] ${CHIP[lbl]}`}>{lbl}</span> : <span className="text-xs text-muted">–</span>}
                  </li>
                );
              })}
            </ul>
          </Card>

          {/* deliverable */}
          {d.deliverable_meta && (
            <Card>
              <div className="flex flex-wrap items-baseline justify-between gap-3">
                <h2 className="text-lg font-semibold">Deliverable</h2>
                <VerifyHash jobId={job.id} field="deliverable_hash" />
              </div>
              <p className="mt-1 break-all font-mono text-xs text-muted">
                {short(d.deliverable_meta.hash, 10, 8)}
                {d.deliverable_meta.size !== null && ` · ${d.deliverable_meta.size.toLocaleString()} bytes`}
                {d.deliverable_meta.content_type && ` · ${d.deliverable_meta.content_type.split(";")[0]}`}
                {job.submitted_at && ` · submitted ${when(nsMs(job.submitted_at))}`}
              </p>
              {firstEvidence && firstEvidence.prescan.hits.length > 0 && (
                <div className="mt-4 rounded-2xl bg-[#12151F] p-4 text-[#EEF0F4]">
                  <p className="text-sm font-semibold text-[#F98F68]">
                    Pre-scan · {firstEvidence.prescan.hits.length} hit{firstEvidence.prescan.hits.length === 1 ? "" : "s"}
                  </p>
                  <ul className="mt-2 space-y-1.5 font-mono text-xs">
                    {firstEvidence.prescan.hits.map((h, i) => (
                      <li key={i} className="grid grid-cols-[9rem_minmax(0,1fr)_auto] gap-2">
                        <span className="opacity-70">{h.type}</span>
                        <span className="truncate">{h.excerpt}</span>
                        <span className="opacity-50">@{h.offset.toLocaleString()}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {preview !== null ? (
                <div className="mt-4">
                  <pre className={`overflow-hidden whitespace-pre-wrap break-words rounded-2xl bg-paper p-4 font-mono text-xs leading-relaxed ${full ? "" : "max-h-72"}`}>{full ? preview : preview.slice(0, 2400)}</pre>
                  {preview.length > 2400 && (
                    <button type="button" onClick={() => setFull((f) => !f)} className="link mt-2 text-sm">
                      {full ? "Show less" : "Show full deliverable"}
                    </button>
                  )}
                  <p className="mt-2 text-xs text-muted">Shown as plain text, exactly as the jurors received it.</p>
                </div>
              ) : (
                !d.deliverable_meta.available && <p className="mt-3 text-sm text-muted">The deliverable isn’t stored on this Assay server; only its hash is on chain.</p>
              )}
            </Card>
          )}
        </div>

        {/* side */}
        <aside className="space-y-5">
          <Verdict d={d} />

          <Card tone="navy">
            <Eyebrow>{s ? "Settlement" : "Escrow"}</Eyebrow>
            <div className="mt-3 divide-y divide-white/10">
              <Row k="Escrow" v={`${formatNear(job.amount, 4)} Ⓝ`} />
              {job.outcome !== "RefundedNoFee" && fee !== null && <Row k={`Fee${params ? ` · ${params.fee_bps / 100}%` : ""}`} v={`− ${formatNear(fee, 4)} Ⓝ`} />}
              {job.outcome !== "RefundedNoFee" && pool !== null && <Row k={<span className="pl-3">Jury pool</span>} v={`${formatNear(pool, 4)} Ⓝ`} />}
              {job.outcome !== "RefundedNoFee" && fee !== null && pool !== null && <Row k={<span className="pl-3">Treasury</span>} v={`${formatNear(s ? s.to_treasury : fee - pool, 4)} Ⓝ`} />}
              {s ? (
                <>
                  {BigInt(s.to_worker) > 0n && <Row strong k={<span className="text-[#C8F24A]">To worker</span>} v={<span className="text-[#C8F24A]">{formatNear(s.to_worker, 4)} Ⓝ</span>} />}
                  {BigInt(s.to_requester) > 0n && <Row strong k={<span className="text-[#F98F68]">Back to requester</span>} v={<span className="text-[#F98F68]">{formatNear(s.to_requester, 4)} Ⓝ</span>} />}
                </>
              ) : (
                fee !== null && <Row strong k="Net · to worker or back" v={`${formatNear(BigInt(job.amount) - fee, 4)} Ⓝ`} />
              )}
            </div>
            {s && s.shares.length > 0 && (
              <>
                <Eyebrow className="mt-5">Juror shares · by agreement with result</Eyebrow>
                <div className="mt-2 divide-y divide-white/10">
                  {s.shares.map((x) => (
                    <Row key={x.verifier} k={<span className="font-mono">{verifierName(x.verifier)}</span>} v={`${x.agree}/${ids.length} · ${formatNear(x.amount, 4)}`} />
                  ))}
                </div>
              </>
            )}
          </Card>

          {role && claimable !== null && (
            <Card tone="lime">
              <Eyebrow>Your claimable</Eyebrow>
              <p className="mt-1 text-4xl font-semibold tracking-tight">
                {formatNear(claimable, 4)} <span className="font-mono text-sm">Ⓝ</span>
              </p>
              <p className="mt-1 text-xs opacity-75">Pull payment: funds stay in the contract until you withdraw (all jobs combined).</p>
              <Link href="/account" className="mt-3 inline-block rounded-full bg-[#0D0F14] px-4 py-1.5 text-sm font-semibold text-[#EEF0F4]">
                Withdraw on My account
              </Link>
            </Card>
          )}

          <JuryLog d={d} />
        </aside>
      </div>

      {drawer && <EvidenceDrawer job={job} juror={drawer} criteria={d.criteria?.criteria ?? null} evidence={drawer.evidence_sha ? evidence[drawer.evidence_sha] : null} onClose={() => setDrawer(null)} />}

      {action && (
        <TxModal
          open
          title={action === "cancel" ? `Cancel job #${job.id}` : `Reclaim job #${job.id}`}
          rows={[
            ["Contract call", action === "cancel" ? "cancel_job" : "reclaim_expired"],
            ["Escrow", `${formatNear(job.amount, 4)} Ⓝ`],
            ["Refund goes to", `${job.requester} (claimable)`],
          ]}
          confirmLabel={action === "cancel" ? "Cancel job" : "Reclaim escrow"}
          run={() => call({ method: action === "cancel" ? "cancel_job" : "reclaim_expired", args: { job_id: job.id } }) as Promise<Outcome | null>}
          done={() => <p className="rounded-2xl bg-[#C8F24A] p-4 font-semibold text-[#0D0F14]">The escrow is back in your claimable balance. Withdraw it on My account.</p>}
          onClose={() => {
            setAction(null);
            void load();
          }}
        />
      )}
    </div>
  );
}

function Meta({ k, v }: { k: string; v: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="font-mono text-[0.6875rem] uppercase tracking-[0.12em] text-muted">{k}</dt>
      <dd className="mt-1 truncate">{v}</dd>
    </div>
  );
}

function AccountLink({ id, me }: { id: string; me: string | null }) {
  return (
    <a href={accountUrl(id)} target="_blank" rel="noreferrer" title={id} className="font-mono text-[0.8125rem] hover:underline">
      {id}
      {me === id && <span className="ml-1.5 rounded-full bg-[#C8F24A] px-1.5 font-sans text-[0.625rem] font-bold text-[#0D0F14]">you</span>}
    </a>
  );
}

function Timeline({ d, juryN }: { d: Detail; juryN: number }) {
  const j = d.job;
  const order = { Funded: 1, Submitted: 2, Committing: 2, Stalled: 2, Settled: 4, Cancelled: 4, Expired: 4 } as const;
  const reached = order[j.status];
  const judging = j.jury.length > 0;
  const steps: [string, string, string | null][] = [
    ["Funded", when(nsMs(j.created_at)), null],
    ["Submitted", j.submitted_at ? when(nsMs(j.submitted_at)) : `due ${when(nsMs(j.submit_deadline))}`, null],
    [j.status === "Stalled" ? "Stalled" : "Judging", judging ? `${j.commits.length}/${juryN} commits · ${j.reveals.length}/${juryN} reveals` : "jury drawn on submit", judging ? `reveal by ${when(nsMs(j.reveal_deadline))}` : null],
    [j.status === "Settled" ? `Settled · ${uiStatus(j)}` : j.status === "Cancelled" || j.status === "Expired" ? j.status : "Settled", j.status === "Settled" ? "pull payment" : j.status === "Cancelled" || j.status === "Expired" ? "refunded, no fee" : "released or refunded", null],
  ];
  const done = (i: number) => (j.status === "Cancelled" || j.status === "Expired" ? i === 0 || i === 3 : i < reached || (i === 2 && j.status === "Settled") || (i === 1 && !!j.submitted_at));
  const active = (i: number) => !FINAL.has(j.status) && !done(i) && (i === reached - 1 || (i === 2 && reached === 2));
  return (
    <ol className="grid gap-2 sm:grid-cols-4">
      {steps.map(([name, sub, sub2], i) => (
        <li key={i} className={`rounded-2xl border p-4 ${done(i) ? "border-transparent bg-[#12151F] text-[#EEF0F4]" : active(i) ? "border-ink bg-surface" : "border-dashed border-rule bg-surface/60 text-muted"}`}>
          <div className="flex items-center gap-2">
            <span className={`grid size-5 place-items-center rounded-full text-[0.625rem] font-bold ${done(i) ? "bg-[#C8F24A] text-[#0D0F14]" : active(i) ? "animate-pulse bg-[#1D3BFF] text-white" : "border border-rule"}`}>{done(i) ? "✓" : i + 1}</span>
            <span className="font-semibold">{name}</span>
          </div>
          <p className="mt-1 font-mono text-xs opacity-70">{sub}</p>
          {sub2 && <p className="font-mono text-xs opacity-50">{sub2}</p>}
        </li>
      ))}
    </ol>
  );
}

function JurorCard({ j, ids, share, judging, onOpen }: { j: JurorView; ids: string[]; share?: { agree: number; amount: string }; judging: boolean; onOpen: () => void }) {
  const rank = { pending: 0, judged: 1, committed: 2, revealed: 3, failed: -1 }[j.phase];
  const steps = ["Judging", "Committed", "Revealed"];
  return (
    <article className="flex flex-col rounded-2xl bg-white/[0.06] p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-mono text-sm font-semibold">{verifierName(j.verifier)}</p>
          <p className="truncate text-sm" title={j.model ?? undefined}>
            {modelName(j.model)}
          </p>
          <p className="font-mono text-[0.625rem] opacity-50">{j.provider ?? "–"}</p>
        </div>
        {j.attested && <span className="shrink-0 rounded-full bg-[#C8F24A] px-2 py-0.5 text-[0.625rem] font-bold text-[#0D0F14]">Attested ✓</span>}
      </div>
      <ol className="mt-3 flex gap-1 text-[0.625rem]">
        {steps.map((name, i) => {
          const isDone = rank >= i + 1 || (i === 0 && rank >= 1);
          const isNow = !isDone && rank === i && judging;
          return (
            <li key={name} className={`flex-1 rounded-full px-1.5 py-1 text-center ${isDone ? "bg-[#C8F24A] font-semibold text-[#0D0F14]" : isNow ? "animate-pulse bg-[#1D3BFF] text-white" : "bg-white/10 opacity-60"}`}>
              {name}
            </li>
          );
        })}
      </ol>
      {j.phase === "failed" && <p className="mt-2 text-xs text-[#F98F68]">{j.error ?? "This juror failed to judge."}</p>}
      {j.verdicts ? (
        <div className="mt-3 flex flex-wrap gap-1">
          {j.verdicts.map((v, i) => (
            <span key={i} title={`${ids[i] ?? `C${i}`}: ${v}`} className={`rounded-md px-1.5 py-0.5 font-mono text-[0.625rem] font-semibold text-[#0D0F14] ${CHIP[v]}`}>
              {ids[i] ?? `C${i}`}
            </span>
          ))}
        </div>
      ) : (
        <p className="mt-3 text-xs opacity-60">{j.committed ? "Vote sealed until the reveal window." : "Reading the deliverable…"}</p>
      )}
      <p className="mt-3 text-xs opacity-80">
        {j.injection_flag ? <span className="font-semibold text-[#F98F68]">Flagged injection</span> : j.revealed ? "No injection flagged" : ""}
        {share && ` · earned ${formatNear(share.amount, 4)} Ⓝ`}
      </p>
      <div className="mt-auto flex flex-wrap gap-2 pt-3 text-xs">
        <button type="button" onClick={onOpen} disabled={!j.evidence_available} className="rounded-full border border-white/25 px-2.5 py-1 hover:border-white/70 disabled:opacity-40">
          View evidence
        </button>
        {j.reveal_tx && (
          <a href={txUrl(j.reveal_tx)} target="_blank" rel="noreferrer" className="rounded-full border border-white/25 px-2.5 py-1 hover:border-white/70">
            Reveal tx ↗
          </a>
        )}
      </div>
    </article>
  );
}

function Verdict({ d }: { d: Detail }) {
  const j = d.job;
  const must = j.criteria_kinds.map((k, i) => (k === 0 ? i : -1)).filter((i) => i >= 0);
  const failedMust = must.filter((i) => j.criteria_result[i] !== undefined && j.criteria_result[i] !== 1);
  const ids = d.criteria?.criteria.map((c) => c.id) ?? j.criteria_kinds.map((_, i) => `C${i}`);
  let tone = "bg-[#BDE5F7]";
  let head = "Pending";
  let body: string;
  if (j.status === "Settled") {
    const passCount = j.criteria_result.filter((x) => x === 1).length;
    if (j.outcome === "Released") {
      tone = "bg-[#C8F24A]";
      head = "Released";
      body = `Every MUST criterion passed (${passCount}/${j.criteria_result.length} criteria overall). The worker’s payout is claimable.`;
    } else if (j.outcome === "RefundedNoFee") {
      tone = "bg-[#F98F68]";
      head = "Refunded";
      body = "Refunded in full with no fee: the jury didn’t reach a result in time.";
    } else if (j.outcome === "Split") {
      tone = "bg-[#A9C3A9]";
      head = "Split";
      body = `Partial payout: ${passCount} of ${j.criteria_result.length} criteria passed.`;
    } else {
      tone = "bg-[#F98F68]";
      head = "Refunded";
      const first = failedMust[0];
      body =
        first !== undefined
          ? `MUST criterion ${ids[first]} failed — ${j.reveals.filter((r) => r.verdicts[first] === 1).length} of ${j.reveals.length} jurors voted PASS.${j.injection_flagged ? " The jury flagged hidden instructions to evaluators." : ""}`
          : "The escrow went back to the requester, minus the jury fee.";
    }
  } else if (j.status === "Cancelled") {
    head = "Cancelled";
    body = "The requester cancelled before a submission. Refunded in full, no fee.";
  } else if (j.status === "Expired") {
    head = "Expired";
    body = "No deliverable by the deadline. Refunded in full, no fee.";
  } else if (j.status === "Stalled") {
    tone = "bg-[#F98F68]";
    head = "Stalled";
    body = "Too few jurors revealed in time. The keeper restarts judging with a fresh jury.";
  } else {
    body = j.status === "Funded" ? "Waiting for the deliverable." : "The jury is judging. Votes are sealed until every juror has committed.";
  }
  return (
    <section className={`rounded-3xl p-5 text-[#0D0F14] sm:p-6 ${tone}`}>
      <Eyebrow>Verdict</Eyebrow>
      <p className="mt-1 text-[2.5rem] font-semibold leading-none tracking-[-0.03em]">{head}</p>
      <p className="mt-3 text-sm">{body}</p>
    </section>
  );
}

function JuryLog({ d }: { d: Detail }) {
  const j = d.job;
  const rows: [string, string, string | null][] = [];
  if (j.settlement && j.status === "Settled") rows.push(["job_settled", `${uiStatus(j)} · fee ${formatNear(j.settlement.fee, 4)} Ⓝ`, null]);
  for (const r of [...j.reveals].reverse()) rows.push(["vote_revealed", `${verifierName(r.verifier)} · inj=${r.injection_flag ? 1 : 0} · evidence ${r.evidence_hash.slice(0, 4)}…`, d.jury.find((x) => x.verifier === r.verifier)?.reveal_tx ?? null]);
  if (j.commits.length) rows.push(["vote_committed", `${j.commits.length}/${j.jury.length} committed${j.commits.length === j.jury.length ? " · reveal opened" : ""}`, null]);
  if (j.jury.length) rows.push(["jury_selected", `${j.jury.map(verifierName).join(", ")} · restarts ${j.restarts}`, null]);
  if (j.submitted_at) rows.push(["deliverable_submitted", when(nsMs(j.submitted_at)), null]);
  if (j.status === "Cancelled") rows.unshift(["job_cancelled", "refunded, no fee", null]);
  if (j.status === "Expired") rows.unshift(["job_expired", "refunded, no fee", null]);
  rows.push(["job_created", when(nsMs(j.created_at)), null]);
  return (
    <Card>
      <div className="flex items-baseline justify-between">
        <h2 className="font-semibold">Jury log</h2>
        <span className="font-mono text-xs text-muted">{FINAL.has(j.status) ? "Final" : "Live"}</span>
      </div>
      <ol className="mt-3 space-y-2.5 border-l border-rule pl-4">
        {rows.map(([ev, detail, tx], i) => (
          <li key={i} className="relative">
            <span aria-hidden className={`absolute -left-[1.3rem] top-1.5 size-2 rounded-full ${i === 0 ? "bg-[#1D3BFF]" : "bg-ink/40"}`} />
            <p className="font-mono text-xs font-semibold">{ev}</p>
            <p className="text-xs text-muted">
              {detail}
              {tx && (
                <a href={txUrl(tx)} target="_blank" rel="noreferrer" className="link ml-1.5">
                  tx ↗
                </a>
              )}
            </p>
          </li>
        ))}
      </ol>
    </Card>
  );
}
