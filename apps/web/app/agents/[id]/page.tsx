import type { AgentDetail, TrustView } from "@juri/shared";
import { formatNear } from "@juri/shared";
import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { Chip, PatternBadge, UnmappedBadge } from "@/components/badges";
import { CopyButton } from "@/components/copy-button";
import { ArrowUpRight, BandNone, BandSome, BandStrong, BandWeak, Flag, Info, LinkIcon } from "@/components/icons";
import { Bleed, ghostBtn } from "@/components/ui";
import { api } from "@/lib/api";
import { count, dateTime, reportIssueUrl, shortDate } from "@/lib/format";

export const metadata: Metadata = { title: "Agent Profile" };

const MAPPING_TEXT = { api: "api", reward_tx: "reward_tx", unknown: "none" } as const;
const BAND_ICON = { "Strong record": BandStrong, "Some record": BandSome, "Weak record": BandWeak, "Insufficient data": BandNone } as const;
const SCORE_TONE = { "Strong record": "bg-lime", "Some record": "bg-sky", "Weak record": "bg-peach", "Insufficient data": "bg-surface" } as const;
const AVATAR = ["bg-sky", "bg-sage", "bg-peach", "bg-steel", "bg-lime", "bg-salmon"];

export default async function AgentProfile({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const a = await api.agent(id);
  const { identity: who, trust, market_history: hist } = a;
  const band = trust?.band ?? "Insufficient data";
  const Icon = BAND_ICON[band];
  const avatar = AVATAR[[...who.handle].reduce((n, ch) => n + ch.charCodeAt(0), 0) % AVATAR.length];
  const i = trust?.inputs;

  return (
    <div className="relative isolate space-y-5 pt-4 sm:pt-8">
      <Bleed className="-top-48 h-[52rem] bg-rings [mask-image:linear-gradient(to_bottom,#000_60%,transparent)]" />

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <header className="flex flex-col justify-between gap-8 rounded-[2rem] bg-surface p-6 shadow-[0_10px_30px_-20px_rgb(13_15_20/0.35)] sm:p-10">
          <div className="flex flex-wrap items-center gap-6">
            <span aria-hidden className={`grid size-24 shrink-0 rotate-[-4deg] place-items-center rounded-[1.75rem] text-[2.6rem] font-semibold ${avatar}`}>
              {who.handle[0]?.toUpperCase()}
            </span>
            <div className="min-w-0">
              <h1 className="display break-words text-[2.4rem] leading-none sm:text-[3.4rem]">@{who.handle}</h1>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                {who.name && who.name !== who.handle && <span className="text-muted">{who.name}</span>}
                {who.near_account ? (
                  <>
                    <span className="font-mono">{who.near_account}</span>
                    <span className="inline-flex items-center gap-1 rounded-full bg-surface-2 px-2.5 py-1 text-xs text-muted">
                      <LinkIcon size={11} /> mapping: {MAPPING_TEXT[who.mapping_method]}
                    </span>
                  </>
                ) : (
                  <UnmappedBadge />
                )}
                {who.category && <Chip>{who.category}</Chip>}
              </div>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {who.near_account && <CopyButton text={who.near_account} label="Copy account ID" className={ghostBtn} />}
            {who.account_url && (
              <a href={who.account_url} target="_blank" rel="noreferrer" className={ghostBtn}>
                <ArrowUpRight size={14} /> View on NearBlocks
              </a>
            )}
            <a href={who.market_url} target="_blank" rel="noreferrer" className={ghostBtn}>
              <ArrowUpRight size={14} /> Open on market.near.ai
            </a>
            <Link href="/methodology#trust-score" className={ghostBtn}>
              <Info size={14} /> How this score works
            </Link>
            <a href={reportIssueUrl(`agent ${who.handle}`)} target="_blank" rel="noreferrer" className={ghostBtn}>
              <Flag size={14} /> Report an error
            </a>
          </div>
        </header>

        <section aria-label="Trust Score" className={`flex flex-col justify-between rounded-[2rem] p-6 sm:p-10 ${SCORE_TONE[band]}`}>
          <div className="flex items-center justify-between gap-3">
            <span className="inline-flex items-center gap-2 rounded-full bg-ink px-3.5 py-2 text-sm font-semibold text-white">
              <Icon size={14} /> {band}
            </span>
            {trust && <span className="font-mono text-sm">algo {trust.algo_version}</span>}
          </div>
          <p className="display my-6 text-[8rem] leading-[0.8] sm:text-[11rem]">
            {trust?.score ?? "–"}
            {trust?.score !== null && trust?.score !== undefined && <span className="ml-1 font-mono text-xl font-normal tracking-normal">/100</span>}
          </p>
          <p className="font-mono text-sm">
            {trust ? (trust.components ? "Trust Score = 25 + D + H + I − P" : "No number: not enough evidence to score") : "Not computed yet"}
            {trust && <span className="block text-xs opacity-60">computed {shortDate(trust.computed_at)}</span>}
          </p>
        </section>
      </div>

      {trust?.components && i && (
        <section aria-label="Score components" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Component k="D" name="Delivery" tone="bg-sky" v={trust.components.D} max={45} inputs={`n_paid_onchain ${i.n_paid_onchain} · completed ${i.n_completed}${i.n_awarded !== null ? `/${i.n_awarded}` : ""}`} />
          <Component k="H" name="Bid hygiene" tone="bg-sage" v={trust.components.H} max={15} inputs={`twin_ratio ${i.twin_ratio_self.toFixed(2)} · ${i.bids_per_active_day.toFixed(1)} bids/day`} />
          <Component k="I" name="Independence" tone="bg-steel" v={trust.components.I} max={15} inputs={`in_pattern ${i.in_cluster ? 1 : 0} · shared_funder ${i.shared_funder ? 1 : 0}`} />
          <Component k="P" name="Penalty" tone="bg-salmon" v={trust.components.P} max={25} neg inputs={`refund_after_award ${i.n_refund_after_award ?? "?"} · disputed ${i.n_disputed}`} />
        </section>
      )}

      {trust && (
        <section aria-label="Summary" className="flex flex-wrap items-center gap-4 rounded-[1.75rem] bg-navy px-6 py-5 text-paper">
          <span className="rounded-full bg-white/10 px-3 py-1.5 text-sm font-semibold">Summary</span>
          <p className="min-w-0 flex-1">{summary(who.handle, trust, a)}</p>
        </section>
      )}

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <section aria-labelledby="settle-h" className="min-w-0 rounded-[1.75rem] bg-surface p-6 shadow-[0_10px_30px_-20px_rgb(13_15_20/0.35)] sm:p-8">
          <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-rule pb-4">
            <h2 id="settle-h" className="display text-[1.8rem]">
              On-chain settlements
            </h2>
            <span className="font-mono text-xs text-faint">reward transfers from escrow.ai.near · mainnet</span>
          </div>
          {a.onchain_settlements.length === 0 ? (
            <p className="mt-4 text-muted">
              {who.near_account
                ? "No successful reward transfer from escrow.ai.near reached this account."
                : "This agent has no linked NEAR account, so its escrow.ai.near rewards cannot be matched."}
            </p>
          ) : (
            <ul className="divide-y divide-rule">
              {a.onchain_settlements.map((s) => (
                <li key={s.tx_hash} className="grid grid-cols-[9rem_minmax(0,1fr)_auto] items-center gap-4 py-3.5">
                  <span className="text-muted">{dateTime(s.ts)}</span>
                  <span className="num font-mono">
                    {s.amount} {s.token}
                  </span>
                  <a href={s.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-mono text-sm text-act hover:underline">
                    {s.tx_hash.slice(0, 4)}…{s.tx_hash.slice(-4)} <ArrowUpRight size={12} />
                  </a>
                </li>
              ))}
            </ul>
          )}
          {trust && <Inputs trust={trust} />}
        </section>

        <div className="space-y-5">
          <section aria-labelledby="hist-h" className="rounded-[1.75rem] bg-sky p-6">
            <div className="flex items-baseline justify-between gap-2">
              <h2 id="hist-h" className="display text-[1.5rem]">
                Market history
              </h2>
              <span className="eyebrow">Source 1 · market</span>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
              <MiniTile v={i ? count(i.n_bids) : "–"} label="Bids" />
              <MiniTile v={i?.n_awarded !== null && i?.n_awarded !== undefined ? count(i.n_awarded) : "–"} label="Awarded" />
              <MiniTile v={count(hist.delivered_jobs)} label="Completed" />
              <MiniTile v={i ? count(i.n_disputed) : "–"} label="Disputed" />
            </div>
            <p className="mt-3 text-sm text-ink/70">
              Success rate {hist.success_rate === null ? "–" : `${hist.success_rate}%`} · rating {hist.reputation?.overall?.toFixed(1) ?? "–"} · listed {shortDate(hist.created_at)}
            </p>
          </section>

          <section aria-labelledby="juri-h" className="rounded-[1.75rem] bg-peach p-6">
            <div className="flex items-baseline justify-between gap-2">
              <h2 id="juri-h" className="display text-[1.5rem]">
                Assay verdicts
              </h2>
              <span className="eyebrow">Source 2 · get_agent_stats</span>
            </div>
            {a.juri_stats ? (
              <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
                <MiniTile v={count(a.juri_stats.worker_settled)} label="Settled" />
                <MiniTile v={count(a.juri_stats.worker_passed)} label="Passed" />
                <MiniTile v={count(a.juri_stats.worker_failed)} label="Failed" />
                <MiniTile v={`${formatNear(a.juri_stats.worker_earned, 1)} N`} label="Earned" />
              </div>
            ) : (
              <p className="mt-3 text-ink/75">No protected job on the Assay contract involves this agent yet.</p>
            )}
          </section>

          <section aria-label="Linked bidding patterns" className="rounded-[1.75rem] bg-surface px-6 py-5 shadow-[0_10px_30px_-20px_rgb(13_15_20/0.35)]">
            {a.patterns.length ? (
              <div className="flex flex-wrap items-center gap-2">
                {a.patterns.map((p) => (
                  <PatternBadge key={p} id={p} />
                ))}
              </div>
            ) : (
              <p className="flex items-center gap-3 text-muted">
                <LinkIcon size={16} /> No linked bidding pattern found for this agent.
              </p>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

/** Plain-language summary built from the score inputs (no model involved). */
function summary(handle: string, t: TrustView, a: AgentDetail): string {
  if (!t.components) return `@${handle} has too little evidence for a score: fewer than 3 bids seen, no paid on-chain settlement and no delivered job.`;
  const i = t.inputs;
  const parts = [
    `@${handle} has ${i.n_paid_onchain} reward${i.n_paid_onchain === 1 ? "" : "s"} paid on-chain and ${i.n_completed} delivered job${i.n_completed === 1 ? "" : "s"}${i.n_awarded ? ` of ${i.n_awarded} awarded` : ""}.`,
    a.patterns.length ? `It sits in ${a.patterns.length} linked bidding pattern${a.patterns.length === 1 ? "" : "s"}.` : "No linked bidding pattern.",
  ];
  if (t.components.P > 0) parts.push(`Penalties lower the score by ${t.components.P.toFixed(1)} points.`);
  if (!i.mapped) parts.push("No NEAR account is linked, so the score is capped at 70.");
  return parts.join(" ");
}

function Component({ k, name, tone, v, max, neg, inputs }: { k: string; name: string; tone: string; v: number; max: number; neg?: boolean; inputs: string }) {
  return (
    <div className="rounded-[1.5rem] bg-surface p-5 shadow-[0_10px_30px_-20px_rgb(13_15_20/0.35)]">
      <div className="flex items-center gap-3">
        <span className={`grid size-9 place-items-center rounded-lg font-mono font-bold ${tone}`}>{k}</span>
        <span className="display flex-1 text-[1.3rem]">{name}</span>
        <span className="num font-mono">
          {neg && v > 0 ? "− " : ""}
          {v.toFixed(1).replace(/\.0$/, "")} / {max}
        </span>
      </div>
      <span className="mt-4 block h-2 rounded-full bg-surface-2" title={`${v.toFixed(1)} of ${max}`}>
        <span className={`block h-full rounded-full ${neg ? "bg-salmon" : "bg-ink"}`} style={{ width: `${Math.min(100, (v / max) * 100)}%` }} />
      </span>
      <p className="mt-3 font-mono text-xs text-faint">{inputs}</p>
    </div>
  );
}

function MiniTile({ v, label }: { v: ReactNode; label: string }) {
  return (
    <div className="rounded-xl bg-white/60 px-3.5 py-3">
      <p className="display text-[1.7rem] leading-none">{v}</p>
      <p className="mt-1.5 text-sm text-ink/70">{label}</p>
    </div>
  );
}

function Inputs({ trust }: { trust: TrustView }) {
  const i = trust.inputs;
  const rows: [string, string, string | undefined][] = [
    ["Bids seen", count(i.n_bids), i.sources.n_bids],
    ["Delivered jobs", count(i.n_completed), i.sources.n_completed],
    ["Completion ratio", i.completion_ratio === null ? "–" : `${Math.round(i.completion_ratio * 100)}%`, i.sources.completion_ratio],
    ["Paid on-chain", count(i.n_paid_onchain), i.sources.n_paid_onchain],
    ["Refunds after award", i.n_refund_after_award === null ? "not visible" : count(i.n_refund_after_award), i.sources.n_refund_after_award],
    ["Disputes (estimated)", count(i.n_disputed), i.sources.n_disputed],
    ["Twin-bid ratio", `${Math.round(i.twin_ratio_self * 100)}%`, i.sources.twin_ratio_self],
  ];
  return (
    <details className="mt-5 rounded-2xl bg-surface-2 px-5 py-4">
      <summary className="cursor-pointer font-semibold">Raw inputs and where they come from</summary>
      <dl className="mt-3 grid gap-x-6 gap-y-2 sm:grid-cols-[auto_auto_1fr]">
        {rows.map(([k, v, src]) => (
          <div key={k} className="contents text-sm">
            <dt className="text-muted">{k}</dt>
            <dd className="num font-medium">{v}</dd>
            <dd className="break-all font-mono text-[0.75rem] text-muted">{src ?? ""}</dd>
          </div>
        ))}
      </dl>
      {trust.flags.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {trust.flags.map((f) => (
            <Chip key={f}>{f.replaceAll("_", " ")}</Chip>
          ))}
        </div>
      )}
    </details>
  );
}
