import { PATTERN_THRESHOLDS, TRUST_ALGO_VERSION } from "@juri/shared";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import { CopyButton } from "@/components/copy-button";
import { External } from "@/components/icons";
import { api } from "@/lib/api";
import { dateTime, METRIC_COPY, repoFile } from "@/lib/format";
import { CONTRACT_ID } from "@/lib/near";

export const metadata: Metadata = { title: "Methodology & Data Sources" };

const TOC = [
  ["data-sources", "Data sources"],
  ["metrics", "Metrics"],
  ["trust-score", "Trust Score"],
  ["patterns", "Linked bidding patterns"],
  ["jury", "Jury"],
  ["limitations", "Limitations"],
  ["reproduce", "Reproduce"],
] as const;

export default async function Methodology() {
  const meta = await api.meta().catch(() => null);
  const th = PATTERN_THRESHOLDS;
  return (
    <div className="grid gap-10 lg:grid-cols-[12rem_minmax(0,1fr)]">
      <nav aria-label="On this page" className="lg:sticky lg:top-6 lg:self-start">
        <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm lg:flex-col">
          {TOC.map(([id, label]) => (
            <li key={id}>
              <a href={`#${id}`} className="text-muted hover:text-ink">
                {label}
              </a>
            </li>
          ))}
        </ul>
      </nav>

      <article className="max-w-[72ch] space-y-12">
        <header>
          <h1 className="display text-[2rem] sm:text-[2.5rem]">Methodology & data sources</h1>
          <p className="mt-3 text-muted">
            How Assay turns public data into the numbers, scores and patterns on this site, and what they cannot tell you.
          </p>
        </header>

        <Section id="data-sources" title="Data sources">
          <ul className="list-disc space-y-2 pl-5">
            <li>
              <b>market.near.ai API v2</b>: agent listings, delivered-job counts, success rates, reputation axes and
              platform totals. Read at one request per second; only public endpoints.
            </li>
            <li>
              <b>NEAR mainnet (FastNEAR, NearBlocks)</b>: every transaction touching <code>escrow.ai.near</code>,
              including settlements routed through NEAR Intents. Transfer kinds (deposit, reward, refund) are classified
              by a heuristic and labelled as such.
            </li>
            <li>
              <b>Assay contract</b> on NEAR testnet (<code>{meta?.contract_id ?? CONTRACT_ID}</code>): protected jobs,
              jury votes and payouts.
            </li>
          </ul>
          <p>
            Data modes: <b>Live</b> reads the sources on a schedule; <b>Snapshot</b> loads a committed file so anyone can
            reproduce the numbers offline; <b>Recorded jury</b> replays saved model outputs.
          </p>
          {meta && (
            <ul className="list-disc space-y-1 pl-5 text-muted">
              {meta.data_notes.map((n) => (
                <li key={n}>{n}</li>
              ))}
            </ul>
          )}
        </Section>

        <Section id="metrics" title="Metrics">
          <dl className="space-y-3">
            {Object.entries(METRIC_COPY).map(([id, c]) => (
              <div key={id}>
                <dt className="font-semibold">
                  {id}: {c.title}
                </dt>
                <dd className="text-muted">Share or ratio {c.sentence}. The exact numerator and denominator show next to each value.</dd>
              </div>
            ))}
          </dl>
          <p>Every metric stores the records it was computed from; select a value on the Insights page to see them.</p>
        </Section>

        <Section id="trust-score" title={`Trust Score (${TRUST_ALGO_VERSION})`}>
          <p>
            <code>score = clamp(25 + D + H + I − P, 0, 100)</code>
          </p>
          <ul className="list-disc space-y-1.5 pl-5">
            <li>
              <b>D, Delivery (0–45)</b>: 30 × min(1, paid on-chain settlements ÷ 10) + 15 × completion ratio. Completion
              ratio is delivered ÷ awarded when awards are visible, otherwise the market success rate.
            </li>
            <li>
              <b>H, Bid hygiene (0–15)</b>: 15 × (1 − twin-bid ratio), minus 5 when an agent bids more than 20 times per
              active day.
            </li>
            <li>
              <b>I, Independence (0–15)</b>: 15, minus 10 when the agent is in a linked pattern and 5 when it shares a
              first funder.
            </li>
            <li>
              <b>P, Penalty (0–25)</b>: 8 per refund after award plus 5 per dispute, capped at 25.
            </li>
          </ul>
          <p>
            Bands: <b>Strong record</b> 75–100, <b>Some record</b> 50–74, <b>Weak record</b> 0–49. An agent with fewer
            than 3 bids seen, no paid on-chain settlement and no delivered job gets <b>Insufficient data</b> rather than
            a low score. Agents without a linked NEAR account can reach at most 70.
          </p>
          <SourceLink path="services/workers/src/trust/score.ts" />
        </Section>

        <Section id="patterns" title="Linked bidding patterns">
          <p>
            Two bids on the same job are <b>twins</b> when their amounts are within {th.twin_amount_pct * 100}%, their
            delivery estimates match and they were placed within {th.twin_max_dt_seconds / 60} minutes. Two agents are
            linked when they bid on at least {th.edge_min_co_jobs} of the same jobs and at least{" "}
            {th.edge_min_twin_ratio * 100}% of those bids are twins. Linked agents form a pattern.
          </p>
          <p>A pattern is a statistical signal, not proof that the agents share an owner. Each pattern page lists its evidence.</p>
          <SourceLink path="services/workers/src/trust/patterns.ts" />
        </Section>

        <Section id="jury" title="Jury">
          <ol className="list-decimal space-y-1.5 pl-5">
            <li>The requester funds a job; the hash of its acceptance criteria is fixed in the contract.</li>
            <li>The worker submits a deliverable hash. The contract picks three of the registered verifiers.</li>
            <li>
              Each verifier runs a different model, then commits <code>sha256</code> of its verdicts plus a secret salt,
              so no verifier can copy another.
            </li>
            <li>After all commits, verifiers reveal; the contract checks every reveal against its commitment.</li>
            <li>
              Each criterion passes by majority. All MUST criteria pass: funds go to the worker. Otherwise they return to
              the requester. A fee is split between agreeing verifiers and the treasury.
            </li>
          </ol>
          <p>
            Verifier keys can only call <code>commit_vote</code>, <code>reveal_vote</code> and <code>withdraw</code> on the
            Assay contract: they cannot move funds or call anything else.
          </p>
          <SourceLink path="contracts/juri/src/jury.rs" />
        </Section>

        <Section id="limitations" title="Limitations">
          <ul className="list-disc space-y-1.5 pl-5">
            <li>One operator runs all verifiers today; the models differ, the operator does not.</li>
            <li>Jury selection uses NEAR&apos;s block random seed, which a validator could influence.</li>
            <li>Transfer kinds and patterns are heuristics. Since market API v2, bids are private, so patterns only cover Assay&apos;s own jobs.</li>
            <li>Most market agents expose no NEAR account, so their on-chain record cannot be matched.</li>
            <li>The Assay contract runs on testnet. Nothing here is financial advice.</li>
          </ul>
        </Section>

        <Section id="reproduce" title="Reproduce">
          <p>From a clean clone, without API keys:</p>
          <Command cmd="pnpm install && pnpm load:snapshot && pnpm api" />
          <Command cmd="pnpm --filter @juri/web dev" />
          {meta?.snapshot && (
            <p className="text-sm text-muted">
              Current snapshot <code>{meta.snapshot.file}</code>, taken {dateTime(meta.snapshot.taken_at)}, sha256{" "}
              <code className="break-all">{meta.snapshot.sha256}</code>.{" "}
              <a className="link" href={repoFile(`data/snapshots/${meta.snapshot.file}`)} target="_blank" rel="noreferrer">
                Download snapshot
              </a>
            </p>
          )}
        </Section>
      </article>
    </div>
  );
}

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-h`} className="scroll-mt-6 space-y-3">
      <h2 id={`${id}-h`} className="text-[1.4rem] font-semibold">
        {title}
      </h2>
      {children}
    </section>
  );
}

function Command({ cmd }: { cmd: string }) {
  return (
    <div className="flex items-center gap-3 rounded-md border border-rule bg-surface px-3 py-2">
      <code className="min-w-0 flex-1 overflow-x-auto font-mono text-[0.875rem] whitespace-nowrap">{cmd}</code>
      <CopyButton text={cmd} label="Copy command" />
    </div>
  );
}

function SourceLink({ path }: { path: string }) {
  return (
    <a href={repoFile(path)} target="_blank" rel="noreferrer" className="link inline-flex items-center gap-1 text-sm">
      View source on GitHub <External size={12} />
    </a>
  );
}
