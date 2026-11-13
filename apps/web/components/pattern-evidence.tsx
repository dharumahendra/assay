"use client";

import type { CoJobEvidence } from "@juri/shared";
import { useState } from "react";
import { External } from "./icons";

export type EvidenceRow = CoJobEvidence & { a_handle: string; b_handle: string; market_url: string };

const t = (iso: string | null) => (iso ? new Date(iso).toISOString().slice(0, 16).replace("T", " ") : "–");

export function PatternEvidence({ rows }: { rows: EvidenceRow[] }) {
  const [onlyTwins, setOnlyTwins] = useState(false);
  const shown = onlyTwins ? rows.filter((r) => r.twin) : rows;
  return (
    <div>
      <label className="mb-3 inline-flex items-center gap-2 text-sm">
        <input type="checkbox" checked={onlyTwins} onChange={(e) => setOnlyTwins(e.target.checked)} />
        Show only twin bids
      </label>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead className="text-muted">
            <tr className="border-b border-rule">
              <th className="py-2 font-medium">Job</th>
              <th className="py-2 font-medium">Agent</th>
              <th className="py-2 text-right font-medium">Amount</th>
              <th className="py-2 font-medium">ETA</th>
              <th className="py-2 font-medium">Bid at (UTC)</th>
              <th className="py-2 text-right font-medium">Gap</th>
              <th className="py-2 font-medium">Twin</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((r) =>
              (["a", "b"] as const).map((side, k) => {
                const bid = r[side];
                return (
                  <tr key={`${r.job_id}-${bid.bid_id}`} className={k === 1 ? "border-b border-rule" : ""}>
                    {k === 0 && (
                      <td rowSpan={2} className="py-2 pr-3 align-top">
                        <a href={r.market_url} target="_blank" rel="noreferrer" className="link inline-flex items-center gap-1">
                          Open job <External size={11} />
                        </a>
                        <span className="block font-mono text-[0.75rem] text-muted">{r.job_id.slice(0, 8)}</span>
                      </td>
                    )}
                    <td className="py-1.5 pr-3">{side === "a" ? r.a_handle : r.b_handle}</td>
                    <td className="num py-1.5 pr-3 text-right">{bid.amount ?? "–"}</td>
                    <td className="num py-1.5 pr-3">{bid.eta_seconds ? `${Math.round(bid.eta_seconds / 3600)} h` : "–"}</td>
                    <td className="num py-1.5 pr-3">{t(bid.created_at)}</td>
                    {k === 0 && (
                      <>
                        <td rowSpan={2} className="num py-2 pr-3 text-right align-top">
                          {r.dt_seconds === null ? "–" : `${Math.round(r.dt_seconds / 60)} min`}
                        </td>
                        <td rowSpan={2} className="py-2 align-top">
                          {r.twin ? "Yes" : "No"}
                        </td>
                      </>
                    )}
                  </tr>
                );
              }),
            )}
          </tbody>
        </table>
      </div>
      {shown.length === 0 && <p className="mt-3 text-muted">No twin bids among these shared jobs.</p>}
    </div>
  );
}
