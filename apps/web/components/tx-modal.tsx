"use client";

/**
 * One modal for every contract call (create_job, withdraw, cancel_job, reclaim_expired, submit).
 * Phases: review → waiting for the wallet → done | failed. Errors go through explainError (T6.6).
 */
import { useEffect, useRef, useState, type ReactNode } from "react";
import { explainError, type FriendlyError } from "@/lib/wallet/errors";
import { outcomeFailure, outcomeHash, txUrl, type Outcome } from "@/lib/wallet/near";

export type TxPhase = { s: "review" } | { s: "signing" } | { s: "done"; hash: string | null; outcome: Outcome | null } | { s: "failed"; error: FriendlyError; hash: string | null };

export interface TxModalProps {
  open: boolean;
  title: string;
  /** label/value rows shown before signing */
  rows: [string, ReactNode][];
  note?: ReactNode;
  confirmLabel: string;
  /** Runs the wallet call. Resolves null when a redirect wallet left the page. */
  run: () => Promise<Outcome | null>;
  onClose: () => void;
  /** Rendered on success, e.g. a link to the new job. */
  done?: (o: Outcome | null, hash: string | null) => ReactNode;
  /** Start in a given phase (e.g. coming back from a redirect wallet). */
  initial?: TxPhase;
}

export function TxModal({ open, title, rows, note, confirmLabel, run, onClose, done, initial }: TxModalProps) {
  const [phase, setPhase] = useState<TxPhase>(initial ?? { s: "review" });
  const dlg = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) setPhase(initial ?? { s: "review" });
  }, [open, initial]);

  useEffect(() => {
    if (!open) return;
    dlg.current?.focus();
    const esc = (e: KeyboardEvent) => e.key === "Escape" && phase.s !== "signing" && onClose();
    document.addEventListener("keydown", esc);
    return () => document.removeEventListener("keydown", esc);
  }, [open, phase.s, onClose]);

  if (!open) return null;

  async function go() {
    setPhase({ s: "signing" });
    try {
      const o = await run();
      const failure = outcomeFailure(o);
      if (failure) setPhase({ s: "failed", error: explainError(failure), hash: outcomeHash(o) });
      else setPhase({ s: "done", hash: outcomeHash(o), outcome: o });
    } catch (e) {
      console.error("[tx]", e);
      setPhase({ s: "failed", error: explainError(e), hash: null });
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-[#0D0F14]/50 p-4 sm:items-center" onMouseDown={(e) => e.target === e.currentTarget && phase.s !== "signing" && onClose()}>
      <div ref={dlg} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="tx-title" className="w-full max-w-md rounded-3xl bg-surface p-6 shadow-2xl outline-none">
        <div className="flex items-start justify-between gap-4">
          <h2 id="tx-title" className="text-xl font-semibold tracking-tight">
            {phase.s === "done" ? "Done" : phase.s === "failed" ? (phase.error.cancelled ? "Cancelled" : "Transaction failed") : title}
          </h2>
          {phase.s !== "signing" && (
            <button type="button" onClick={onClose} className="rounded-full px-2 text-muted hover:text-ink" aria-label="Close">
              ×
            </button>
          )}
        </div>

        {phase.s === "review" && (
          <>
            <dl className="mt-4 divide-y divide-rule rounded-2xl border border-rule">
              {rows.map(([k, v]) => (
                <div key={k} className="flex items-baseline justify-between gap-4 px-4 py-2.5 text-sm">
                  <dt className="text-muted">{k}</dt>
                  <dd className="num min-w-0 truncate text-right font-mono">{v}</dd>
                </div>
              ))}
            </dl>
            {note && <p className="mt-3 text-sm text-muted">{note}</p>}
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={onClose} className="rounded-full border border-rule px-4 py-2 text-sm hover:border-ink">
                Cancel
              </button>
              <button type="button" onClick={go} className="rounded-full bg-ink px-5 py-2 text-sm font-semibold text-paper">
                {confirmLabel}
              </button>
            </div>
          </>
        )}

        {phase.s === "signing" && (
          <div className="mt-6 flex items-center gap-3" role="status">
            <span aria-hidden className="size-5 animate-spin rounded-full border-2 border-rule border-t-ink" />
            <div>
              <p className="font-medium">Confirm in your wallet</p>
              <p className="text-sm text-muted">Then wait a few seconds for the network to include it.</p>
            </div>
          </div>
        )}

        {phase.s === "done" && (
          <div className="mt-4 space-y-4">
            {done?.(phase.outcome, phase.hash)}
            {phase.hash && (
              <a href={txUrl(phase.hash)} target="_blank" rel="noreferrer" className="link block break-all font-mono text-sm">
                View transaction {phase.hash.slice(0, 10)}…
              </a>
            )}
            <div className="flex justify-end">
              <button type="button" onClick={onClose} className="rounded-full bg-ink px-5 py-2 text-sm font-semibold text-paper">
                Close
              </button>
            </div>
          </div>
        )}

        {phase.s === "failed" && (
          <div className="mt-4 space-y-4">
            <div role="alert" className={`rounded-2xl p-4 ${phase.error.cancelled ? "bg-paper" : "bg-bad-bg"}`}>
              <p className="font-semibold">{phase.error.title}</p>
              {phase.error.detail && <p className="mt-1 text-sm text-muted">{phase.error.detail}</p>}
              {phase.error.code && !phase.error.cancelled && <p className="mt-2 font-mono text-xs text-muted">code: {phase.error.code}</p>}
            </div>
            {phase.hash && (
              <a href={txUrl(phase.hash)} target="_blank" rel="noreferrer" className="link block font-mono text-sm">
                View transaction
              </a>
            )}
            <div className="flex justify-end gap-2">
              <button type="button" onClick={onClose} className="rounded-full border border-rule px-4 py-2 text-sm hover:border-ink">
                Close
              </button>
              <button type="button" onClick={go} className="rounded-full bg-ink px-5 py-2 text-sm font-semibold text-paper">
                Try again
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
