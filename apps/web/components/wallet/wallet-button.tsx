"use client";

/** Navbar control: "Connect wallet", or the connected account with a small menu. */
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { middle } from "@/lib/format";
import { NETWORK } from "@/lib/wallet/near";
import { useWallet } from "./wallet-provider";

export function WalletButton({ className = "" }: { className?: string }) {
  const { ready, accountId, connect, disconnect } = useWallet();
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !box.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
    };
  }, [open]);

  if (!accountId)
    return (
      <button
        type="button"
        onClick={connect}
        disabled={!ready}
        className={`inline-flex items-center gap-2 rounded-full bg-ink px-4 py-2 text-sm font-semibold text-paper disabled:opacity-60 ${className}`}
      >
        <span aria-hidden className="size-1.5 rounded-full bg-[#C8F24A]" />
        {ready ? "Connect wallet" : "Loading wallet…"}
      </button>
    );

  return (
    <div ref={box} className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="menu"
        className="inline-flex max-w-[16rem] items-center gap-2 rounded-full bg-ink px-4 py-2 font-mono text-sm text-paper"
        title={accountId}
      >
        <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-[#C8F24A]" />
        <span className="truncate">{middle(accountId, 14, 8)}</span>
      </button>
      {open && (
        <div role="menu" className="absolute right-0 z-50 mt-2 w-64 rounded-xl border border-rule bg-surface p-2 shadow-lg">
          <p className="px-3 py-2 text-xs text-muted">
            Connected · NEAR {NETWORK}
            <span className="mt-0.5 block break-all font-mono text-[0.8125rem] text-ink">{accountId}</span>
          </p>
          <Link role="menuitem" href="/account" onClick={() => setOpen(false)} className="block rounded-md px-3 py-2 text-sm hover:bg-paper">
            My account
          </Link>
          <Link role="menuitem" href="/protected/new" onClick={() => setOpen(false)} className="block rounded-md px-3 py-2 text-sm hover:bg-paper">
            Create protected job
          </Link>
          <button
            role="menuitem"
            type="button"
            onClick={() => {
              setOpen(false);
              void disconnect();
            }}
            className="block w-full rounded-md px-3 py-2 text-left text-sm text-bad hover:bg-paper"
          >
            Disconnect
          </button>
        </div>
      )}
    </div>
  );
}
