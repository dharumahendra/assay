"use client";

import type { InsightRecordsResponse, MetricWindow, SourceRecord } from "@juri/shared";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Close, External } from "./icons";

/**
 * A number that is evidence: the value plus a yellow marker tag. Clicking either opens the
 * Source drawer with the records behind the number (FR-A5).
 */
export function EvidenceMark({
  metricId,
  window = "all",
  title,
  children,
  className = "",
  marker = true,
}: {
  metricId: string;
  window?: MetricWindow;
  title: string;
  children: ReactNode;
  className?: string;
  /** Hide the yellow tag where the metric id is already labelled (e.g. on a lime card). */
  marker?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const btn = useRef<HTMLButtonElement>(null);
  return (
    <>
      <button
        ref={btn}
        type="button"
        onClick={() => setOpen(true)}
        className={`group inline-flex items-baseline gap-1.5 rounded-sm text-left decoration-marker decoration-2 underline-offset-[6px] hover:underline ${className}`}
        aria-label={`${title}: show the records behind this number`}
      >
        <span className="num">{children}</span>
        {marker && <Marker id={metricId} />}
      </button>
      {open &&
        createPortal(
          // Portal to <body>: the mark often sits inside a headline and must not inherit its type.
          <SourceDrawer
            metricId={metricId}
            window={window}
            title={title}
            onClose={() => {
              setOpen(false);
              btn.current?.focus();
            }}
          />,
          document.body,
        )}
    </>
  );
}

/** The evidence tent: a small yellow tag with the metric id. */
export function Marker({ id }: { id: string }) {
  return (
    <span
      aria-hidden
      className="relative top-[-0.15em] inline-flex h-[1.35rem] min-w-[1.9rem] shrink-0 items-center justify-center self-center rounded-[3px] bg-marker px-1 font-sans text-[0.75rem] leading-none font-bold text-marker-ink not-italic [clip-path:polygon(0_0,100%_0,100%_100%,50%_86%,0_100%)]"
      style={{ fontStretch: "100%", letterSpacing: 0 }}
    >
      {id}
    </span>
  );
}

const linkLabel = (r: SourceRecord) =>
  r.kind === "tx" ? "Open on NearBlocks" : r.kind === "agent" || r.kind === "job" ? "Open on market.near.ai" : "Open source";

function SourceDrawer({ metricId, window, title, onClose }: { metricId: string; window: MetricWindow; title: string; onClose: () => void }) {
  const [records, setRecords] = useState<SourceRecord[]>([]);
  const [next, setNext] = useState<string | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState<string>("");
  const closeBtn = useRef<HTMLButtonElement>(null);

  const load = useCallback(
    async (cursor: string | null) => {
      setState("loading");
      try {
        const p = new URLSearchParams({ window, limit: "50" });
        if (cursor) p.set("cursor", cursor);
        const res = await fetch(`/api/insights/${encodeURIComponent(metricId)}/records?${p}`);
        if (!res.ok) throw new Error(`The API answered ${res.status}.`);
        const body = (await res.json()) as InsightRecordsResponse;
        setRecords((prev) => (cursor ? [...prev, ...body.data] : body.data));
        setNext(body.next);
        setState("ready");
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
        setState("error");
      }
    },
    [metricId, window],
  );

  useEffect(() => {
    void load(null);
    closeBtn.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [load, onClose]);

  const groups = new Map<string, SourceRecord[]>();
  for (const r of records) groups.set(r.group, [...(groups.get(r.group) ?? []), r]);

  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true" aria-labelledby="drawer-title">
      <button type="button" aria-label="Close" className="absolute inset-0 cursor-default bg-ink/30" onClick={onClose} />
      <aside className="drawer-in relative flex h-full w-full max-w-[460px] flex-col border-l border-rule bg-surface shadow-2xl">
        <header className="flex items-start gap-3 border-b border-rule px-5 py-4">
          <Marker id={metricId} />
          <div className="min-w-0 flex-1">
            <h2 id="drawer-title" className="font-semibold">
              {title}
            </h2>
            <p className="text-sm text-muted">Records behind this number{window === "30d" ? ", last 30 days" : ""}</p>
          </div>
          <button ref={closeBtn} type="button" onClick={onClose} className="rounded-md p-1.5 text-muted hover:text-ink" aria-label="Close">
            <Close size={18} />
          </button>
        </header>
        <div className="flex-1 overflow-x-hidden overflow-y-auto px-5 py-4">
          {state === "error" && (
            <div role="alert" className="rounded-md border border-bad/40 bg-bad-bg p-4">
              <p className="font-semibold">The records could not be loaded.</p>
              <p className="text-sm text-muted">{error}</p>
              <button type="button" className="mt-3 rounded-md bg-act px-3 py-1 text-act-ink" onClick={() => void load(null)}>
                Retry
              </button>
            </div>
          )}
          {state !== "error" && records.length === 0 && state === "ready" && (
            <p className="text-muted">This metric has no record list; its value comes straight from the source named in the note.</p>
          )}
          {[...groups.entries()].map(([group, rs]) => (
            <section key={group} className="mb-6">
              <h3 className="mb-2 text-sm font-semibold text-muted">
                {group.replaceAll("_", " ")} <span className="num font-normal">({rs.length})</span>
              </h3>
              <ul className="divide-y divide-rule border-y border-rule">
                {rs.map((r, i) => (
                  <li key={`${r.id}-${i}`} className="py-2.5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        {r.label && <p className="font-medium">{r.label}</p>}
                        <p className={`break-all ${r.kind === "value" || r.kind === "endpoint" ? "" : "font-mono text-[0.8125rem]"} ${r.label ? "text-muted" : ""}`}>
                          {r.id}
                        </p>
                      </div>
                      {r.url && (
                        <a href={r.url} target="_blank" rel="noreferrer" className="link inline-flex shrink-0 items-center gap-1 text-sm">
                          {linkLabel(r)}
                          <External size={12} />
                        </a>
                      )}
                    </div>
                    {r.extra && <Extra extra={r.extra} />}
                  </li>
                ))}
              </ul>
            </section>
          ))}
          {state === "loading" && <p className="py-3 text-muted">Loading records…</p>}
          {next && state === "ready" && (
            <button type="button" className="rounded-md border border-rule px-3 py-1.5 hover:border-ink" onClick={() => void load(next)}>
              Load more
            </button>
          )}
        </div>
        <footer className="border-t border-rule px-5 py-3">
          <button type="button" onClick={onClose} className="rounded-md border border-rule px-3 py-1.5 hover:border-ink">
            Close
          </button>
        </footer>
      </aside>
    </div>
  );
}

function Extra({ extra }: { extra: Record<string, unknown> }) {
  const entries = Object.entries(extra).filter(([, v]) => v !== null && v !== undefined && typeof v !== "object");
  if (!entries.length) return null;
  return (
    <dl className="mt-1 grid grid-cols-[auto_1fr] gap-x-3 text-[0.8125rem] text-muted">
      {entries.slice(0, 8).map(([k, v]) => (
        <div key={k} className="contents">
          <dt>{k.replaceAll("_", " ")}</dt>
          <dd className="num break-all text-ink">{String(v)}</dd>
        </div>
      ))}
    </dl>
  );
}
