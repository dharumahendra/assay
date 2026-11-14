"use client";

/** Navbar control: "Connect wallet", or the connected account with a small menu. */
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { middle } from "@/lib/format";
import { ArrowUpRight } from "../icons";
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
      <button type="button" onClick={connect} disabled={!ready} className={`group inline-flex cursor-pointer items-center gap-0.5 text-sm font-semibold disabled:cursor-wait disabled:opacity-60 ${className}`}>
        <span aria-hidden className="grid size-10 place-items-center rounded-full bg-ink text-white transition-transform group-hover:rotate-45">
          <ArrowUpRight size={15} />
        </span>
        <span className="rounded-full bg-ink px-5 py-2.5 text-white">{ready ? "Connect Wallet" : "Loading wallet…"}</span>
      </button>
    );

  return (
    <div ref={box} className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="menu"
        className="group inline-flex max-w-[18rem] cursor-pointer items-center gap-0.5 text-sm font-semibold"
        title={accountId}
      >
        <span aria-hidden className="grid size-10 shrink-0 place-items-center rounded-full bg-ink text-white">
          <ArrowUpRight size={15} />
        </span>
        <span className="truncate rounded-full bg-ink px-5 py-2.5 text-white">{middle(accountId, 16, 8)}</span>
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
            className="block w-full cursor-pointer rounded-md px-3 py-2 text-left text-sm text-bad hover:bg-paper"
          >
            Disconnect
          </button>
        </div>
      )}
    </div>
  );
}
