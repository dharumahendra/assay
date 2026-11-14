"use client";

import Link from "next/link";
import { useWallet } from "@/components/wallet/wallet-provider";

/** All / As requester / As worker. The two role tabs need a connected wallet to know whose jobs to show. */
export function RoleTabs({ role, status }: { role: "requester" | "worker" | null; status: string | null }) {
  const { accountId } = useWallet();
  const href = (r: "requester" | "worker" | null) => {
    const p = new URLSearchParams();
    if (r && accountId) {
      p.set("role", r);
      p.set("account", accountId);
    }
    if (status) p.set("status", status);
    const s = p.toString();
    return s ? `/protected?${s}` : "/protected";
  };
  const tab = (r: "requester" | "worker" | null, label: string) => {
    const active = role === r;
    const cls = `rounded-full px-4 py-2 text-sm font-semibold ${active ? "bg-ink text-white" : "text-muted hover:text-ink"}`;
    if (r && !accountId)
      return (
        <span className={`${cls} cursor-not-allowed opacity-50`} aria-disabled="true">
          {label}
        </span>
      );
    return (
      <Link href={href(r)} aria-current={active ? "true" : undefined} className={cls}>
        {label}
      </Link>
    );
  };
  return (
    <div className="flex flex-wrap items-center gap-3">
      <div role="group" aria-label="Whose jobs" className="inline-flex rounded-full bg-surface p-1 shadow-sm">
        {tab(null, "All")}
        {tab("requester", "As requester")}
        {tab("worker", "As worker")}
      </div>
      {!accountId && <span className="text-sm text-faint">Connect a wallet to filter your own jobs</span>}
    </div>
  );
}
