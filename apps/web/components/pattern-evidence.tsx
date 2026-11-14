"use client";

import type { CoJobEvidence } from "@juri/shared";
import { useState } from "react";
import { ArrowUpRight, Flag } from "./icons";
import { th } from "./ui";

export type EvidenceRow = CoJobEvidence & { a_handle: string; b_handle: string; market_url: string };

const t = (iso: string | null) => (iso ? new Date(iso).toISOString().slice(11, 19) : "–");
const eta = (s: number | null) => (!s ? "–" : s >= 86_400 ? `${Math.round(s / 86_400)}d` : `${Math.round(s / 3600)}h`);
const gap = (s: number | null) => (s === null ? "–" : `+${Math.floor(s / 60)}m ${String(Math.round(s % 60)).padStart(2, "0")}s`);
const SHOW = 8;

export function PatternEvidence({ rows, reportUrl }: { rows: EvidenceRow[]; reportUrl: string }) {
  const [onlyTwins, setOnlyTwins] = useState(false);
  const [all, setAll] = useState(false);
  const filtered = onlyTwins ? rows.filter((r) => r.twin) : rows;
  const shown = all ? filtered : filtered.slice(0, SHOW);
  const jobs = new Set(rows.map((r) => r.job_id)).size;

  return (
    <section aria-labelledby="ev-h" className="rounded-[2rem] bg-surface p-5 shadow-[0_10px_30px_-20px_rgb(13_15_20/0.35)] sm:p-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="ev-h" className="display text-[1.9rem]">
          Evidence · {jobs} shared job{jobs === 1 ? "" : "s"}
        </h2>
        <div className="flex flex-wrap gap-2">
          <label className={`inline-flex cursor-pointer items-center gap-2.5 rounded-full px-4 py-2.5 text-sm font-semibold ${onlyTwins ? "bg-ink text-white" : "border border-rule"}`}>
            <input type="checkbox" checked={onlyTwins} onChange={(e) => setOnlyTwins(e.target.checked)} className="peer sr-only" />
            <span aria-hidden className="relative h-5 w-9 rounded-full bg-rule transition-colors peer-checked:bg-lime after:absolute after:left-0.5 after:top-0.5 after:size-4 after:rounded-full after:bg-white after:transition-transform peer-checked:after:translate-x-4 peer-checked:after:bg-ink" />
            Show only twin bids
          </label>
          <a href={reportUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-full border border-rule px-4 py-2.5 text-sm font-semibold hover:border-ink">
            <Flag size={13} /> Report an error
          </a>
        </div>
      </div>
      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[760px] border-separate border-spacing-y-1.5">
          <thead>
            <tr>
              <th className={`${th} pl-4`}>Job</th>
              <th className={th}>Agent</th>
              <th className={th}>Amount</th>
              <th className={th}>ETA</th>
              <th className={th}>Bid time</th>
              <th className={th}>Δ time</th>
              <th className={th}>
                <span className="sr-only">Open</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {shown.map((r) =>
              (["a", "b"] as const).map((side, k) => {
                const bid = r[side];
                const bg = r.twin ? "bg-surface-2" : "";
                const first = k === 0;
                return (
                  <tr key={`${r.job_id}-${bid.bid_id}`}>
                    <td className={`${bg} py-3 pl-4 pr-3 ${first ? "rounded-tl-2xl" : "rounded-bl-2xl"}`}>
                      {first && (
                        <span className="font-semibold">
                          <span className="font-mono text-sm">{r.job_id.slice(0, 8)}</span>
                          {r.twin && <span className="ml-2 rounded-full bg-ink px-2 py-0.5 text-[0.6875rem] font-semibold text-white">twin</span>}
                        </span>
                      )}
                    </td>
                    <td className={`${bg} py-3 pr-3 font-mono text-sm`}>@{side === "a" ? r.a_handle : r.b_handle}</td>
                    <td className={`${bg} num py-3 pr-3 font-mono text-sm`}>{bid.amount ? `${bid.amount} Ⓝ` : "–"}</td>
                    <td className={`${bg} num py-3 pr-3 font-mono text-sm`}>{eta(bid.eta_seconds)}</td>
                    <td className={`${bg} num py-3 pr-3 font-mono text-sm`} title={bid.created_at ?? undefined}>
                      {t(bid.created_at)}
                    </td>
                    <td className={`${bg} num py-3 pr-3 font-mono text-sm`}>{first ? "–" : gap(r.dt_seconds)}</td>
                    <td className={`${bg} py-3 pr-4 text-right ${first ? "rounded-tr-2xl" : "rounded-br-2xl"}`}>
                      {first && (
                        <a href={r.market_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 whitespace-nowrap font-semibold text-act hover:underline">
                          Open job <ArrowUpRight size={12} />
                        </a>
                      )}
                    </td>
                  </tr>
                );
              }),
            )}
          </tbody>
        </table>
      </div>
      {filtered.length === 0 && <p className="mt-3 text-muted">No twin bids among these shared jobs.</p>}
      {!all && filtered.length > SHOW && (
        <button type="button" onClick={() => setAll(true)} className="mt-3 font-semibold text-act hover:underline">
          + {filtered.length - SHOW} more
        </button>
      )}
    </section>
  );
}
