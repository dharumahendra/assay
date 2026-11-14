import type { Metadata } from "next";
import { Caveat, Inter, Inter_Tight, JetBrains_Mono } from "next/font/google";
import Link from "next/link";
import type { ReactNode } from "react";
import { AssayLogo } from "@/components/logo";
import { Nav } from "@/components/nav";
import { ScrollReveal } from "@/components/scroll-reveal";
import { ScrollThumb } from "@/components/scroll-thumb";
import { WalletProvider } from "@/components/wallet";
import { api } from "@/lib/api";
import { REPO_URL, repoFile, reportIssueUrl } from "@/lib/format";
import { CONTRACT_ID, explorerAccountUrl } from "@/lib/near";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
const interTight = Inter_Tight({ subsets: ["latin"], weight: ["500", "600", "700"], variable: "--font-inter-tight", display: "swap" });
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-mono-face", display: "swap" });
const caveat = Caveat({ subsets: ["latin"], weight: ["600"], variable: "--font-caveat", display: "swap" });

export const metadata: Metadata = {
  title: { default: "Assay", template: "%s · Assay" },
  description: "Trust layer for NEAR's AI Agent Market: checkable acceptance criteria, an AI jury, settlement-based reputation.",
};

export const dynamic = "force-dynamic";

const FOOTER: [string, [string, string, boolean?][]][] = [
  [
    "Product",
    [
      ["Insights", "/insights"],
      ["Jobs", "/jobs"],
      ["Protected Jobs", "/protected"],
      ["Jury Console", "/jury"],
    ],
  ],
  [
    "Verify",
    [
      ["Contract on explorer", "contract", true],
      ["Eval report", repoFile("eval/report.md"), true],
      ["Methodology", "/methodology"],
      ["Reproduce", "/methodology#reproduce"],
    ],
  ],
  [
    "Build",
    [
      ["Agent API", "/skill.md", true],
      ["skill.md", "/skill.md", true],
      ["GitHub repo", REPO_URL, true],
      ["Report an error", reportIssueUrl("Assay: report an error"), true],
    ],
  ],
];

export default async function RootLayout({ children }: { children: ReactNode }) {
  const meta = await api.meta().catch(() => null);
  const contract = meta?.contract_id ?? CONTRACT_ID;
  return (
    <html lang="en" className={`${inter.variable} ${interTight.variable} ${mono.variable} ${caveat.variable}`}>
      {/* overflow-x-clip: full-bleed sections use w-screen, which includes the scrollbar width */}
      <body className="flex min-h-screen flex-col overflow-x-clip">
        <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:m-2 focus:rounded focus:bg-surface focus:p-2">
          Skip to content
        </a>
        <WalletProvider>
          <Nav />
          <main id="main" className="mx-auto w-full max-w-[1440px] flex-1 px-4 py-8 sm:px-8 sm:py-12 lg:px-12">
            {children}
          </main>
        </WalletProvider>
        <footer className="mx-auto mt-16 w-full max-w-[1440px] px-4 sm:px-8 lg:px-12">
          <div className="rounded-t-[2rem] bg-navy px-6 pb-10 pt-14 text-white sm:px-10 lg:px-14">
            <div className="flex flex-wrap justify-between gap-12">
              <div className="max-w-[26rem]">
                <AssayLogo size={56} wordClass="text-[3.5rem]" />
                <p className="mt-4 text-sm text-white/60">Heuristic signals, not accusations. Testnet only. Not financial advice.</p>
              </div>
              <div className="flex flex-wrap gap-x-16 gap-y-8">
                {FOOTER.map(([h, links]) => (
                  <div key={h}>
                    <p className="eyebrow text-white/50">{h}</p>
                    <ul className="mt-3 space-y-2 text-sm">
                      {links.map(([label, href, ext]) => {
                        const url = href === "contract" ? explorerAccountUrl(contract) : href;
                        return (
                          <li key={label}>
                            {ext ? (
                              <a href={url} target="_blank" rel="noreferrer" className="text-white/85 hover:text-lime">
                                {label}
                              </a>
                            ) : (
                              <Link href={url} className="text-white/85 hover:text-lime">
                                {label}
                              </Link>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                ))}
              </div>
            </div>
            <div className="mt-12 flex flex-wrap justify-between gap-3 border-t border-white/10 pt-5 font-mono text-xs text-white/50">
              <span>
                {contract}
                {meta?.algo_version ? ` · algo ${meta.algo_version}` : ""} · built on NEAR · NEAR AI Cloud
              </span>
              <span>All verifiers operated by one operator in MVP</span>
            </div>
          </div>
        </footer>
        <ScrollThumb />
        <ScrollReveal />
      </body>
    </html>
  );
}
