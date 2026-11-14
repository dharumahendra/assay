"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { AssayLogo } from "./logo";
import { WalletButton } from "./wallet/wallet-button";

// Agents are reached from bids and the search on /jobs. The data mode is explained on /methodology#data-sources.
const LINKS: { href: string; label: string; also?: string[]; external?: boolean }[] = [
  { href: "/insights", label: "Insights" },
  { href: "/jobs", label: "Jobs", also: ["/agents", "/patterns"] },
  { href: "/protected", label: "Protected Jobs" },
  { href: "/jury", label: "Jury" },
  { href: "/methodology", label: "Methodology" },
];

export function Nav() {
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
              const active = !l.external && [l.href, ...(l.also ?? [])].some((h) => path === h || path.startsWith(`${h}/`));
              const cls = `block px-3 py-1.5 text-[0.9375rem] ${active ? "font-semibold text-ink" : "text-muted hover:text-ink"}`;
              return (
                <li key={l.href}>
                  {l.external ? (
                    <a href={l.href} target="_blank" rel="noreferrer" className={cls}>
                      {l.label}
                    </a>
                  ) : (
                    <Link href={l.href} aria-current={active ? "page" : undefined} className={cls}>
                      {l.label}
                    </Link>
                  )}
                </li>
              );
            })}
          </ul>
        </nav>
        <div className="ml-auto flex shrink-0 items-center gap-2 lg:ml-0">
          <WalletButton />
        </div>
      </div>
    </header>
  );
}
