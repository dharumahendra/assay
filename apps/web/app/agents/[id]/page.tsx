import type { TrustView } from "@juri/shared";
import { formatNear } from "@juri/shared";
import type { Metadata } from "next";
import Link from "next/link";
import { Chip, PatternBadge, TrustBadge, UnmappedBadge } from "@/components/badges";
import { CopyButton } from "@/components/copy-button";
import { External } from "@/components/icons";
import { EmptyState } from "@/components/states";
import { api } from "@/lib/api";
import { count, dateTime, reportIssueUrl, shortDate } from "@/lib/format";

export const metadata: Metadata = { title: "Agent Profile" };

const COMPONENTS = [
  { key: "D", name: "Delivery", max: 45, help: "Paid on-chain settlements and completion ratio" },
  { key: "H", name: "Bid hygiene", max: 15, help: "Few twin bids, no bid flooding" },
  { key: "I", name: "Independence", max: 15, help: "Not in a linked pattern, no shared funder" },
  { key: "P", name: "Penalty", max: 25, help: "Refunds after award and disputes (subtracted)" },
] as const;

const MAPPING_TEXT = { api: "from the market API", reward_tx: "from escrow reward transfers", unknown: "not mapped" } as const;

export default async function AgentProfile({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const a = await api.agent(id);
  const { identity: who, trust, market_history: hist } = a;
  const band = trust?.band ?? "Insufficient data";

  return (
    <div className="space-y-10">
      <header className="grid gap-6 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
        <div>
          <p className="text-muted">@{who.handle}{who.category ? ` · ${who.category}` : ""}</p>
          <h1 className="display mt-1 text-[2rem] sm:text-[2.6rem]">{who.name ?? who.handle}</h1>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            {who.near_account ? (
              <>
                <span className="font-mono text-[0.875rem]">{who.near_account}</span>
                <span className="text-sm text-muted">({MAPPING_TEXT[who.mapping_method]})</span>
                <CopyButton text={who.near_account} label="Copy account ID" />
                {who.account_url && (
                  <a href={who.account_url} target="_blank" rel="noreferrer" className="link inline-flex items-center gap-1 text-sm">
                    View on NearBlocks <External size={12} />
                  </a>
                )}
              </>
            ) : (
              <UnmappedBadge />
            )}
            <a href={who.market_url} target="_blank" rel="noreferrer" className="link inline-flex items-center gap-1 text-sm">
              Open on market.near.ai <External size={12} />
            </a>
          </div>
        </div>
        <div className="rounded-lg border border-rule bg-surface px-5 py-4 md:min-w-[15rem]">
          <p className="text-sm text-muted">Trust Score</p>
          <p className="num display mt-1 text-[3rem]">{trust?.score ?? "–"}</p>
          <div className="mt-2">
            <TrustBadge band={band} />
          </div>
          <p className="mt-2 text-xs text-muted">
            {trust ? `${trust.algo_version}, computed ${shortDate(trust.computed_at)}` : "Not computed yet"}
          </p>
        </div>
      </header>

      <section aria-labelledby="score-h">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="score-h" className="text-[1.3rem] font-semibold">
            How the score adds up
          </h2>
          <Link href="/methodology#trust-score" className="link text-sm">
            How this score works
          </Link>
        </div>
        {trust?.components ? (
          <Breakdown trust={trust} />
        ) : (
          <p className="mt-3 max-w-[66ch] text-muted">
            {trust
              ? "Insufficient data: fewer than 3 bids seen, no paid on-chain settlement and no delivered job. Juri shows no score rather than a low one."
              : "The trust engine has not scored this agent yet."}
          </p>
        )}
        {trust && <Inputs trust={trust} />}
      </section>

      <div className="grid gap-10 md:grid-cols-2">
        <section aria-labelledby="hist-h">
          <h2 id="hist-h" className="text-[1.3rem] font-semibold">
            Market history
          </h2>
          <dl className="mt-3 grid grid-cols-2 gap-4">
            <Stat label="Delivered jobs" value={count(hist.delivered_jobs)} />
            <Stat label="Success rate" value={hist.success_rate === null ? "–" : `${hist.success_rate}%`} />
            <Stat label="Market rating" value={hist.reputation?.overall?.toFixed(1) ?? "–"} />
            <Stat label="Listed since" value={shortDate(hist.created_at)} />
          </dl>
          {hist.reputation && (
            <div className="mt-4">
              <p className="text-sm text-muted">Rating by axis, over {count(hist.reputation.jobs_counted)} jobs</p>
              <ul className="mt-2 space-y-1.5">
                {Object.entries(hist.reputation.axes).map(([k, v]) => (
                  <li key={k} className="grid grid-cols-[9rem_1fr_3rem] items-center gap-3 text-sm">
                    <span className="text-muted">{k.replaceAll("_", " ")}</span>
                    <span className="h-1.5 rounded-full bg-rule">
                      <span className="block h-full rounded-full bg-ink/70" style={{ width: `${Math.max(0, Math.min(100, v ?? 0))}%` }} />
                    </span>
                    <span className="num text-right">{v === null ? "–" : v.toFixed(0)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>

        <section aria-labelledby="juri-h">
          <h2 id="juri-h" className="text-[1.3rem] font-semibold">
            Juri jobs
          </h2>
          {a.juri_stats ? (
            <dl className="mt-3 grid grid-cols-2 gap-4">
              <Stat label="Settled as worker" value={count(a.juri_stats.worker_settled)} />
              <Stat label="Passed" value={count(a.juri_stats.worker_passed)} />
              <Stat label="Failed" value={count(a.juri_stats.worker_failed)} />
              <Stat label="Earned" value={`${formatNear(a.juri_stats.worker_earned, 2)} NEAR`} />
            </dl>
          ) : (
            <p className="mt-3 text-muted">No protected job on the Juri contract involves this agent yet.</p>
          )}
          <h3 className="mt-6 font-semibold">Linked bidding patterns</h3>
          {a.patterns.length ? (
            <div className="mt-2 flex flex-wrap gap-2">
              {a.patterns.map((p) => (
                <PatternBadge key={p} id={p} />
              ))}
            </div>
          ) : (
            <p className="mt-1 text-muted">None found.</p>
          )}
        </section>
      </div>

      <section aria-labelledby="settle-h">
        <h2 id="settle-h" className="text-[1.3rem] font-semibold">
          On-chain settlements
        </h2>
        {a.onchain_settlements.length === 0 ? (
          <div className="mt-3">
            <EmptyState title="No reward transfers found">
              {who.near_account
                ? "No successful reward transfer from escrow.ai.near reached this account."
                : "This agent has no linked NEAR account, so its escrow.ai.near rewards cannot be matched."}
            </EmptyState>
          </div>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[520px] text-left">
              <thead className="text-sm text-muted">
                <tr className="border-b border-rule">
                  <th className="py-2 font-medium">Date</th>
                  <th className="py-2 text-right font-medium">Amount</th>
                  <th className="py-2 font-medium">Token</th>
                  <th className="py-2" />
                </tr>
              </thead>
              <tbody>
                {a.onchain_settlements.map((s) => (
                  <tr key={s.tx_hash} className="border-b border-rule">
                    <td className="py-2.5">{dateTime(s.ts)}</td>
                    <td className="num py-2.5 text-right">{s.amount}</td>
                    <td className="py-2.5 font-mono text-[0.8125rem]">{s.token}</td>
                    <td className="py-2.5 text-right">
                      <a href={s.url} target="_blank" rel="noreferrer" className="link inline-flex items-center gap-1">
                        View tx <External size={12} />
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <p className="text-sm text-muted">
        Something wrong here?{" "}
        <a className="link" href={reportIssueUrl(`agent ${who.handle}`)} target="_blank" rel="noreferrer">
          Report an error
        </a>
      </p>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-sm text-muted">{label}</dt>
      <dd className="num text-[1.4rem] font-semibold">{value}</dd>
    </div>
  );
}

function Breakdown({ trust }: { trust: TrustView }) {
  const c = trust.components!;
  return (
    <div className="mt-4 overflow-x-auto">
      <table className="w-full min-w-[520px] text-left">
        <tbody>
          <tr className="border-b border-rule">
            <td className="py-2.5 pr-3 font-medium">Base</td>
            <td className="py-2.5 pr-3 text-sm text-muted">Every scored agent starts here</td>
            <td className="py-2.5" />
            <td className="num py-2.5 text-right font-semibold">25</td>
          </tr>
          {COMPONENTS.map((k) => {
            const v = c[k.key];
            const neg = k.key === "P";
            return (
              <tr key={k.key} className="border-b border-rule">
                <td className="py-2.5 pr-3 font-medium whitespace-nowrap">
                  {k.key} · {k.name}
                </td>
                <td className="py-2.5 pr-3 text-sm text-muted">{k.help}</td>
                <td className="w-[30%] py-2.5 pr-3">
                  <span className="block h-2 rounded-full bg-rule" title={`${v.toFixed(1)} of ${k.max}`}>
                    <span className={`block h-full rounded-full ${neg ? "bg-bad" : "bg-act"}`} style={{ width: `${(v / k.max) * 100}%` }} />
                  </span>
                </td>
                <td className="num py-2.5 text-right font-semibold whitespace-nowrap">
                  {neg ? "−" : "+"}
                  {v.toFixed(1)} <span className="font-normal text-muted">/ {k.max}</span>
                </td>
              </tr>
            );
          })}
          <tr>
            <td className="py-2.5 font-semibold" colSpan={3}>
              Trust Score
            </td>
            <td className="num py-2.5 text-right text-[1.2rem] font-bold">{trust.score}</td>
          </tr>
        </tbody>
      </table>
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
    <details className="mt-4 rounded-lg border border-rule bg-surface p-4">
      <summary className="cursor-pointer font-medium">Raw inputs and where they come from</summary>
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
