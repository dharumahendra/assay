"use client";

/**
 * /protected/[id]: one protected job, live (T6.3, 07 §2.9, page-design "09 Protected Job Detail").
 * Polls the Assay API while the job is moving; the jury panel shows each juror's phase, model,
 * attestation and verdicts; the worker can submit from here; every hash can be re-checked in the browser.
 */
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { ContractParams, Evidence, JurorView } from "@juri/shared";
import { CopyButton } from "@/components/copy-button";
import { ArrowUpRight, Braces, Check, Clock, Close, Eye, Key, Shield, Spark, Undo, User } from "@/components/icons";
import { ProtectedStatusPill } from "@/components/status";
import { TxModal } from "@/components/tx-modal";
import { Bleed, PrimaryLink, ghostBtn } from "@/components/ui";
import { useWallet } from "@/components/wallet";
import { Card, Eyebrow } from "@/components/wizard/ui";
import { accountUrl, formatNear, mulBps, txUrl, view, type Outcome } from "@/lib/wallet/near";
import { EvidenceDrawer } from "./evidence-drawer";
import { FINAL, modelName, nsMs, relative, short, uiStatus, verifierName, when, type Detail } from "./lib";
import { SubmitCard } from "./submit-card";
import { VerifyHash } from "./verify-hash";

const LABEL = ["FAIL", "PASS", "UNSURE"] as const;
const CHIP: Record<string, string> = { PASS: "bg-lime", FAIL: "bg-salmon", UNSURE: "bg-peach" };
/** Juror badge colours, in jury order (v1 lime, v2 sky, v4 peach in the frame). */
const BADGE = ["bg-lime", "bg-sky", "bg-peach", "bg-sage", "bg-steel"];

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
      <Card className="mx-auto mt-10 max-w-xl text-center">
        <h1 className="display text-[2rem]">Protected job #{id} doesn’t exist</h1>
        <p className="mt-2 text-muted">The contract has no job with this id.</p>
        <Link href="/protected" className="link mt-4 inline-block">
          All protected jobs
        </Link>
      </Card>
    );
  if (!d || !job)
    return loadErr ? (
      <p role="alert" className="mt-8 rounded-[1.75rem] bg-salmon/35 p-6">
        {loadErr}
      </p>
    ) : (
      <div className="mt-8 space-y-5">
        <div className="skeleton h-40 rounded-[1.75rem]" />
        <div className="skeleton h-96 rounded-[1.75rem]" />
      </div>
    );

  const title = d.criteria?.source.title || `Protected job #${job.id}`;
  const deadline = nsMs(job.submit_deadline)!;
  const pastDeadline = deadline < Date.now();
  const juryN = job.jury.length || params?.jury_size || 3;

  return (
    <div className="space-y-5">
      {/* head */}
      <header className="relative isolate pb-3 pt-2 sm:pt-6">
        <Bleed className="-top-48 bottom-[-4rem] bg-lattice [mask-image:linear-gradient(to_bottom,#000_65%,transparent)]" />
        <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-sm text-muted">
          <Link href="/protected" className="hover:text-ink">
            Protected Jobs
          </Link>
          <span aria-hidden>›</span>
          <span className="font-mono text-ink">#{job.id}</span>
        </nav>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <ProtectedStatusPill job={job} />
          {job.injection_flagged && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-ink px-2.5 py-1 text-[0.8125rem] font-semibold leading-none text-white">
              <Shield size={12} /> Injection attempt detected
            </span>
          )}
          {role && (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-rule bg-surface px-2.5 py-1 text-[0.8125rem] font-semibold leading-none">
              <User size={12} /> Viewing as {role}
            </span>
          )}
          {!FINAL.has(job.status) && (
            <span className="inline-flex items-center gap-1.5 text-xs text-muted">
              <span className="size-1.5 animate-pulse rounded-full bg-act" /> live
            </span>
          )}
        </div>
        <div className="mt-4 flex flex-wrap items-end justify-between gap-x-10 gap-y-6">
          <div className="min-w-0 max-w-[46rem]">
            <h1 className="display text-[2.2rem] leading-[1] sm:text-[3rem]">{title}</h1>
            {d.criteria?.summary && <p className="mt-3 max-w-[62ch] text-muted">{d.criteria.summary}</p>}
            <dl className="mt-5 flex flex-wrap gap-x-8 gap-y-3">
              <Meta k="Requester" v={<AccountLink id={job.requester} me={accountId} />} />
              <Meta k="Worker" v={<AccountLink id={job.worker} me={accountId} />} />
              <Meta k="Payout" v={job.payout_mode === "Binary" ? "All-or-nothing" : `Graded · base ${job.payout_mode.Partial.base_pct}%`} />
            </dl>
          </div>
          <div className="flex flex-col items-end gap-3">
            <p className="eyebrow text-faint">Escrow</p>
            <p className="display -mt-2 text-[3.6rem] leading-none sm:text-[4.6rem]">
              {formatNear(job.amount, 2)}
              <span className="ml-1.5 font-mono text-base font-normal tracking-normal text-muted">NEAR</span>
            </p>
            <div className="flex flex-wrap justify-end gap-2">
              <CopyButton text={typeof window === "undefined" ? "" : `${window.location.origin}/protected/${job.id}`} label="Copy share link" className={ghostBtn} />
              {job.market_job_id && (
                <a href={`https://market.near.ai/jobs/${job.market_job_id}`} target="_blank" rel="noreferrer" className={ghostBtn}>
                  <ArrowUpRight size={14} /> Open market job
                </a>
              )}
              <a href={d.explorer.contract} target="_blank" rel="noreferrer" className={ghostBtn}>
                <ArrowUpRight size={14} /> Contract
              </a>
              {role === "Requester" && job.status === "Funded" && (
                <button type="button" onClick={() => setAction(pastDeadline ? "reclaim" : "cancel")} className={ghostBtn}>
                  <Undo size={14} /> {pastDeadline ? "Reclaim escrow (expired)" : "Cancel & refund"}
                </button>
              )}
            </div>
          </div>
        </div>
      </header>

      <Timeline d={d} juryN={juryN} />

      {loadErr && (
        <p role="status" className="text-sm text-bad">
          {loadErr}
        </p>
      )}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_25rem]">
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
                  <button type="button" onClick={connect} className="mt-3 rounded-full bg-ink px-4 py-2 text-sm font-semibold text-white">
                    Connect wallet
                  </button>
                )}
              </Card>
            ))}

          {/* jury panel */}
          <section className="relative overflow-hidden rounded-[1.75rem] bg-navy p-5 text-paper sm:p-7">
            <div aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(90%_80%_at_20%_0%,#1d3bff40_0%,#1d3bff00_100%)]" />
            <div className="relative">
              {params && (
                <p className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1 font-mono text-xs text-white/80">
                  <Clock size={12} className="text-lime" />
                  Commit {params.commit_secs}s · Reveal {params.reveal_secs}s · majority {Math.floor(juryN / 2) + 1}/{juryN}
                </p>
              )}
              <h2 className="display mt-3 text-[1.6rem] sm:text-[1.9rem]">AI Jury — independent verdicts, committed then revealed</h2>
            </div>

            {d.jury.length === 0 ? (
              <p className="relative mt-5 rounded-2xl border border-dashed border-white/20 p-5 text-sm opacity-80">
                {job.status === "Funded" ? `${juryN} jurors are drawn at random the moment the work is submitted.` : job.status === "Submitted" ? "Drawing the jury…" : "This job never reached a jury."}
              </p>
            ) : (
              <div className="relative mt-5 grid gap-3 md:grid-cols-3">
                {d.jury.map((j, k) => (
                  <JurorCard
                    key={j.verifier}
                    j={j}
                    badge={BADGE[k % BADGE.length]!}
                    ids={ids}
                    share={job.settlement?.shares.find((x) => x.verifier === j.verifier)}
                    judging={job.status === "Committing" || job.status === "Submitted"}
                    onOpen={() => setDrawer(j)}
                  />
                ))}
              </div>
            )}

            {job.reveals.length > 0 && (
              <div className="relative mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
                {ids.map((cid, i) => {
                  const pass = job.reveals.filter((r) => r.verdicts[i] === 1).length;
                  const res = job.criteria_result[i];
                  const lbl = res !== undefined ? LABEL[res] : null;
                  const fail = lbl === "FAIL";
                  return (
                    <div key={cid} className={`rounded-2xl px-3.5 py-3 ${fail ? "bg-salmon text-ink" : "bg-white/[0.06]"}`}>
                      <div className="flex items-center justify-between font-mono text-xs opacity-80">
                        {cid}
                        {lbl === "PASS" ? <Check size={13} className="text-lime" /> : fail ? <Close size={12} /> : null}
                      </div>
                      <p className="display mt-1 text-[1.3rem]">{lbl ?? "–"}</p>
                      <p className="mt-0.5 text-[0.6875rem] opacity-70">
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
            <div className="flex flex-wrap items-start justify-between gap-3 border-b border-rule pb-4">
              <h2 className="display text-[1.5rem]">Acceptance criteria</h2>
              <VerifyHash jobId={job.id} field="criteria_hash" hash={job.criteria_hash} />
            </div>
            {!d.criteria_verified && <p className="mt-3 text-sm text-bad">The criteria text isn’t stored on this server or doesn’t match the on-chain hash, so only the hash is shown.</p>}
            <ul className="divide-y divide-rule">
              {(d.criteria?.criteria ?? []).map((c, i) => {
                const res = job.criteria_result[i];
                const lbl = res !== undefined ? (LABEL[res] ?? null) : null;
                return (
                  <li key={c.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 py-4">
                    <span className="w-6 font-mono text-xs text-faint">{c.id}</span>
                    <p className="min-w-0 flex-1 basis-64">{c.text}</p>
                    <span className="flex items-center gap-2">
                      <span className={`rounded-md px-2 py-1 text-[0.6875rem] font-bold leading-none ${c.kind === "MUST" ? "bg-ink text-white" : ""}`}>{c.kind}</span>
                      <span className="inline-flex items-center gap-1 rounded-md border border-rule px-2 py-1 text-[0.6875rem] leading-none text-muted">
                        {c.method === "deterministic" ? <Braces size={11} /> : <Spark size={11} />}
                        {c.method === "deterministic" ? "Deterministic" : "AI-judged"}
                      </span>
                      <ResultPill lbl={lbl} />
                    </span>
                  </li>
                );
              })}
            </ul>
          </Card>

          {/* deliverable */}
          {d.deliverable_meta && (
            <Card>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <h2 className="display text-[1.5rem]">Deliverable</h2>
                <VerifyHash jobId={job.id} field="deliverable_hash" hash={d.deliverable_meta.hash} />
              </div>
              <p className="mt-2 break-all font-mono text-xs text-muted">
                {d.deliverable_meta.uri ?? short(d.deliverable_meta.hash, 10, 8)}
                {d.deliverable_meta.content_type && ` · ${d.deliverable_meta.content_type.split(";")[0]}`}
                {d.deliverable_meta.size !== null && ` · ${d.deliverable_meta.size.toLocaleString()} bytes`}
                {job.submitted_at && ` · submitted ${when(nsMs(job.submitted_at))}`}
              </p>
              {firstEvidence && firstEvidence.prescan.hits.length > 0 && (
                <div className="mt-4 rounded-2xl bg-ink p-4 text-paper sm:p-5">
                  <p className="flex items-center gap-2 font-semibold">
                    <Shield size={15} className="text-salmon" />
                    Injection attempt detected · {firstEvidence.prescan.hits.length} pre-scan hit{firstEvidence.prescan.hits.length === 1 ? "" : "s"}
                  </p>
                  <ul className="mt-3 space-y-2 font-mono text-xs">
                    {firstEvidence.prescan.hits.map((h, i) => (
                      <li key={i} className="grid grid-cols-[8.5rem_minmax(0,1fr)_auto] gap-3 rounded-xl bg-white/[0.06] px-3 py-2.5">
                        <span className="text-salmon">{h.type}</span>
                        <span className="truncate">{h.excerpt}</span>
                        <span className="opacity-50">offset {h.offset.toLocaleString()}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {preview !== null ? (
                <div className="mt-4 rounded-2xl bg-surface-2 p-4 sm:p-5">
                  <pre className={`overflow-hidden whitespace-pre-wrap break-words font-mono text-xs leading-relaxed ${full ? "" : "max-h-72"}`}>{full ? preview : preview.slice(0, 2400)}</pre>
                  {preview.length > 2400 && (
                    <button type="button" onClick={() => setFull((f) => !f)} className="mt-3 text-sm font-semibold text-act hover:underline">
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
          <Verdict d={d} params={params} ids={ids} />

          {role && claimable !== null && (
            <Card>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="eyebrow text-faint">Your claimable</p>
                  <p className="display mt-1 text-[2.2rem] leading-none">
                    {formatNear(claimable, 4)} <span className="font-mono text-base font-normal">Ⓝ</span>
                  </p>
                </div>
                <PrimaryLink href="/account">Withdraw</PrimaryLink>
              </div>
              <p className="mt-3 text-xs text-muted">Pull payment · funds stay in the contract until you withdraw (all jobs combined).</p>
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
          done={() => <p className="rounded-2xl bg-lime p-4 font-semibold text-ink">The escrow is back in your claimable balance. Withdraw it on My account.</p>}
          onClose={() => {
            setAction(null);
            void load();
          }}
        />
      )}
    </div>
  );
}

function ResultPill({ lbl }: { lbl: (typeof LABEL)[number] | null }) {
  if (!lbl) return <span className="w-[4.5rem] text-center text-xs text-faint">–</span>;
  return (
    <span className={`inline-flex w-[4.5rem] items-center justify-center gap-1 rounded-full py-1.5 text-xs font-bold leading-none text-ink ${CHIP[lbl]}`}>
      {lbl === "PASS" ? <Check size={11} /> : lbl === "FAIL" ? <Close size={10} /> : null}
      {lbl}
    </span>
  );
}

function Meta({ k, v }: { k: string; v: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="eyebrow text-faint">{k}</dt>
      <dd className="mt-1 truncate text-sm">{v}</dd>
    </div>
  );
}

function AccountLink({ id, me }: { id: string; me: string | null }) {
  return (
    <a href={accountUrl(id)} target="_blank" rel="noreferrer" title={id} className="font-mono text-[0.8125rem] hover:underline">
      {id}
      {me === id && <span className="ml-1.5 rounded-full bg-lime px-1.5 font-sans text-[0.625rem] font-bold text-ink">you</span>}
    </a>
  );
}

function Timeline({ d, juryN }: { d: Detail; juryN: number }) {
  const j = d.job;
  const order = { Funded: 1, Submitted: 2, Committing: 2, Stalled: 2, Settled: 4, Cancelled: 4, Expired: 4 } as const;
  const reached = order[j.status];
  const judging = j.jury.length > 0;
  const steps: [string, ReactNode][] = [
    ["Funded", when(nsMs(j.created_at))],
    ["Submitted", j.submitted_at ? when(nsMs(j.submitted_at)) : `due ${when(nsMs(j.submit_deadline))}`],
    [
      j.status === "Stalled" ? "Stalled" : "Judging",
      judging ? (
        <>
          <span className="text-act">
            {j.commits.length}/{juryN} commits · {j.reveals.length}/{juryN} reveals
          </span>
        </>
      ) : (
        "jury drawn on submit"
      ),
    ],
    [
      j.status === "Settled" ? `Settled · ${uiStatus(j)}` : j.status === "Cancelled" || j.status === "Expired" ? j.status : "Settled",
      j.status === "Settled" ? "pull payment" : j.status === "Cancelled" || j.status === "Expired" ? "refunded, no fee" : "released or refunded",
    ],
  ];
  const done = (i: number) => (j.status === "Cancelled" || j.status === "Expired" ? i === 0 || i === 3 : i < reached || (i === 2 && j.status === "Settled") || (i === 1 && !!j.submitted_at));
  const active = (i: number) => !FINAL.has(j.status) && !done(i) && (i === reached - 1 || (i === 2 && reached === 2));
  const refunded = j.status === "Settled" && j.outcome !== "Released" && j.outcome !== "Split";
  return (
    <ol className="grid gap-4 rounded-[1.75rem] bg-surface px-5 py-5 shadow-[0_10px_30px_-20px_rgb(13_15_20/0.35)] sm:grid-cols-4 sm:px-7">
      {steps.map(([name, sub], i) => {
        const last = i === 3;
        const dot = done(i)
          ? last && refunded
            ? "bg-salmon text-ink"
            : "bg-ink text-white"
          : active(i)
            ? "animate-pulse bg-act text-white"
            : "border border-dashed border-rule text-faint";
        return (
          <li key={i} className="flex min-w-0 items-start gap-3">
            <span className={`grid size-7 shrink-0 place-items-center rounded-full text-xs font-bold ${dot}`}>
              {done(i) ? last && refunded ? <Undo size={13} /> : <Check size={13} /> : i + 1}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-3">
                <span className={`font-semibold ${done(i) || active(i) ? "" : "text-muted"}`}>{name}</span>
                {!last && <span aria-hidden className="hidden h-px flex-1 bg-ink/60 lg:block" />}
              </div>
              <p className="mt-0.5 truncate font-mono text-[0.6875rem] text-muted">{sub}</p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function JurorCard({
  j,
  badge,
  ids,
  share,
  judging,
  onOpen,
}: {
  j: JurorView;
  badge: string;
  ids: string[];
  share?: { agree: number; amount: string };
  judging: boolean;
  onOpen: () => void;
}) {
  const rank = { pending: 0, judged: 1, committed: 2, revealed: 3, failed: -1 }[j.phase];
  const steps = ["Waiting", "Judging", "Committed", "Revealed"];
  const name = verifierName(j.verifier) ?? j.verifier;
  return (
    <article className="flex flex-col rounded-2xl bg-surface p-4 text-ink">
      <div className="flex items-center gap-3">
        <span className={`grid size-11 shrink-0 place-items-center rounded-xl font-mono text-sm font-bold ${badge}`}>{name.slice(0, 3)}</span>
        <div className="min-w-0">
          <p className="truncate font-mono text-[0.8125rem] font-semibold" title={j.verifier}>
            {j.verifier}
          </p>
          <p className="truncate text-xs text-muted" title={j.model ?? undefined}>
            {modelName(j.model)} · {j.provider ?? "–"}
          </p>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {j.attested && (
          <span className="inline-flex items-center gap-1 rounded-full bg-lime px-2 py-1 text-[0.6875rem] font-semibold leading-none">
            <Shield size={11} /> Attested <Check size={10} />
          </span>
        )}
        {j.revealed && (
          <span className="inline-flex items-center gap-1 rounded-full border border-rule px-2 py-1 text-[0.6875rem] font-semibold leading-none">
            <Eye size={11} /> Revealed
          </span>
        )}
      </div>
      <ol className="mt-3 grid grid-cols-4 gap-1">
        {steps.map((s, i) => {
          const isDone = rank >= i;
          const isNow = !isDone && rank === i - 1 && judging;
          return (
            <li key={s} className="text-center">
              <span className={`block h-1 rounded-full ${isDone ? "bg-ink" : isNow ? "animate-pulse bg-act" : "bg-rule"}`} />
              <span className="mt-1.5 block text-[0.625rem] text-faint">{s}</span>
            </li>
          );
        })}
      </ol>
      {j.phase === "failed" && <p className="mt-2 text-xs text-bad">{j.error ?? "This juror failed to judge."}</p>}
      {j.verdicts ? (
        <div className="mt-3 grid grid-cols-5 gap-1">
          {j.verdicts.map((v, i) => (
            <span key={i} title={`${ids[i] ?? `C${i}`}: ${v}`} className={`rounded-md px-1 py-1 text-center font-mono text-[0.625rem] font-semibold leading-tight ${CHIP[v]}`}>
              <span className="block opacity-70">{ids[i] ?? `C${i}`}</span>
              {v}
            </span>
          ))}
        </div>
      ) : (
        <p className="mt-3 text-xs text-muted">{j.committed ? "Vote sealed until the reveal window." : "Reading the deliverable…"}</p>
      )}
      {(j.revealed || share) && (
        <p className="mt-3 flex items-start gap-2 rounded-xl bg-surface-2 px-3 py-2 font-mono text-[0.6875rem]">
          <Shield size={12} className="mt-0.5 shrink-0" />
          <span>
            {j.injection_flag ? "Flagged injection" : "No injection flagged"}
            {share && ` · earned ${formatNear(share.amount, 4)} Ⓝ`}
          </span>
        </p>
      )}
      <div className="mt-auto flex flex-wrap gap-1.5 pt-3 text-xs">
        <button type="button" onClick={onOpen} disabled={!j.evidence_available} className="inline-flex items-center gap-1 rounded-full border border-rule px-2.5 py-1.5 font-medium hover:border-ink disabled:opacity-40">
          <Braces size={12} /> View evidence
        </button>
        {j.reveal_tx && (
          <a href={txUrl(j.reveal_tx)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-full border border-rule px-2.5 py-1.5 font-medium hover:border-ink">
            <Key size={12} /> Reveal tx
          </a>
        )}
      </div>
    </article>
  );
}

function Verdict({ d, params, ids }: { d: Detail; params: ContractParams | null; ids: string[] }) {
  const j = d.job;
  const s = j.settlement;
  const must = j.criteria_kinds.map((k, i) => (k === 0 ? i : -1)).filter((i) => i >= 0);
  const failedMust = must.filter((i) => j.criteria_result[i] !== undefined && j.criteria_result[i] !== 1);
  let tone = "bg-sky";
  let head = "Pending";
  let icon: ReactNode = <Clock size={30} />;
  let body: string;
  if (j.status === "Settled") {
    const passCount = j.criteria_result.filter((x) => x === 1).length;
    if (j.outcome === "Released") {
      tone = "bg-lime";
      head = "Released";
      icon = <Check size={32} />;
      body = `Every MUST criterion passed (${passCount}/${j.criteria_result.length} criteria overall). The worker’s payout is claimable.`;
    } else if (j.outcome === "RefundedNoFee") {
      tone = "bg-salmon";
      head = "Refunded";
      icon = <Undo size={32} />;
      body = "Refunded in full with no fee: the jury didn’t reach a result in time.";
    } else if (j.outcome === "Split") {
      tone = "bg-sage";
      head = "Split";
      body = `Partial payout: ${passCount} of ${j.criteria_result.length} criteria passed.`;
    } else {
      tone = "bg-salmon";
      head = "Refunded";
      icon = <Undo size={32} />;
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
    tone = "bg-salmon";
    head = "Stalled";
    body = "Too few jurors revealed in time. The keeper restarts judging with a fresh jury.";
  } else {
    body = j.status === "Funded" ? "Waiting for the deliverable." : "The jury is judging. Votes are sealed until every juror has committed.";
  }

  const fee = s ? BigInt(s.fee) : params ? mulBps(BigInt(j.amount), params.fee_bps) : null;
  const pool = s ? BigInt(s.jury_pool) : fee !== null && params ? mulBps(fee, params.jury_share_bps) : null;
  const noFee = j.outcome === "RefundedNoFee" || j.status === "Cancelled" || j.status === "Expired";
  const maxShare = s ? Math.max(1, ...s.shares.map((x) => Number(BigInt(x.amount)))) : 1;

  return (
    <section className={`rounded-[1.75rem] p-5 text-ink sm:p-6 ${tone}`}>
      <Eyebrow>Verdict</Eyebrow>
      <p className="display mt-2 flex items-center gap-2 text-[2.6rem] leading-none">
        {icon}
        {head}
      </p>
      <p className="mt-3 text-sm">{body}</p>

      <dl className="mt-5 rounded-2xl bg-white/50 px-4 py-2 text-sm">
        <Line k="Escrow" v={formatNear(j.amount, 4)} />
        {!noFee && fee !== null && <Line k={`Fee${params ? ` · ${params.fee_bps / 100}%` : ""}`} v={`− ${formatNear(fee, 4)}`} />}
        {!noFee && pool !== null && <Line k={<span className="pl-2">Jury pool{params ? ` · ${params.jury_share_bps / 100}%` : ""}</span>} v={formatNear(pool, 4)} />}
        {!noFee && fee !== null && pool !== null && <Line k={<span className="pl-2">Treasury</span>} v={formatNear(s ? s.to_treasury : fee - pool, 4)} />}
        {s ? (
          <>
            {BigInt(s.to_worker) > 0n && <Line strong k="Net to worker" v={formatNear(s.to_worker, 4)} />}
            {BigInt(s.to_requester) > 0n && <Line strong k="Net to requester" v={formatNear(s.to_requester, 4)} />}
          </>
        ) : (
          fee !== null && <Line strong k="Net · to worker or back" v={formatNear(noFee ? BigInt(j.amount) : BigInt(j.amount) - fee, 4)} />
        )}
      </dl>

      {s && s.shares.length > 0 && (
        <div className="mt-5">
          <p className="text-sm font-semibold">Juror shares · by agreement with result</p>
          <ul className="mt-2 space-y-1.5">
            {s.shares.map((x) => (
              <li key={x.verifier} className="grid grid-cols-[2.5rem_minmax(0,1fr)_auto] items-center gap-3 font-mono text-xs">
                <span className="font-semibold">{(verifierName(x.verifier) ?? x.verifier).slice(0, 4)}</span>
                <span className="h-1.5 rounded-full bg-white/50">
                  <span className="block h-full rounded-full bg-ink" style={{ width: `${(Number(BigInt(x.amount)) / maxShare) * 100}%` }} />
                </span>
                <span>
                  {x.agree}/{ids.length} · {formatNear(x.amount, 4)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

function Line({ k, v, strong }: { k: ReactNode; v: ReactNode; strong?: boolean }) {
  return (
    <div className={`flex items-baseline justify-between gap-4 py-2 ${strong ? "border-t border-ink/70 font-semibold" : ""}`}>
      <dt className={strong ? "" : "opacity-80"}>{k}</dt>
      <dd className="num font-mono">{v} Ⓝ</dd>
    </div>
  );
}

function JuryLog({ d }: { d: Detail }) {
  const j = d.job;
  const t = (ns: string | null | undefined) => {
    const ms = nsMs(ns);
    return ms === null ? "" : new Date(ms).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  };
  const rows: [string, string, string, string | null][] = [];
  if (j.settlement && j.status === "Settled") rows.push(["", "job_settled", `${uiStatus(j)} · fee ${formatNear(j.settlement.fee, 4)} Ⓝ`, null]);
  for (const r of [...j.reveals].reverse())
    rows.push(["", "vote_revealed", `${verifierName(r.verifier)} · inj=${r.injection_flag ? 1 : 0} · evidence ${r.evidence_hash.slice(0, 4)}…`, d.jury.find((x) => x.verifier === r.verifier)?.reveal_tx ?? null]);
  if (j.commits.length) rows.push(["", "vote_committed", `${j.commits.length}/${j.jury.length} committed${j.commits.length === j.jury.length ? " · reveal opened" : ""}`, null]);
  if (j.jury.length) rows.push(["", "jury_selected", `${j.jury.map(verifierName).join(", ")} · restarts ${j.restarts}`, null]);
  if (j.submitted_at) rows.push([t(j.submitted_at), "deliverable_submitted", when(nsMs(j.submitted_at)), null]);
  if (j.status === "Cancelled") rows.unshift(["", "job_cancelled", "refunded, no fee", null]);
  if (j.status === "Expired") rows.unshift(["", "job_expired", "refunded, no fee", null]);
  rows.push([t(j.created_at), "job_created", when(nsMs(j.created_at)), null]);
  return (
    <Card>
      <div className="flex items-baseline justify-between">
        <h2 className="display text-[1.5rem]">Jury log</h2>
        <span className="inline-flex items-center gap-1.5 text-xs text-muted">
          <span className={`size-1.5 rounded-full ${FINAL.has(j.status) ? "bg-faint" : "animate-pulse bg-act"}`} />
          {FINAL.has(j.status) ? "Final" : "Live"}
        </span>
      </div>
      <ol className="mt-3 divide-y divide-rule">
        {rows.map(([time, ev, detail, tx], i) => (
          <li key={i} className="grid grid-cols-[auto_minmax(0,1fr)_auto] gap-x-3 py-3">
            <span className="pt-0.5 font-mono text-[0.6875rem] text-faint">{time}</span>
            <div className="min-w-0">
              <p className="font-mono text-[0.8125rem] font-semibold">{ev}</p>
              <p className="truncate text-xs text-muted">{detail}</p>
            </div>
            {tx ? (
              <a href={txUrl(tx)} target="_blank" rel="noreferrer" aria-label="Open transaction" className="text-act">
                <ArrowUpRight size={13} />
              </a>
            ) : (
              <span />
            )}
          </li>
        ))}
      </ol>
    </Card>
  );
}
