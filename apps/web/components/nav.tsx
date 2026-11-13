"use client";

import type { DataMode } from "@juri/shared";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Info } from "./icons";
import { AssayLogo } from "./logo";
import { WalletButton } from "./wallet/wallet-button";

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
    <header className="sticky top-0 z-50 px-3 pt-3 sm:px-8 sm:pt-6 lg:px-12">
      <div className="mx-auto flex max-w-[1344px] flex-wrap items-center gap-x-4 lg:flex-nowrap gap-y-2 rounded-[2.4rem] border border-white/60 bg-white/80 py-3 pl-6 pr-3 shadow-[0_8px_30px_-12px_rgb(13_15_20/0.18)] backdrop-blur-md">
        <Link href="/" aria-label="Assay home">
          <AssayLogo />
        </Link>
        <nav aria-label="Main" className="order-3 -mx-6 w-[calc(100%+2.25rem)] overflow-x-auto px-6 [scrollbar-width:none] lg:order-none lg:mx-auto lg:w-auto lg:px-0">
          <ul className="flex gap-1 whitespace-nowrap">
            {LINKS.map((l) => {
              const active = path === l.href || path.startsWith(`${l.href}/`);
              return (
                <li key={l.href}>
                  <Link
                    href={l.href}
                    aria-current={active ? "page" : undefined}
                    className={`block rounded-full px-3 py-1.5 text-sm font-medium ${active ? "bg-ink text-white" : "text-muted hover:text-ink"}`}
                  >
                    {l.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
        <div className="ml-auto flex shrink-0 items-center gap-2 lg:ml-0">
          {mode && <ModeBadge mode={mode} snapshotAt={snapshotAt} />}
          <span className="hidden rounded-full border border-rule px-3 py-1.5 font-mono text-[0.6875rem] text-muted 2xl:inline">NEAR {network}</span>
          <WalletButton />
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
        className="inline-flex items-center gap-1.5 rounded-full bg-navy px-3 py-1.5 font-mono text-[0.6875rem] font-medium uppercase tracking-wide text-white"
      >
        <span className={`h-[7px] w-[7px] rounded-full ${mode === "live" ? "bg-lime" : "bg-peach"}`} aria-hidden />
        <span className="hidden xl:inline">{label}</span>
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
