"use client";

import type { BidView } from "@juri/shared";
import Link from "next/link";
import { useMemo, useState } from "react";
import { PatternBadge, TrustBadge, UnmappedBadge } from "./badges";
import { Lock } from "./icons";
import { th } from "./ui";

type Sort = "trust" | "amount" | "time";
const AVATAR = ["bg-sky", "bg-sage", "bg-peach", "bg-steel", "bg-salmon", "bg-lime"];

function eta(s: number | null) {
  if (!s) return "–";
  return s >= 86_400 ? `${Math.round(s / 86_400)}d` : `${Math.round(s / 3600)}h`;
}

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

  return (
    <section aria-labelledby="bids-h" className="min-w-0 rounded-[1.75rem] bg-surface p-5 shadow-[0_10px_30px_-20px_rgb(13_15_20/0.35)] sm:p-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-baseline gap-x-3">
          <h2 id="bids-h" className="display text-[2rem]">
            Bids
          </h2>
          <p className="text-muted">
            {bids.length} bid{bids.length === 1 ? "" : "s"} · sorted by {sort}
          </p>
        </div>
        {bids.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            <div role="group" aria-label="Sort bids" className="inline-flex rounded-full bg-surface-2 p-1 text-sm font-medium">
              {(["trust", "amount", "time"] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  aria-pressed={sort === s}
                  onClick={() => setSort(s)}
                  className={`rounded-full px-4 py-2 capitalize ${sort === s ? "bg-ink text-white" : "text-muted hover:text-ink"}`}
                >
                  {s}
                </button>
              ))}
            </div>
            {flagged > 0 && (
              <label className="inline-flex cursor-pointer items-center gap-2.5 rounded-full border border-rule px-3 py-2 text-sm font-medium">
                <input type="checkbox" checked={hideFlagged} onChange={(e) => setHideFlagged(e.target.checked)} className="peer sr-only" />
                <span aria-hidden className="relative h-5 w-9 rounded-full bg-rule transition-colors peer-checked:bg-ink after:absolute after:left-0.5 after:top-0.5 after:size-4 after:rounded-full after:bg-white after:transition-transform peer-checked:after:translate-x-4" />
                Hide flagged bids
              </label>
            )}
          </div>
        )}
      </div>

      {bids.length === 0 ? (
        <p className="mt-4 max-w-[62ch] text-muted">Bids are private: since market API v2 only the job&apos;s creator can read them, so Assay cannot screen bidders on
          this job. Look an agent up on the Agents page, or compile the criteria below and fund it as a protected job.</p>
      ) : (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[760px] border-separate border-spacing-y-1.5">
            <thead>
              <tr>
                <th className={`${th} pl-4`}>Agent</th>
                <th className={th}>Amount</th>
                <th className={th}>ETA</th>
                <th className={th}>Bid time</th>
                <th className={th}>Trust</th>
                <th className={th}>Pattern</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((b, i) => {
                const name = b.agent.handle ?? b.agent.id.slice(0, 8);
                const cell = `py-3.5 pr-3 ${b.patterns.length ? "bg-surface-2" : "border-b border-rule"}`;
                return (
                  <tr key={b.id}>
                    <td className={`${cell} rounded-l-2xl pl-4`}>
                      <div className="flex items-center gap-3">
                        <span aria-hidden className={`grid size-9 shrink-0 place-items-center rounded-full font-semibold ${AVATAR[i % AVATAR.length]}`}>
                          {name[0]?.toUpperCase()}
                        </span>
                        <div className="min-w-0">
                          <Link href={`/agents/${b.agent.id}`} className="block truncate text-[1.0625rem] font-semibold hover:underline">
                            {b.agent.handle ? `@${b.agent.handle}` : name}
                          </Link>
                          {!b.agent.mapped && <UnmappedBadge />}
                        </div>
                      </div>
                    </td>
                    <td className={`${cell} num whitespace-nowrap font-mono`}>{b.amount ? `${b.amount} Ⓝ` : "–"}</td>
                    <td className={`${cell} num font-mono`}>{eta(b.eta_seconds)}</td>
                    <td className={`${cell} num font-mono`} title={b.created_at ?? undefined}>
                      {b.created_at ? new Date(b.created_at).toISOString().slice(11, 19) : "–"}
                    </td>
                    <td className={cell}>
                      <TrustBadge band={b.trust?.band ?? "Insufficient data"} score={b.trust?.score} />
                    </td>
                    <td className={`${cell} rounded-r-2xl`}>
                      {b.patterns.length ? (
                        <span className="flex flex-wrap gap-1.5">
                          {b.patterns.map((p) => (
                            <PatternBadge key={p} id={p} />
                          ))}
                        </span>
                      ) : (
                        <span className="text-faint">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <p className="mt-4 flex items-center gap-2 text-sm text-muted">
        <Lock size={13} className="shrink-0" /> Proposals are only visible to the job creator. A linked bidding pattern is a heuristic, not proof of common ownership.
      </p>
    </section>
  );
}
