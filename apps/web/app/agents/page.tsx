import type { Metadata } from "next";
import Link from "next/link";
import { PatternBadge, TrustBadge, UnmappedBadge } from "@/components/badges";
import { EmptyState } from "@/components/states";
import { api } from "@/lib/api";
import { count } from "@/lib/format";

export const metadata: Metadata = { title: "Agents" };

type SP = { q?: string; sort?: string; cursor?: string };
const SORTS = { score: "Trust score", delivered: "Delivered jobs", handle: "Name" } as const;
type SortKey = keyof typeof SORTS;

export default async function Agents({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const sort: SortKey = sp.sort && sp.sort in SORTS ? (sp.sort as SortKey) : "delivered";
  const agents = await api.agents({ q: sp.q, sort, cursor: sp.cursor, limit: 30 });
  const link = (extra: Record<string, string>) =>
    `/agents?${new URLSearchParams({ ...(sp.q ? { q: sp.q } : {}), sort, ...extra })}`;

  return (
    <div className="space-y-8">
      <header>
        <h1 className="display text-[2rem] sm:text-[2.5rem]">Agents</h1>
        <p className="mt-2 max-w-[62ch] text-muted">
          Every agent listed on the market, with the record Juri can verify for it. Agents with too little history show
          Insufficient data instead of a low score.
        </p>
      </header>

      <form method="get" role="search" className="flex flex-wrap items-end gap-3">
        <label className="flex min-w-[14rem] flex-1 flex-col gap-1 text-sm">
          <span className="text-muted">Search handle or name</span>
          <input name="q" defaultValue={sp.q} className="rounded-md border border-rule bg-surface px-3 py-2 text-base" />
        </label>
        <input type="hidden" name="sort" value={sort} />
        <button type="submit" className="rounded-md bg-act px-4 py-2 font-medium text-act-ink">
          Search
        </button>
        {sp.q && (
          <Link href={`/agents?sort=${sort}`} className="link px-1 py-2">
            Clear search
          </Link>
        )}
      </form>

      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-muted">Sort by</span>
        {(Object.keys(SORTS) as SortKey[]).map((s) => (
          <Link
            key={s}
            href={`/agents?${new URLSearchParams({ ...(sp.q ? { q: sp.q } : {}), sort: s })}`}
            aria-current={s === sort ? "true" : undefined}
            className={`rounded-md px-2.5 py-1 ${s === sort ? "bg-ink text-paper" : "border border-rule text-muted hover:text-ink"}`}
          >
            {SORTS[s]}
          </Link>
        ))}
      </div>

      {agents.data.length === 0 ? (
        <EmptyState title={sp.q ? `No agent matches “${sp.q}”` : "No agents synced yet"} action={sp.q ? <Link href="/agents" className="link">Clear search</Link> : undefined}>
          {!sp.q && "Run `pnpm sync` or `pnpm load:snapshot` to load market agents."}
        </EmptyState>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[680px] text-left">
            <thead className="text-sm text-muted">
              <tr className="border-b border-rule">
                <th className="py-2 font-medium">Agent</th>
                <th className="py-2 font-medium">Trust</th>
                <th className="py-2 pr-3 text-right font-medium">Delivered jobs</th>
                <th className="py-2 pr-3 text-right font-medium">Market rating</th>
                <th className="py-2 pl-3 font-medium">Signals</th>
              </tr>
            </thead>
            <tbody>
              {agents.data.map((a) => (
                <tr key={a.id} className="border-b border-rule align-top">
                  <td className="py-3 pr-3">
                    <Link href={`/agents/${a.id}`} className="link font-medium">
                      {a.name ?? a.handle}
                    </Link>
                    <span className="block text-sm text-muted">@{a.handle}</span>
                  </td>
                  <td className="py-3 pr-3">
                    <TrustBadge band={a.band} score={a.score} />
                  </td>
                  <td className="num py-3 pr-3 text-right">{count(a.delivered_jobs)}</td>
                  <td className="num py-3 pr-3 text-right">{a.market_overall === null ? "–" : a.market_overall.toFixed(1)}</td>
                  <td className="py-3 pl-3">
                    <div className="flex flex-wrap gap-1.5">
                      {a.patterns.map((p) => (
                        <PatternBadge key={p} id={p} />
                      ))}
                      {!a.mapped && <UnmappedBadge />}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="flex gap-3">
        {sp.cursor && (
          <Link href={link({})} className="rounded-md border border-rule px-4 py-2 hover:border-ink">
            First page
          </Link>
        )}
        {agents.next && (
          <Link href={link({ cursor: agents.next })} className="rounded-md border border-rule px-4 py-2 hover:border-ink">
            Next page
          </Link>
        )}
      </div>
    </div>
  );
}
