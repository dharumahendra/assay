"use client";

import type { BidView } from "@juri/shared";
import Link from "next/link";
import { useMemo, useState } from "react";
import { PatternBadge, TrustBadge, UnmappedBadge } from "./badges";
import { EmptyState } from "./states";

type Sort = "trust" | "amount" | "time";

export function BidsTable({ bids }: { bids: BidView[] }) {
  const [sort, setSort] = useState<Sort>("trust");
  const [hideFlagged, setHideFlagged] = useState(false);
  const flagged = bids.filter((b) => b.patterns.length > 0).length;

  const rows = useMemo(() => {
    const r = hideFlagged ? bids.filter((b) => b.patterns.length === 0) : [...bids];
    const amt = (b: BidView) => (b.amount === null ? -1 : Number(b.amount));
    const ts = (b: BidView) => (b.created_at ? Date.parse(b.created_at) : 0);
    const score = (b: BidView) => b.trust?.score ?? -1;
    return r.sort((a, b) => (sort === "trust" ? score(b) - score(a) : sort === "amount" ? amt(a) - amt(b) : ts(a) - ts(b)));
  }, [bids, sort, hideFlagged]);

  if (bids.length === 0)
    return <EmptyState title="No bids on this job yet">Bids show here once agents bid. Only the job creator can read proposal text.</EmptyState>;

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-3 text-sm">
        <div role="group" aria-label="Sort bids" className="inline-flex rounded-md border border-rule bg-surface p-0.5">
          {(["trust", "amount", "time"] as const).map((s) => (
            <button
              key={s}
              type="button"
              aria-pressed={sort === s}
              onClick={() => setSort(s)}
              className={`rounded px-2.5 py-1 ${sort === s ? "bg-ink text-paper" : "text-muted hover:text-ink"}`}
            >
              Sort by {s}
            </button>
          ))}
        </div>
        {flagged > 0 && (
          <label className="inline-flex items-center gap-2">
            <input type="checkbox" checked={hideFlagged} onChange={(e) => setHideFlagged(e.target.checked)} />
            Hide bids in a linked pattern ({flagged})
          </label>
        )}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-left">
          <thead className="text-sm text-muted">
            <tr className="border-b border-rule">
              <th className="py-2 font-medium">Agent</th>
              <th className="py-2 text-right font-medium">Amount</th>
              <th className="py-2 font-medium">ETA</th>
              <th className="py-2 font-medium">Bid at</th>
              <th className="py-2 font-medium">Trust</th>
              <th className="py-2 font-medium">Signals</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((b) => (
              <tr key={b.id} className="border-b border-rule align-top">
                <td className="py-3 pr-3">
                  <Link href={`/agents/${b.agent.id}`} className="link font-medium">
                    {b.agent.handle ?? b.agent.id.slice(0, 8)}
                  </Link>
                </td>
                <td className="num py-3 pr-3 text-right">{b.amount ?? "–"}</td>
                <td className="num py-3 pr-3">{b.eta_seconds ? `${Math.round(b.eta_seconds / 3600)} h` : "–"}</td>
                <td className="num py-3 pr-3 text-muted">{b.created_at ? new Date(b.created_at).toISOString().slice(0, 16).replace("T", " ") : "–"}</td>
                <td className="py-3 pr-3">
                  <TrustBadge band={b.trust?.band ?? "Insufficient data"} score={b.trust?.score} />
                </td>
                <td className="flex flex-wrap gap-1.5 py-3">
                  {b.patterns.map((p) => (
                    <PatternBadge key={p} id={p} />
                  ))}
                  {!b.agent.mapped && <UnmappedBadge />}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-sm text-muted">Proposals are only visible to the job creator.</p>
    </div>
  );
}
