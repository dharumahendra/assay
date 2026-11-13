import type { MetricWindow } from "@juri/shared";
import type { Metadata } from "next";
import Link from "next/link";
import { EvidenceMark } from "@/components/evidence";
import { External } from "@/components/icons";
import { EmptyState } from "@/components/states";
import { api } from "@/lib/api";
import { count, dateTime, formatValue, metricCopy, repoFile } from "@/lib/format";

export const metadata: Metadata = { title: "Market Insight" };

export default async function Insights({ searchParams }: { searchParams: Promise<{ window?: string }> }) {
  const window: MetricWindow = (await searchParams).window === "30d" ? "30d" : "all";
  const [insights, meta, patterns] = await Promise.all([api.insights(window), api.meta(), api.patterns()]);
  const computedAt = insights.data.map((i) => i.computed_at).sort().at(-1);

  return (
    <div className="space-y-10">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="display text-[2rem] sm:text-[2.5rem]">Market Insight</h1>
          <p className="mt-2 max-w-[62ch] text-muted">
            How NEAR&apos;s AI Agent Market is doing, from public market data and escrow.ai.near settlements. Select a
            number to see the records it was computed from.
          </p>
          <p className="num mt-2 text-sm text-muted">Computed {dateTime(computedAt)}</p>
        </div>
        <div role="group" aria-label="Time window" className="inline-flex rounded-md border border-rule bg-surface p-0.5">
          {(["all", "30d"] as const).map((w) => (
            <Link
              key={w}
              href={w === "all" ? "/insights" : "/insights?window=30d"}
              aria-current={w === window ? "true" : undefined}
              className={`rounded px-3 py-1.5 text-sm ${w === window ? "bg-ink text-paper" : "text-muted hover:text-ink"}`}
            >
              {w === "all" ? "All time" : "Last 30 days"}
            </Link>
          ))}
        </div>
      </header>

      <section aria-label="Metrics">
        <ul className="divide-y divide-rule border-y border-rule">
          {insights.data.map((i) => {
            const c = metricCopy(i.id);
            return (
              <li key={i.id} className="grid gap-x-8 gap-y-2 py-6 md:grid-cols-[minmax(0,15rem)_minmax(0,1fr)]">
                <div>
                  <p className="text-[2.25rem] leading-none font-bold wide">
                    <EvidenceMark metricId={i.id} window={window} title={c.title}>
                      {formatValue(i)}
                    </EvidenceMark>
                  </p>
                  <p className="num mt-2 text-sm text-muted">
                    {count(i.numerator)} of {count(i.denominator)}
                    {i.window !== window && " · all time (no 30-day variant)"}
                  </p>
                </div>
                <div>
                  <h2 className="text-[1.15rem] font-semibold">{c.title}</h2>
                  <p className="text-ink">{formatValue(i)} {c.sentence}.</p>
                  {i.note && <p className="mt-2 max-w-[72ch] text-sm text-muted">{i.note}</p>}
                </div>
              </li>
            );
          })}
        </ul>
        {insights.data.length === 0 && <EmptyState title="No metrics yet">Run `pnpm sync` (or `pnpm load:snapshot`) to compute them.</EmptyState>}
      </section>

      <section aria-labelledby="patterns-h">
        <h2 id="patterns-h" className="text-[1.3rem] font-semibold">
          Top linked bidding patterns
        </h2>
        {patterns.data.length === 0 ? (
          <div className="mt-3">
            <EmptyState title="No linked bidding patterns in this dataset">
              Patterns need bid data. Since market API v2, bids are visible only to the job creator, so Juri only sees
              bids on its own jobs.
            </EmptyState>
          </div>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[520px] text-left">
              <thead className="text-sm text-muted">
                <tr className="border-b border-rule">
                  <th className="py-2 font-medium">Members</th>
                  <th className="py-2 font-medium">Agents</th>
                  <th className="py-2 font-medium">Links</th>
                  <th className="py-2" />
                </tr>
              </thead>
              <tbody>
                {patterns.data.slice(0, 5).map((p) => (
                  <tr key={p.id} className="border-b border-rule">
                    <td className="py-2.5">{p.members.map((x) => x.handle ?? x.id.slice(0, 8)).join(", ")}</td>
                    <td className="num py-2.5">{p.size}</td>
                    <td className="num py-2.5">{p.edge_count}</td>
                    <td className="py-2.5 text-right">
                      <Link href={`/patterns/${p.id}`} className="link">
                        View pattern
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section aria-labelledby="notes-h" className="grid gap-6 md:grid-cols-2">
        <div>
          <h2 id="notes-h" className="text-[1.3rem] font-semibold">
            About this data
          </h2>
          <ul className="mt-3 list-disc space-y-1.5 pl-5 text-muted">
            {meta.data_notes.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
        </div>
        <div className="rounded-lg border border-rule bg-surface p-5">
          <h3 className="font-semibold">Reproduce these numbers</h3>
          {meta.snapshot ? (
            <>
              <p className="mt-1 text-sm text-muted">Snapshot taken {dateTime(meta.snapshot.taken_at)}</p>
              <p className="mt-2 break-all font-mono text-[0.8125rem]">sha256 {meta.snapshot.sha256}</p>
              <a
                href={repoFile(`data/snapshots/${meta.snapshot.file}`)}
                target="_blank"
                rel="noreferrer"
                className="link mt-3 inline-flex items-center gap-1"
              >
                Download snapshot <External size={12} />
              </a>
            </>
          ) : (
            <p className="mt-1 text-sm text-muted">No snapshot has been exported yet.</p>
          )}
          <div className="mt-3 flex flex-wrap gap-x-4">
            <Link href="/methodology#metrics" className="link">
              How we compute this
            </Link>
            <Link href="/jobs" className="link">
              See all jobs
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
