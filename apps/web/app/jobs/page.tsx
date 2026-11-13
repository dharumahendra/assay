import type { Metadata } from "next";
import Link from "next/link";
import { External } from "@/components/icons";
import { EmptyState } from "@/components/states";
import { api } from "@/lib/api";
import { count, shortDate } from "@/lib/format";

export const metadata: Metadata = { title: "Job Explorer" };

type SP = { q?: string; status?: string; tag?: string; cursor?: string };

const STATUSES = ["open", "in_progress", "completed", "closed", "expired"];

export default async function Jobs({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const jobs = await api.jobs({ q: sp.q, status: sp.status, tag: sp.tag, cursor: sp.cursor, limit: 25 });
  const filtered = !!(sp.q || sp.status || sp.tag);
  const nextHref = jobs.next ? `/jobs?${new URLSearchParams({ ...stripEmpty(sp), cursor: jobs.next })}` : null;

  return (
    <div className="space-y-8">
      <header>
        <h1 className="display text-[2rem] sm:text-[2.5rem]">Job Explorer</h1>
        <p className="mt-2 max-w-[62ch] text-muted">Pick a market job to screen its bidders and draft acceptance criteria.</p>
      </header>

      <form method="get" className="flex flex-wrap items-end gap-3" role="search">
        <label className="flex min-w-[14rem] flex-1 flex-col gap-1 text-sm">
          <span className="text-muted">Search title or description</span>
          <input name="q" defaultValue={sp.q} className="rounded-md border border-rule bg-surface px-3 py-2 text-base" />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-muted">Status</span>
          <select name="status" defaultValue={sp.status ?? ""} className="rounded-md border border-rule bg-surface px-3 py-2 text-base">
            <option value="">Any</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {s.replace("_", " ")}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-muted">Tag</span>
          <input name="tag" defaultValue={sp.tag} className="w-36 rounded-md border border-rule bg-surface px-3 py-2 text-base" />
        </label>
        <button type="submit" className="rounded-md bg-act px-4 py-2 font-medium text-act-ink">
          Search
        </button>
        {filtered && (
          <Link href="/jobs" className="link px-1 py-2">
            Clear filters
          </Link>
        )}
      </form>

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
            Since market API v2, the job board and its bids need an agent token, so Juri only syncs its own jobs. Agent
            records and escrow settlements are still public.
          </EmptyState>
        )
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left">
            <thead className="text-sm text-muted">
              <tr className="border-b border-rule">
                <th className="py-2 font-medium">Job</th>
                <th className="py-2 font-medium">Status</th>
                <th className="py-2 font-medium">Budget</th>
                <th className="py-2 text-right font-medium">Bids</th>
                <th className="py-2 text-right font-medium">Linked-pattern bids</th>
                <th className="py-2 font-medium">Posted</th>
                <th className="py-2" />
              </tr>
            </thead>
            <tbody>
              {jobs.data.map((j) => (
                <tr key={j.id} className="border-b border-rule align-top">
                  <td className="max-w-[24rem] py-3 pr-4 font-medium">{j.title ?? j.id}</td>
                  <td className="py-3 text-muted">{j.status ?? "–"}</td>
                  <td className="num py-3">{j.budget.amount ? `${j.budget.amount} ${j.budget.token ?? ""}` : "–"}</td>
                  <td className="num py-3 text-right">{count(j.bid_count)}</td>
                  <td className="num py-3 text-right">{count(j.flagged_bids)}</td>
                  <td className="py-3 text-muted">{shortDate(j.created_at)}</td>
                  <td className="py-3 text-right whitespace-nowrap">
                    <Link href={`/jobs/${j.id}`} className="rounded-md bg-act px-3 py-1 text-sm font-medium text-act-ink">
                      Analyze
                    </Link>
                    <a
                      href={j.market_url}
                      target="_blank"
                      rel="noreferrer"
                      className="ml-2 inline-flex p-1 text-muted hover:text-ink"
                      aria-label="Open on market"
                      title="Open on market"
                    >
                      <External />
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {nextHref && (
        <Link href={nextHref} className="inline-block rounded-md border border-rule px-4 py-2 hover:border-ink">
          Next page
        </Link>
      )}
    </div>
  );
}

function stripEmpty(sp: SP): Record<string, string> {
  return Object.fromEntries(Object.entries(sp).filter(([k, v]) => k !== "cursor" && v)) as Record<string, string>;
}
