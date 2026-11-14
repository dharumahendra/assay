import type { Insight, MetricWindow } from "@juri/shared";
import type { Metadata } from "next";
import Link from "next/link";
import { EvidenceMark } from "@/components/evidence";
import { ArrowRight, ArrowUpRight, Download, LinkIcon } from "@/components/icons";
import { EmptyState } from "@/components/states";
import { Card, CardHead, GhostLink, PageHead, PrimaryLink, th } from "@/components/ui";
import { api } from "@/lib/api";
import { count, formatValue, metricCopy, repoFile } from "@/lib/format";

export const metadata: Metadata = { title: "Market Insight" };

/** Card colour per metric, after the Insight frame (M1 is the large dark card). */
const TONE: Record<string, string> = { M2: "bg-salmon", M3: "bg-sky", M4: "bg-steel", M5: "bg-sage", M6: "bg-peach" };

export default async function Insights({ searchParams }: { searchParams: Promise<{ window?: string }> }) {
  const window: MetricWindow = (await searchParams).window === "30d" ? "30d" : "all";
  const [insights, meta, patterns] = await Promise.all([api.insights(window), api.meta(), api.patterns()]);
  const computedAt = insights.data.map((i) => i.computed_at).sort().at(-1);
  const [lead, ...rest] = insights.data;
  const total = insights.data.length;
  const sha = meta.snapshot?.sha256;

  return (
    <div className="space-y-6">
      <PageHead
        eyebrow="market insight"
        title={
          <>
            Where agent work
            <br />
            breaks down
          </>
        }
        texture="hlines"
        aside={
          <div className="flex flex-col items-end gap-3">
            <div role="group" aria-label="Time window" className="inline-flex rounded-full bg-surface p-1 shadow-sm">
              {(["all", "30d"] as const).map((w) => (
                <Link
                  key={w}
                  href={w === "all" ? "/insights" : "/insights?window=30d"}
                  aria-current={w === window ? "true" : undefined}
                  className={`rounded-full px-4 py-2 text-sm font-semibold ${w === window ? "bg-ink text-white" : "text-muted hover:text-ink"}`}
                >
                  {w === "all" ? "All time" : "Last 30 days"}
                </Link>
              ))}
            </div>
            <p className="font-mono text-[0.6875rem] text-faint">
              {computedAt && `computed_at ${computedAt.slice(0, 16).replace("T", " ")} UTC`}
              {sha && ` · snapshot ${sha.slice(0, 4)}…${sha.slice(-4)}`} · algo {meta.algo_version}
            </p>
          </div>
        }
      />

      {insights.data.length === 0 ? (
        <EmptyState title="No metrics yet">Run `pnpm sync` (or `pnpm load:snapshot`) to compute them.</EmptyState>
      ) : (
        <section aria-label="Metrics" className="grid gap-4 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,2fr)]">
          {lead && <LeadCard i={lead} window={window} total={total} />}
          <div className="grid gap-4 sm:grid-cols-6">
            {rest.map((i, k) => (
              <MetricCard key={i.id} i={i} window={window} total={total} className={k < 3 ? "sm:col-span-2" : "sm:col-span-3"} />
            ))}
          </div>
        </section>
      )}

      <Card>
        <CardHead
          title={
            <span className="inline-flex items-center gap-2">
              <LinkIcon size={20} /> Top linked bidding patterns (heuristic)
            </span>
          }
          actions={<GhostLink href="/jobs">See all jobs</GhostLink>}
        />
        {patterns.data.length === 0 ? (
          <p className="max-w-[70ch] text-muted">
            No linked bidding patterns in this dataset. Patterns need bid data, and since market API v2 bids are visible
            only to the job creator, so Assay only sees bids on its own jobs.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px]">
              <thead>
                <tr className="border-b border-rule">
                  <th className={`${th} pl-3`}>Pattern</th>
                  <th className={th}>Members</th>
                  <th className={th}>Size</th>
                  <th className={th}>Links</th>
                  <th className={th} />
                </tr>
              </thead>
              <tbody>
                {patterns.data.slice(0, 5).map((p) => (
                  <tr key={p.id} className="border-b border-rule last:border-0">
                    <td className="py-4 pl-3 pr-4 font-mono text-[0.875rem] font-semibold">{p.id}</td>
                    <td className="py-4 pr-4">{p.members.map((x) => (x.handle ? `@${x.handle}` : x.id.slice(0, 8))).join(" · ")}</td>
                    <td className="num py-4 pr-4 font-mono text-[0.875rem]">{p.size}</td>
                    <td className="num py-4 pr-4 font-mono text-[0.875rem]">{p.edge_count}</td>
                    <td className="py-4 pr-3 text-right">
                      <Link href={`/patterns/${p.id}`} className="inline-flex items-center gap-1 font-semibold text-act hover:underline">
                        View pattern <ArrowRight size={13} />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card>
        <CardHead title="About this data" />
        <dl className="grid gap-x-8 md:grid-cols-2">
          {insights.data
            .filter((i) => i.note)
            .map((i) => (
              <div key={i.id} className="border-t border-rule py-3">
                <dt className="font-semibold">
                  {i.id} · {metricCopy(i.id).title}
                </dt>
                <dd className="mt-1 text-sm text-muted">{i.note}</dd>
              </div>
            ))}
        </dl>
        {meta.data_notes.length > 0 && (
          <ul className="mt-4 space-y-2 border-t border-rule pt-4 text-muted">
            {meta.data_notes.map((n) => (
              <li key={n} className="flex gap-2.5">
                <span aria-hidden className="mt-2.5 size-1.5 shrink-0 bg-ink" />
                {n}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <section className="flex flex-wrap items-center justify-between gap-5 rounded-[1.75rem] bg-sky px-6 py-7 sm:px-8">
        <div>
          <h2 className="display text-[1.6rem]">Every number here is reproducible.</h2>
          <p className="mt-1 text-muted">
            Download the snapshot, check its sha256, and re-run the trust engine to get identical scores (algo {meta.algo_version}).
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <GhostLink href="/methodology#metrics">How we compute this</GhostLink>
          {meta.snapshot && (
            <PrimaryLink href={repoFile(`data/snapshots/${meta.snapshot.file}`)} external icon={<Download size={16} />}>
              Download snapshot
            </PrimaryLink>
          )}
        </div>
      </section>
    </div>
  );
}

function value(i: Insight) {
  return i.id === "M2" && i.unit === "ratio" ? (i.value ?? 0).toFixed(2) : formatValue(i);
}

function caption(i: Insight, window: MetricWindow) {
  return `${count(i.numerator)} of ${count(i.denominator)}${i.window !== window ? " · all time (no 30-day variant)" : ""}`;
}

function LeadCard({ i, window, total }: { i: Insight; window: MetricWindow; total: number }) {
  const c = metricCopy(i.id);
  return (
    <article className="flex min-h-[22rem] flex-col justify-between rounded-[1.75rem] bg-[#0b0d12] p-6 text-white sm:p-8">
      <div className="flex items-center justify-between gap-3">
        <span className="hand text-[1.5rem] text-lime">
          {i.id}/{total}
        </span>
        <span className="rounded-full border border-white/25 px-3 py-1 text-xs text-white/80">
          {count(i.denominator)} records behind it
        </span>
      </div>
      <div>
        <h2 className="text-[1.5rem] font-semibold">{c.title}</h2>
        <EvidenceMark metricId={i.id} window={window} title={c.title} marker={false} className="display mt-2 text-[5.5rem] leading-[0.9] text-lime sm:text-[7rem]">
          {value(i)}
        </EvidenceMark>
        <p className="mt-4 font-mono text-[0.75rem] text-white/60">
          {caption(i, window)} · {c.sentence}
        </p>
      </div>
    </article>
  );
}

function MetricCard({ i, window, total, className }: { i: Insight; window: MetricWindow; total: number; className: string }) {
  const c = metricCopy(i.id);
  return (
    <article className={`flex min-h-[10.5rem] flex-col justify-between rounded-[1.75rem] p-5 sm:p-6 ${TONE[i.id] ?? "bg-surface"} ${className}`}>
      <div className="flex items-start justify-between gap-3">
        <h2 className="font-semibold">
          <span className="mr-1.5">
            {i.id}/{total}
          </span>
          {c.title}
        </h2>
        <ArrowUpRight size={14} className="mt-1 shrink-0" />
      </div>
      <div>
        <EvidenceMark metricId={i.id} window={window} title={c.title} marker={false} className="display text-[2.8rem] leading-none sm:text-[3.2rem]">
          {value(i)}
        </EvidenceMark>
        <p className="mt-2 font-mono text-[0.6875rem] text-ink/60">{caption(i, window)}</p>
      </div>
    </article>
  );
}
