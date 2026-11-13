"use client";

import type { DataMode } from "@juri/shared";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Info } from "./icons";

const LINKS = [
  { href: "/insights", label: "Insights" },
  { href: "/jobs", label: "Jobs" },
  { href: "/agents", label: "Agents" },
  { href: "/protected", label: "Protected Jobs" },
  { href: "/jury", label: "Jury" },
  { href: "/methodology", label: "Methodology" },
];

export function Nav({ mode, snapshotAt, network }: { mode: DataMode | null; snapshotAt: string | null; network: string }) {
  const path = usePathname();
  return (
    <header className="border-b border-rule bg-surface">
      <div className="mx-auto flex max-w-[1180px] flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3 sm:px-6">
        <Link href="/" className="display text-[1.6rem] leading-none" aria-label="Juri home">
          Juri
        </Link>
        <nav aria-label="Main" className="order-3 -mx-4 w-[calc(100%+2rem)] overflow-x-auto px-4 sm:order-none sm:mx-0 sm:w-auto sm:px-0">
          <ul className="flex gap-1 whitespace-nowrap">
            {LINKS.map((l) => {
              const active = path === l.href || path.startsWith(`${l.href}/`);
              return (
                <li key={l.href}>
                  <Link
                    href={l.href}
                    aria-current={active ? "page" : undefined}
                    className={`block rounded-md px-2.5 py-1.5 text-[0.9375rem] ${active ? "bg-paper font-semibold text-ink" : "text-muted hover:text-ink"}`}
                  >
                    {l.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
        <div className="ml-auto flex items-center gap-2">
          {mode && <ModeBadge mode={mode} snapshotAt={snapshotAt} />}
          <span className="rounded-full border border-rule px-2 py-0.5 text-[0.8125rem] text-muted">NEAR {network}</span>
        </div>
      </div>
    </header>
  );
}

const MODE_TEXT: Record<DataMode, string> = {
  live: "Numbers come from the market API and NEAR RPC, refreshed by the sync job.",
  snapshot: "Numbers come from a committed snapshot file, so anyone can reproduce them without API keys.",
  recorded: "Jury decisions replay recorded model outputs instead of calling live models.",
};

function ModeBadge({ mode, snapshotAt }: { mode: DataMode; snapshotAt: string | null }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const off = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", off);
    document.addEventListener("keydown", off);
    return () => {
      document.removeEventListener("mousedown", off);
      document.removeEventListener("keydown", off);
    };
  }, [open]);
  const label =
    mode === "snapshot"
      ? `Snapshot${snapshotAt ? ` · ${new Date(snapshotAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" })}` : ""}`
      : mode === "live"
        ? "Live"
        : "Recorded jury";
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="inline-flex items-center gap-1.5 rounded-full border border-ink/30 px-2 py-0.5 text-[0.8125rem] font-medium hover:border-ink"
      >
        <span className={`h-2 w-2 rounded-full ${mode === "live" ? "bg-good" : "bg-marker"}`} aria-hidden />
        {label}
        <Info size={12} />
      </button>
      {open && (
        <div role="tooltip" className="absolute right-0 z-40 mt-2 w-72 rounded-md border border-rule bg-surface p-3 text-sm shadow-lg">
          {MODE_TEXT[mode]}{" "}
          <Link href="/methodology#data-sources" className="link" onClick={() => setOpen(false)}>
            Data sources
          </Link>
        </div>
      )}
    </div>
  );
}
