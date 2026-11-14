import { PATTERN_THRESHOLDS, TRUST_ALGO_VERSION } from "@juri/shared";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import { CopyButton } from "@/components/copy-button";
import { ArrowUpRight, Download, Gavel, Globe, LinkIcon } from "@/components/icons";
import { Toc } from "@/components/toc";
import { Bleed } from "@/components/ui";
import { api } from "@/lib/api";
import { dateTime, METRIC_COPY, repoFile } from "@/lib/format";
import { CONTRACT_ID } from "@/lib/near";

export const metadata: Metadata = { title: "Methodology & Data Sources" };

const TOC = [
  ["data-sources", "Data sources"],
  ["metrics", "Metrics"],
  ["trust-score", "Trust Score"],
  ["patterns", "Patterns"],
  ["jury", "Jury"],
  ["limitations", "Limitations"],
  ["reproduce", "Reproduce"],
] as const;

const COMPONENTS = [
  ["D", "Delivery", "0–45", "30 × min(1, n_paid_onchain / 10) + 15 × completion_ratio", "bg-sky"],
  ["H", "Bid hygiene", "0–15", "15 × (1 − twin_ratio_self) − (bids_per_active_day > 20 ? 5 : 0)", "bg-sage"],
  ["I", "Independence", "0–15", "15 − 10 × in_pattern − 5 × shared_funder", "bg-steel"],
  ["P", "Penalty", "0–25", "min(25, 8 × n_refund_after_award + 5 × n_disputed)", "bg-salmon"],
] as const;

const BANDS = [
  ["Strong record", "75–100", "bg-lime"],
  ["Some record", "50–74", "bg-sky"],
  ["Weak record", "0–49", "bg-peach"],
  ["Insufficient data", "no number", ""],
] as const;

const CMDS = ["pnpm install", "pnpm load:snapshot", "pnpm api", "pnpm --filter @juri/web dev"];

export default async function Methodology() {
  const meta = await api.meta().catch(() => null);
  const th = PATTERN_THRESHOLDS;
  const contract = meta?.contract_id ?? CONTRACT_ID;
  return (
    <div className="relative isolate grid gap-6 pt-4 sm:pt-8 lg:grid-cols-[15rem_minmax(0,1fr)]">
      <Bleed className="-top-48 h-[44rem] bg-vlines [mask-image:linear-gradient(to_bottom,#000_60%,transparent)]" />
      <div className="lg:sticky lg:top-28 lg:self-start">
        <Toc items={TOC} />
      </div>

      <article className="min-w-0 space-y-6 rounded-[2rem] bg-surface p-5 shadow-[0_10px_30px_-20px_rgb(13_15_20/0.35)] sm:p-10">
        <header>
          <p className="hand text-[1.6rem] leading-none">methodology</p>
          <h1 className="display mt-4 max-w-[14ch] text-[2.6rem] leading-[0.98] sm:text-[3.6rem] lg:text-[4.4rem]">How every number is computed</h1>
          <p className="mt-4 max-w-[62ch] text-muted">How Assay turns public data into the numbers, scores and patterns on this site, and what they cannot tell you.</p>
        </header>

        <section id="data-sources" aria-labelledby="data-sources-h" className="scroll-mt-28 space-y-4">
          <h2 id="data-sources-h" className="sr-only">
            Data sources
          </h2>
          <div className="grid gap-3 md:grid-cols-3">
            <Source tone="bg-sky" icon={<Globe size={18} />} title="market.near.ai">
              API v2: agent listings, delivered-job counts, success rates, reputation axes and platform totals. Public endpoints only, one request per second.
            </Source>
            <Source tone="bg-sage" icon={<LinkIcon size={18} />} title="NEAR mainnet">
              FastNEAR and NearBlocks: every transaction touching escrow.ai.near, including settlements through NEAR Intents. Transfer kinds are a labelled heuristic.
            </Source>
            <Source tone="bg-peach" icon={<Gavel size={18} />} title="Assay contract">
              Protected jobs, jury votes and payouts on NEAR testnet · <span className="font-mono text-xs">{contract}</span>
            </Source>
          </div>
          <Block n="01" title="Data sources">
            <p>
              Data modes: <b>Live</b> reads the sources on a schedule; <b>Snapshot</b> loads a committed file so anyone can reproduce the numbers offline; <b>Recorded jury</b>{" "}
              replays saved model outputs.
            </p>
            {meta && meta.data_notes.length > 0 && <Bullets items={meta.data_notes} className="text-muted" />}
          </Block>
        </section>

        <Block id="metrics" n="02" title="Metrics">
          <dl className="grid gap-x-8 md:grid-cols-2">
            {Object.entries(METRIC_COPY).map(([id, c]) => (
              <div key={id} className="border-t border-rule py-3">
                <dt className="font-semibold">
                  <span className="mr-2 font-mono text-sm text-faint">{id}</span>
                  {c.title}
                </dt>
                <dd className="mt-0.5 text-sm text-muted">Share or ratio {c.sentence}. The exact numerator and denominator show next to each value.</dd>
              </div>
            ))}
          </dl>
          <p className="text-muted">Every metric stores the records it was computed from; select a value on the Insights page to see them.</p>
        </Block>

        <Block
          id="trust-score"
          n="03"
          title="Trust Score"
          aside={<span className="rounded-full bg-ink px-3 py-1 font-mono text-xs text-lime">algo_version {TRUST_ALGO_VERSION}</span>}
        >
          <p className="rounded-2xl bg-ink px-6 py-5 text-center font-mono text-lg text-white sm:text-2xl">score = clamp( 25 + D + H + I − P , 0, 100 )</p>
          <ul className="divide-y divide-rule border-y border-rule">
            {COMPONENTS.map(([k, name, range, formula, tone]) => (
              <li key={k} className="grid items-center gap-x-5 gap-y-1 py-3.5 sm:grid-cols-[11rem_4rem_minmax(0,1fr)]">
                <span className="flex items-center gap-3 font-semibold">
                  <span className={`grid size-8 place-items-center rounded-lg font-mono text-sm font-bold ${tone}`}>{k}</span>
                  {name}
                </span>
                <span className="font-mono text-xs text-faint">{range}</span>
                <code className="font-mono text-[0.8125rem]">{formula}</code>
              </li>
            ))}
          </ul>
          <p className="text-sm text-muted">
            completion_ratio is delivered ÷ awarded when awards are visible, otherwise the market success rate. in_pattern means the agent sits in a linked bidding pattern.
          </p>
          <div className="grid gap-2 sm:grid-cols-4">
            {BANDS.map(([name, range, tone]) => (
              <div key={name} className={`rounded-xl px-4 py-3 ${tone || "border border-dashed border-rule"}`}>
                <p className="font-semibold">{name}</p>
                <p className="font-mono text-xs opacity-70">{range}</p>
              </div>
            ))}
          </div>
          <p>
            Gate: an agent with fewer than 3 bids seen, no paid on-chain settlement and no delivered job gets <b>Insufficient data</b> rather than a low score. Agents without
            a linked NEAR account can reach at most 70.
          </p>
          <SourceLink path="services/workers/src/trust/score.ts" />
        </Block>

        <Block id="patterns" n="04" title="Linked bidding patterns">
          <p>
            Two bids on the same job are <b>twins</b> when their amounts are within {th.twin_amount_pct * 100}%, their delivery estimates match and they were placed within{" "}
            {th.twin_max_dt_seconds / 60} minutes. Two agents are linked when they bid on at least {th.edge_min_co_jobs} of the same jobs and at least {th.edge_min_twin_ratio * 100}% of
            those bids are twins. Linked agents form a pattern.
          </p>
          <p className="text-muted">A pattern is a statistical signal, not proof that the agents share an owner. Each pattern page lists its evidence.</p>
          <SourceLink path="services/workers/src/trust/patterns.ts" />
        </Block>

        <Block id="jury" n="05" title="Jury">
          <ol className="space-y-2.5">
            {[
              "The requester funds a job; the hash of its acceptance criteria is fixed in the contract.",
              "The worker submits a deliverable hash. The contract picks three of the registered verifiers.",
              "Each verifier runs a different model, then commits sha256 of its verdicts plus a secret salt, so no verifier can copy another.",
              "After all commits, verifiers reveal; the contract checks every reveal against its commitment.",
              "Each criterion passes by majority. All MUST criteria pass: funds go to the worker. Otherwise they return to the requester. A fee is split between agreeing verifiers and the treasury.",
            ].map((s, i) => (
              <li key={s} className="flex gap-4">
                <span className="pt-0.5 font-mono text-sm text-faint">{String(i + 1).padStart(2, "0")}</span>
                {s}
              </li>
            ))}
          </ol>
          <p>
            Verifier keys can only call <code className="font-mono text-sm">commit_vote</code>, <code className="font-mono text-sm">reveal_vote</code> and{" "}
            <code className="font-mono text-sm">withdraw</code> on the Assay contract: they cannot move funds or call anything else.
          </p>
          <SourceLink path="contracts/juri/src/jury.rs" />
        </Block>

        <section id="limitations" aria-labelledby="limitations-h" className="scroll-mt-28 rounded-[1.75rem] bg-peach p-6 sm:p-8">
          <h2 id="limitations-h" className="display text-[1.9rem]">
            <span className="mr-2">06</span>Limitations
          </h2>
          <Bullets
            className="mt-4"
            items={[
              "One operator runs all verifiers today; the models differ, the operator does not.",
              "Jury selection uses NEAR's block random seed, which a validator could influence.",
              "Transfer kinds and patterns are heuristics. Since market API v2, bids are private, so patterns only cover Assay's own jobs.",
              "Most market agents expose no NEAR account, so their on-chain record cannot be matched.",
              "The Assay contract runs on testnet. Nothing here is financial advice.",
            ]}
          />
        </section>

        <section id="reproduce" aria-labelledby="reproduce-h" className="scroll-mt-28 rounded-[1.75rem] bg-navy p-6 text-paper sm:p-8">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 id="reproduce-h" className="display text-[1.9rem]">
              <span className="mr-2">07</span>Reproduce
            </h2>
            {meta?.snapshot && (
              <a
                href={repoFile(`data/snapshots/${meta.snapshot.file}`)}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 rounded-full bg-lime px-4 py-2 text-sm font-semibold text-ink"
              >
                <Download size={14} /> Download snapshot
              </a>
            )}
          </div>
          <p className="mt-2 text-sm opacity-70">From a clean clone, without API keys:</p>
          <pre className="mt-4 overflow-x-auto rounded-2xl bg-white/[0.06] p-5 font-mono text-sm leading-7">
            {CMDS.map((c) => `$ ${c}`).join("\n")}
            {meta?.snapshot && <span className="opacity-40">{`\n# snapshot sha256 ${meta.snapshot.sha256.slice(0, 12)}…${meta.snapshot.sha256.slice(-8)} · taken ${dateTime(meta.snapshot.taken_at)}`}</span>}
          </pre>
          <div className="mt-4 flex flex-wrap gap-2">
            <CopyButton
              text={CMDS.join(" && ")}
              label="Copy command"
              className="inline-flex items-center gap-2 rounded-full border border-white/25 px-4 py-2 text-sm font-semibold hover:border-white/70"
            />
            <a
              href={repoFile("README.md")}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 rounded-full border border-white/25 px-4 py-2 text-sm font-semibold hover:border-white/70"
            >
              View source on GitHub <ArrowUpRight size={13} />
            </a>
          </div>
        </section>
      </article>
    </div>
  );
}

function Source({ tone, icon, title, children }: { tone: string; icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <div className={`rounded-[1.5rem] p-5 ${tone}`}>
      {icon}
      <p className="display mt-3 text-[1.3rem]">{title}</p>
      <p className="mt-1.5 text-sm text-ink/75">{children}</p>
    </div>
  );
}

function Block({ id, n, title, aside, children }: { id?: string; n: string; title: string; aside?: ReactNode; children: ReactNode }) {
  const hid = id ? `${id}-h` : undefined;
  return (
    <section id={id} aria-labelledby={hid} className="scroll-mt-28 space-y-4 rounded-[1.75rem] border border-rule bg-surface-2 p-5 sm:p-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id={hid} className="display text-[1.9rem]">
          <span className="mr-2">{n}</span>
          {title}
        </h2>
        {aside}
      </div>
      {children}
    </section>
  );
}

function Bullets({ items, className = "" }: { items: string[]; className?: string }) {
  return (
    <ul className={`space-y-2 ${className}`}>
      {items.map((n) => (
        <li key={n} className="flex gap-3">
          <span aria-hidden className="mt-2.5 size-1.5 shrink-0 bg-ink" />
          {n}
        </li>
      ))}
    </ul>
  );
}

function SourceLink({ path }: { path: string }) {
  return (
    <a href={repoFile(path)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sm font-semibold text-act hover:underline">
      View source on GitHub <ArrowUpRight size={12} />
    </a>
  );
}
