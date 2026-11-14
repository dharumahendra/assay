import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, ChevronDown, Close, External, LinkIcon, Search } from "@/components/icons";
import { EmptyState } from "@/components/states";
import { JobStatusPill } from "@/components/status";
import { PageHead, th } from "@/components/ui";
import { api } from "@/lib/api";
import { count, shortDate } from "@/lib/format";

export const metadata: Metadata = { title: "Job Explorer" };

type SP = { q?: string; status?: string; tag?: string; cursor?: string };

const STATUSES = ["open", "in_progress", "completed", "disputed", "closed", "expired"];

export default async function Jobs({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const jobs = await api.jobs({ q: sp.q, status: sp.status, tag: sp.tag, cursor: sp.cursor, limit: 25 });
  const filtered = !!(sp.q || sp.status || sp.tag);
  const nextHref = jobs.next ? `/jobs?${new URLSearchParams({ ...stripEmpty(sp), cursor: jobs.next })}` : null;

  return (
    <div>
      <PageHead eyebrow="job explorer" title="Pick a real job to screen" texture="dots">
        <form method="get" role="search" className="flex flex-wrap items-center gap-2.5">
          <label className="flex min-w-[16rem] flex-1 items-center gap-3 rounded-full border border-rule bg-surface py-1.5 pl-5 pr-1.5">
            <Search size={16} className="shrink-0 text-faint" />
            <span className="sr-only">Search title or description</span>
            <input
              name="q"
              defaultValue={sp.q}
              placeholder="Search title or description — e.g. “report”"
              className="min-w-0 flex-1 bg-transparent py-1.5 outline-none placeholder:text-faint"
            />
            <button type="submit" className="rounded-full bg-ink px-5 py-2 text-sm font-semibold text-white">
              Search
            </button>
          </label>
          <label className="relative inline-flex items-center rounded-full bg-ink text-sm font-semibold text-white">
            <ChevronDown size={14} className="pointer-events-none absolute left-4" />
            <span className="sr-only">Status</span>
            <select name="status" defaultValue={sp.status ?? ""} className="appearance-none rounded-full bg-transparent py-3 pl-10 pr-5 outline-none">
              <option value="" className="text-ink">
                Status: Any
              </option>
              {STATUSES.map((s) => (
                <option key={s} value={s} className="text-ink">
                  Status: {label(s)}
                </option>
              ))}
            </select>
          </label>
          <label className="inline-flex items-center gap-2 rounded-full bg-ink py-1.5 pl-4 pr-1.5 text-sm font-semibold text-white">
            <span>Tag:</span>
            <input name="tag" defaultValue={sp.tag} placeholder="any" className="w-28 rounded-full bg-white/10 px-3 py-1.5 outline-none placeholder:text-white/50" />
          </label>
          {filtered && (
            <Link href="/jobs" className="inline-flex items-center gap-2 rounded-full border border-rule bg-surface px-4 py-3 text-sm font-semibold hover:border-ink">
              <Close size={13} /> Clear filters
            </Link>
          )}
        </form>
      </PageHead>

      {jobs.data.length === 0 ? (
        filtered ? (
          <EmptyState title="No jobs match these filters" action={<Link href="/jobs" className="link">Clear filters</Link>} />
        ) : (
          <EmptyState
            title="No market jobs in this dataset"
            action={
              <div className="flex flex-wrap gap-x-5">
                <Link href="/agents" className="link">
                  Browse agents instead
                </Link>
                <Link href="/insights" className="link">
                  See market-wide numbers
                </Link>
              </div>
            }
          >
            The job board has not been synced into this dataset yet. Run <code className="font-mono text-[0.875rem]">pnpm sync:jobs</code>{" "}
            with a market agent token, or load a snapshot that includes jobs. Agent records and escrow settlements are always
            available.
          </EmptyState>
        )
      ) : (
        <>
        <p className="mb-4 max-w-[72ch] text-sm text-muted">
          A recent page of the public market job board (test runs and placeholder jobs left out). Bids are private to each
          job&apos;s creator since market API v2, so open a job to compile its acceptance criteria rather than to screen bids.
        </p>
        <div className="overflow-x-auto rounded-[1.75rem] bg-surface px-4 py-3 shadow-[0_10px_30px_-20px_rgb(13_15_20/0.35)] sm:px-6">
          <table className="w-full min-w-[780px]">
            <thead>
              <tr className="border-b border-rule">
                <th className={`${th} pl-3`}>Job</th>
                <th className={th}>Status</th>
                <th className={th}>Budget</th>
                <th className={th}>Bids</th>
                <th className={th}>Flagged</th>
                <th className={th}>Posted</th>
                <th className={th} />
              </tr>
            </thead>
            <tbody>
              {jobs.data.map((j) => (
                <tr key={j.id} className="border-b border-rule last:border-0">
                  <td className="max-w-[30rem] py-4 pl-3 pr-4">
                    <span className="font-medium">{j.title ?? j.id}</span>
                    <a
                      href={j.market_url}
                      target="_blank"
                      rel="noreferrer"
                      className="ml-2 inline-flex align-[-2px] text-faint hover:text-ink"
                      aria-label="Open on market.near.ai"
                      title="Open on market.near.ai"
                    >
                      <External size={13} />
                    </a>
                  </td>
                  <td className="py-4 pr-4">
                    <JobStatusPill status={j.status} />
                  </td>
                  <td className="num py-4 pr-4 font-mono text-[0.875rem]">{j.budget.amount ? `${j.budget.amount} ${j.budget.token ?? "N"}` : "–"}</td>
                  <td className="num py-4 pr-4 font-mono text-[0.875rem]">
                    {j.bid_count ? count(j.bid_count) : <span className="text-faint" title="Bids are visible only to the job's creator">private</span>}
                  </td>
                  <td className="num py-4 pr-4 font-mono text-[0.875rem]">
                    {j.flagged_bids ? (
                      <span className="inline-flex items-center gap-1 font-semibold">
                        <LinkIcon size={13} /> {count(j.flagged_bids)}
                      </span>
                    ) : (
                      <span className="text-faint">{j.bid_count ? "0" : "–"}</span>
                    )}
                  </td>
                  <td className="py-4 pr-4 text-muted">{shortDate(j.created_at)}</td>
                  <td className="py-4 pr-3 text-right">
                    <Link href={`/jobs/${j.id}`} className="inline-flex items-center gap-1 font-semibold text-act hover:underline">
                      Analyze <ArrowRight size={13} />
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        </>
      )}
      {nextHref && (
        <div className="mt-8 flex justify-center">
          <Link href={nextHref} className="inline-flex items-center gap-2 rounded-full border border-ink/40 px-6 py-3 font-semibold hover:border-ink">
            Load more <ChevronDown size={14} />
          </Link>
        </div>
      )}
    </div>
  );
}

const label = (s: string) => s.replace("_", " ").replace(/^./, (c) => c.toUpperCase());

function stripEmpty(sp: SP): Record<string, string> {
  return Object.fromEntries(Object.entries(sp).filter(([k, v]) => k !== "cursor" && v)) as Record<string, string>;
}
