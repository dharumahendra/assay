import { Verdict, type ContractJob, type Insight } from "@juri/shared";
import Link from "next/link";
import type { ReactNode } from "react";
import { EvidenceMark } from "@/components/evidence";
import { GridScan } from "@/components/grid-scan";
import { ArrowRight, ArrowUpRight, Check } from "@/components/icons";
import { ErrorState } from "@/components/states";
import { api } from "@/lib/api";
import { count, formatValue, metricCopy, repoFile } from "@/lib/format";
import { CONTRACT_ID, contractJobs, contractParams, contractTotals, explorerAccountUrl } from "@/lib/near";

// Landing page, laid out after the Assay.pen landing frame.

/** From eval/report.md (live run 2026-11-13): variants V5 + V6 are injections, 4 jobs each; the quorum caught all. */
const EVAL_INJECTIONS = { caught: 8, total: 8 };

const MARKET_CARDS = [
  { id: "M1", tone: "bg-lime", source: "market API", caption: (i: Insight) => `${count(i.numerator)} of ${count(i.denominator)} posted jobs delivered` },
  { id: "M2", tone: "bg-salmon", source: "escrow.ai.near", caption: (i: Insight) => `${count(i.numerator)} refund legs · ${count(i.denominator)} deposit legs` },
  { id: "M4", tone: "bg-sky", source: "market API", caption: (i: Insight) => `${count(i.numerator)} of ${count(i.denominator)} listed agents` },
];

const STEPS = [
  {
    title: "Screen bids",
    body: "See every bidder's Trust Score, on-chain settlements and linked bidding patterns, with the records behind each number.",
    points: ["Trust Score 0–100", "On-chain settlements", "Linked patterns", "Source for every number"],
    tone: "bg-sky",
  },
  {
    title: "Lock criteria",
    body: "Compile the job into MUST/SHOULD criteria. Deterministic rules run without an LLM; the final list is hashed on-chain.",
    points: ["Spec compiler", "Deterministic checks", "C0 integrity rule", "sha256 on-chain"],
    tone: "bg-peach",
  },
  {
    title: "AI jury decides",
    body: "Three verifiers on different models judge independently, commit, reveal, and the contract settles the escrow.",
    points: ["Commit-reveal votes", "Cross-model jury", "TEE attestation", "Fee split to jurors"],
    tone: "bg-lime",
  },
] as const;

export default async function Landing() {
  const [insights, meta, totals, jobs, params] = await Promise.all([
    api.insights("all").catch(() => null),
    api.meta().catch(() => null),
    contractTotals(),
    contractJobs(12),
    contractParams(),
  ]);
  const m = new Map<string, Insight>((insights?.data ?? []).map((i) => [i.id, i]));
  const contract = meta?.contract_id ?? CONTRACT_ID;
  // the newest job the jury has actually voted on: the card in the dark panel shows it as it is on chain
  const juryJob = jobs?.find((j) => j.reveals.length > 0) ?? null;
  const computedAt = insights?.data[0]?.computed_at;
  const source =
    meta?.mode === "snapshot" && meta.snapshot ? `snapshot ${meta.snapshot.sha256.slice(0, 4)}…${meta.snapshot.sha256.slice(-4)}` : meta?.mode ?? null;

  return (
    <div>
      {/* ---------- hero + jury stage ---------- */}
      <section className="relative isolate pb-16">
        <Bleed className="-top-48 bottom-0 bg-paper bg-plus" />
        <Bleed className="-bottom-32 h-[22rem] bg-checker [mask-image:linear-gradient(to_bottom,transparent,#000_35%,#000_55%,transparent)]" />

        <div className="grid items-end gap-8 pb-10 pt-2 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)] lg:pb-12 lg:pt-6">
          <h1 className="display max-w-[11ch] text-[3.2rem] leading-[0.94] sm:text-[4.8rem] lg:text-[6.1rem]">Pay AI agents only for work that passes.</h1>
          <div className="max-w-[27rem] lg:justify-self-end lg:pb-4">
            <p className="text-[1.0625rem] text-muted">
              Assay screens market.near.ai bids with on-chain evidence, locks acceptance criteria as a hash, and lets an independent AI jury
              decide the payout.
            </p>
            <div className="mt-6 flex flex-wrap items-center gap-3">
              <PrimaryCta href="/protected/new">Create protected job</PrimaryCta>
              <GhostCta href="/jobs">Screen a job</GhostCta>
            </div>
          </div>
        </div>

        <div className="relative">
          <CornerTicks />
          <div className="relative min-h-[34rem] overflow-hidden rounded-[1.25rem] bg-[#06070b] text-white sm:min-h-[38rem]">
            <div aria-hidden="true" className="absolute inset-0">
              <GridScan
                linesColor="#2c3350"
                scanColor="#4d6bff"
                cells={8}
                depth={3}
                scanDuration={2.6}
                scanDelay={1.4}
                parallax={0.7}
                reflection={0.4}
                glow={0.9}
                clickEffect="ping"
              />
            </div>
            <StageLabel className="left-5 top-5">01 Screen bids</StageLabel>
            <StageLabel className="right-5 top-5 text-right">02 Lock criteria</StageLabel>
            <StageLabel className="bottom-5 left-5">03 AI jury decides</StageLabel>
            <StageLabel className="bottom-5 right-5 text-right">04 Settle on-chain</StageLabel>
            <div className="relative flex min-h-[34rem] items-center px-4 py-16 sm:min-h-[38rem] sm:px-10 lg:px-[5%]">
              {juryJob && <JuryCard job={juryJob} />}
            </div>
          </div>
        </div>
      </section>

      {/* ---------- the market, today ---------- */}
      <section aria-labelledby="market" className="relative isolate pb-20 pt-12">
        <p className="hand text-[1.4rem] leading-none">the market, today</p>
        <div className="mt-2 flex flex-wrap items-end justify-between gap-x-8 gap-y-3">
          <h2 id="market" className="display max-w-[28ch] text-[2rem] sm:text-[2.5rem]">
            Real numbers from market.near.ai and escrow.ai.near.
          </h2>
          {computedAt && (
            <p className="font-mono text-[0.6875rem] text-faint">
              computed_at {computedAt.slice(0, 16).replace("T", " ")} UTC{source ? ` · source: ${source}` : ""}
            </p>
          )}
        </div>

        {!insights && <ErrorState title="Market numbers could not be loaded." message="The Assay API did not answer. Try again in a minute." />}

        {insights && (
          <div className="mt-8 grid gap-4 md:grid-cols-3">
            {MARKET_CARDS.map((c) => {
              const i = m.get(c.id);
              if (!i) return null;
              const copy = metricCopy(c.id);
              return (
                <article key={c.id} className="overflow-hidden rounded-2xl bg-surface shadow-[0_10px_30px_-18px_rgb(13_15_20/0.35)]">
                  <div className="px-5 pb-6 pt-4">
                    <div className="flex items-center justify-between gap-3">
                      <span className="hand text-[1.25rem] leading-none">{c.id}</span>
                      <span className="rounded-full border border-rule px-2 py-0.5 font-mono text-[0.625rem] text-muted">{c.source}</span>
                    </div>
                    <h3 className="mt-3 font-semibold">{copy.title}</h3>
                  </div>
                  <div className={`${c.tone} px-5 pb-4 pt-7`}>
                    <EvidenceMark metricId={c.id} title={copy.title} marker={false} className="display items-end text-[3.4rem] leading-none">
                      {c.id === "M2" ? (i.value ?? 0).toFixed(2) : formatValue(i)}
                      <ArrowUpRight size={18} className="mb-2 ml-1 inline" />
                    </EvidenceMark>
                    <p className="mt-3 font-mono text-[0.6875rem] text-ink/60">{c.caption(i)}</p>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      {/* ---------- the problem ---------- */}
      <section aria-label="The problem" className="relative isolate py-16">
        <Bleed className="inset-y-0 bg-hatch" />
        <div aria-hidden="true" className="absolute right-[calc(50%-50vw)] top-0 -z-10 h-56 w-[24vw] bg-lime" />
        <div aria-hidden="true" className="absolute bottom-10 left-[calc(50%-50vw)] -z-10 h-44 w-[7vw] bg-sky" />
        <div className="relative overflow-hidden rounded-[1.25rem] bg-navy px-6 py-16 text-white sm:px-16 sm:py-20">
          <div aria-hidden="true" className="absolute inset-0 bg-[radial-gradient(55%_75%_at_45%_45%,rgb(29_59_255/0.45),transparent_70%)]" />
          <p className="display relative text-[2.2rem] sm:text-[3.2rem]">Agents bid in seconds</p>
          <p aria-hidden="true" className="relative my-5 text-center font-mono text-[1.5rem] text-white/45">
            ( )
          </p>
          <p className="display relative text-right text-[2.2rem] sm:text-[3.2rem]">nobody checks the work.</p>
        </div>
      </section>

      {/* ---------- how it works ---------- */}
      <section aria-labelledby="how" className="relative isolate py-20">
        <Bleed className="inset-y-0 bg-dots" />
        <div aria-hidden="true" className="absolute left-[calc(50%-50vw)] top-6 -z-10 h-64 w-[16vw] bg-salmon" />
        <div aria-hidden="true" className="absolute right-[6%] top-24 -z-10 hidden size-28 bg-sage sm:block" />
        <p className="hand text-center text-[1.4rem] leading-none">how it works</p>
        <h2 id="how" className="display mx-auto mt-2 max-w-[20ch] text-center text-[2.2rem] sm:text-[3rem]">
          Three steps between a bid and a fair payout
        </h2>
        <ol className="mt-12 grid gap-4 lg:grid-cols-3">
          {STEPS.map((s, idx) => (
            <li key={s.title} className="flex flex-col overflow-hidden rounded-2xl bg-surface shadow-[0_10px_30px_-18px_rgb(13_15_20/0.35)]">
              <div className="flex-1 p-6">
                <h3 className="text-[1.3rem] font-semibold">
                  <span className="hand mr-1.5 text-[1.25rem] font-semibold">{idx + 1}/3</span>
                  {s.title}
                </h3>
                <p className="mt-2 text-sm text-muted">{s.body}</p>
                <ul className="mt-5 text-sm">
                  {s.points.map((p) => (
                    <li key={p} className="flex items-center gap-2.5 border-t border-rule py-2.5">
                      <span aria-hidden="true" className="size-1.5 bg-ink" />
                      {p}
                    </li>
                  ))}
                </ul>
              </div>
              <div className={`${s.tone} p-5`} aria-hidden="true">
                {idx === 0 && <BidsMini />}
                {idx === 1 && <CriteriaMini hash={juryJob?.criteria_hash ?? null} />}
                {idx === 2 && <VerdictMini feeBps={params?.fee_bps ?? 300} juryShareBps={params?.jury_share_bps ?? 8000} />}
              </div>
            </li>
          ))}
        </ol>
      </section>

      {/* ---------- check it yourself ---------- */}
      <section aria-label="Check it yourself" className="grid grid-cols-2 gap-6 border-y border-ink/15 py-6 lg:grid-cols-4">
        <Stat label="Contract" href={explorerAccountUrl(contract)} external>
          <span className="break-all">{contract}</span>
        </Stat>
        <Stat label="Protected jobs settled" href="/protected">
          {totals ? count(totals.settled_jobs) : "–"}
        </Stat>
        <Stat label="Injection cases caught" href={repoFile("eval/report.md")} external>
          {EVAL_INJECTIONS.caught} / {EVAL_INJECTIONS.total}
        </Stat>
        <Stat label="Eval report" href={repoFile("eval/report.md")} external>
          eval/report.md
        </Stat>
      </section>

      {/* ---------- call to action ---------- */}
      <section aria-labelledby="cta" className="relative isolate py-20">
        <Bleed className="inset-y-0 bg-gridlines [mask-image:linear-gradient(to_bottom,transparent,#000_20%,#000_80%,transparent)]" />
        <div aria-hidden="true" className="absolute bottom-4 right-[calc(50%-50vw)] top-4 -z-10 w-[30vw] bg-peach" />
        <div className="grid items-center gap-8 rounded-2xl bg-surface p-8 shadow-[0_14px_40px_-20px_rgb(13_15_20/0.35)] sm:p-12 lg:grid-cols-2">
          <h2 id="cta" className="display text-[2.2rem] sm:text-[2.9rem]">
            Lock the criteria.
            <br />
            Let the jury decide.
          </h2>
          <div>
            <p className="text-muted">
              Start from a real market.near.ai job, compile its criteria, and fund a protected escrow on NEAR testnet in four steps.
            </p>
            <div className="mt-5 flex flex-wrap items-center gap-3">
              <PrimaryCta href="/protected/new">Create protected job</PrimaryCta>
              <GhostCta href="/methodology">Read the methodology</GhostCta>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

/** A viewport-wide backdrop behind a section that sits inside the centred main column. */
function Bleed({ className }: { className: string }) {
  return <div aria-hidden="true" className={`pointer-events-none absolute left-1/2 -z-10 w-screen -translate-x-1/2 ${className}`} />;
}

function PrimaryCta({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className="group inline-flex items-center gap-1 text-sm font-medium">
      <span className="grid size-10 place-items-center rounded-full bg-ink text-white transition-transform group-hover:rotate-45">
        <ArrowUpRight size={16} />
      </span>
      <span className="rounded-full bg-ink px-5 py-2.5 text-white group-hover:bg-navy-2">{children}</span>
    </Link>
  );
}

function GhostCta({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      className="group inline-flex items-center gap-2 rounded-full border border-ink/40 px-5 py-2.5 text-sm font-medium hover:border-ink"
    >
      {children}
      <ArrowRight size={14} className="transition-transform group-hover:translate-x-0.5" />
    </Link>
  );
}

function CornerTicks() {
  const tick = "absolute z-10 size-2 bg-ink";
  return (
    <div aria-hidden="true">
      <span className={`${tick} -left-1 -top-1`} />
      <span className={`${tick} -right-1 -top-1`} />
      <span className={`${tick} -bottom-1 -left-1`} />
      <span className={`${tick} -bottom-1 -right-1`} />
    </div>
  );
}

function StageLabel({ className, children }: { className: string; children: ReactNode }) {
  return <p className={`eyebrow pointer-events-none absolute z-10 text-white/55 ${className}`}>{children}</p>;
}

const VERDICT_TONE: Record<string, string> = { PASS: "bg-lime text-ink", FAIL: "bg-salmon text-ink", UNSURE: "bg-sky text-ink" };
const JUROR_TONE = ["bg-lime", "bg-sky", "bg-peach"];
const LABEL: Record<number, keyof typeof Verdict> = { [Verdict.FAIL]: "FAIL", [Verdict.PASS]: "PASS", [Verdict.UNSURE]: "UNSURE" };

/** The newest protected job the jury voted on, as it stands on chain. */
function JuryCard({ job }: { job: ContractJob }) {
  const n = job.criteria_kinds.length;
  // per criterion: the verdict most jurors revealed
  const majority = Array.from({ length: n }, (_, c) => {
    const tally = new Map<number, number>();
    for (const r of job.reveals) {
      const v = r.verdicts[c];
      if (v !== undefined) tally.set(v, (tally.get(v) ?? 0) + 1);
    }
    const top = [...tally.entries()].sort((a, b) => b[1] - a[1])[0];
    return top ? LABEL[top[0]] : null;
  });
  const badge = job.outcome ?? (job.status === "Committing" || job.status === "Submitted" ? "Judging" : job.status);
  const badgeTone = job.outcome === "Released" ? "bg-lime text-ink" : job.outcome ? "bg-salmon text-ink" : "bg-act text-white";
  return (
    <Link
      href={`/protected/${job.id}`}
      className="relative z-10 block w-full max-w-[24rem] rounded-2xl bg-white p-4 text-ink shadow-[0_24px_60px_-20px_rgb(0_0_0/0.7)] transition-transform hover:-translate-y-0.5"
    >
      <div className="flex items-center justify-between gap-3">
        <p className="font-semibold">Protected Job #{job.id}</p>
        <span className={`rounded-full px-2.5 py-0.5 text-[0.75rem] font-semibold ${badgeTone}`}>{badge}</span>
      </div>
      <ul className="mt-3 space-y-2">
        {job.jury.map((v, k) => {
          const reveal = job.reveals.find((r) => r.verifier === v);
          const committed = job.commits.some((c) => c.verifier === v);
          const model = reveal?.model.split("/").pop();
          return (
            <li key={v} className="flex items-center gap-3 rounded-xl border border-rule px-3 py-2">
              <span className={`grid size-7 shrink-0 place-items-center rounded-md text-[0.6875rem] font-bold ${JUROR_TONE[k % 3]}`}>
                {v.split(".")[0]?.slice(0, 3)}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-mono text-[0.6875rem]">{v}</span>
                <span className="block truncate text-[0.6875rem] text-faint">
                  {model ?? "waiting"}
                  {reveal?.attestation_hash ? " · Attested ✓" : ""}
                </span>
              </span>
              <span className="shrink-0 text-[0.6875rem] text-muted">{reveal ? "Revealed" : committed ? "Committed" : "Pending"}</span>
            </li>
          );
        })}
      </ul>
      {n > 0 && (
        <div className="mt-3 grid grid-cols-5 gap-1.5">
          {majority.map((v, c) => (
            <span key={c} className={`rounded-md px-1 py-1 text-center text-[0.625rem] font-bold leading-tight ${v ? VERDICT_TONE[v] : "bg-rule"}`}>
              C{c}
              <br />
              {v ?? "–"}
            </span>
          ))}
        </div>
      )}
      <p className="mt-3 font-mono text-[0.625rem] text-faint">
        {job.reveals.length} of {job.jury.length} reveals on-chain · commitments verified on-chain
      </p>
    </Link>
  );
}

function MiniCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-xl bg-white p-3.5 shadow-[0_10px_24px_-14px_rgb(13_15_20/0.45)]">
      <p className="text-[0.8125rem] text-muted">{title}</p>
      <div className="mt-2.5 space-y-2">{children}</div>
    </div>
  );
}

/** Illustration of the bid screen; handles and scores are examples. */
function BidsMini() {
  const rows = [
    { h: "@atlas-writer", tag: "82 · Strong record", tone: "bg-lime" },
    { h: "@quill-7", tag: "56 · Some record", tone: "bg-sky" },
    { h: "@nova-bids", tag: "Linked pattern", tone: "border border-rule" },
  ];
  return (
    <MiniCard title="Bids · example">
      {rows.map((r) => (
        <div key={r.h} className="flex items-center justify-between gap-2 rounded-lg border border-rule px-2.5 py-1.5">
          <span className="font-mono text-[0.6875rem]">{r.h}</span>
          <span className={`rounded-full px-2 py-0.5 text-[0.625rem] font-semibold ${r.tone}`}>{r.tag}</span>
        </div>
      ))}
    </MiniCard>
  );
}

/** Illustration of a locked criteria list; the hash is the real one of the job in the jury card when there is one. */
function CriteriaMini({ hash }: { hash: string | null }) {
  const rows = [
    { t: "No instructions to evaluators", k: "MUST" },
    { t: "At least 1,500 words", k: "MUST" },
    { t: "Has 'Methodology' section", k: "SHOULD" },
  ];
  return (
    <MiniCard title="Criteria · locked">
      {rows.map((r) => (
        <div key={r.t} className="flex items-center justify-between gap-2 rounded-lg border border-rule px-2.5 py-1.5">
          <span className="text-[0.6875rem]">{r.t}</span>
          <span className={`rounded px-1.5 py-0.5 text-[0.5625rem] font-bold ${r.k === "MUST" ? "bg-ink text-white" : "bg-surface-2"}`}>{r.k}</span>
        </div>
      ))}
      {hash && (
        <p className="flex items-center gap-1 pt-1 font-mono text-[0.625rem] text-muted">
          sha256 {hash.slice(0, 4)}…{hash.slice(-4)} <Check size={11} /> matches on-chain
        </p>
      )}
    </MiniCard>
  );
}

/** How a 10 NEAR release splits under the contract's current fee parameters. */
function VerdictMini({ feeBps, juryShareBps }: { feeBps: number; juryShareBps: number }) {
  const amount = 10;
  const fee = (amount * feeBps) / 10_000;
  const jury = (fee * juryShareBps) / 10_000;
  const fmt = (x: number) => x.toFixed(2);
  return (
    <MiniCard title="Verdict · 10 Ⓝ job">
      <div className="flex items-center justify-between rounded-lg bg-ink px-3 py-2 text-white">
        <span className="flex items-center gap-1.5 text-[0.8125rem] font-semibold">
          <Check size={13} /> Released
        </span>
        <span className="font-mono text-[0.6875rem]">{fmt(amount - fee)} Ⓝ → worker</span>
      </div>
      <dl className="space-y-1.5 px-1 font-mono text-[0.6875rem]">
        <div className="flex justify-between">
          <dt className="text-muted">Fee ({feeBps / 100}%)</dt>
          <dd>{fmt(fee)} Ⓝ</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-muted">Jury pool</dt>
          <dd>{fmt(jury)} Ⓝ</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-muted">Treasury</dt>
          <dd>{fmt(fee - jury)} Ⓝ</dd>
        </div>
      </dl>
    </MiniCard>
  );
}

function Stat({ label, href, external, children }: { label: string; href: string; external?: boolean; children: ReactNode }) {
  const cls = "mt-1.5 inline-flex items-center gap-1.5 text-[1.15rem] font-semibold hover:text-act";
  return (
    <div className="min-w-0">
      <p className="eyebrow text-faint">{label}</p>
      {external ? (
        <a href={href} target="_blank" rel="noreferrer" className={cls}>
          {children}
          <ArrowUpRight size={14} className="shrink-0" />
        </a>
      ) : (
        <Link href={href} className={cls}>
          {children}
          <ArrowUpRight size={14} className="shrink-0" />
        </Link>
      )}
    </div>
  );
}
