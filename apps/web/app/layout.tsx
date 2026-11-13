import type { Metadata } from "next";
import { Archivo, JetBrains_Mono } from "next/font/google";
import Link from "next/link";
import type { ReactNode } from "react";
import { Nav } from "@/components/nav";
import { api } from "@/lib/api";
import { REPO_URL } from "@/lib/format";
import { CONTRACT_ID, explorerAccountUrl, NEAR_NETWORK } from "@/lib/near";
import "./globals.css";

const archivo = Archivo({ subsets: ["latin"], axes: ["wdth"], variable: "--font-archivo", display: "swap" });
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-mono-face", display: "swap" });

export const metadata: Metadata = {
  title: { default: "Juri", template: "%s · Juri" },
  description: "Evidence-backed trust signals for NEAR's AI Agent Market, checkable acceptance criteria and an AI jury.",
};

export const dynamic = "force-dynamic";

export default async function RootLayout({ children }: { children: ReactNode }) {
  const meta = await api.meta().catch(() => null);
  return (
    <html lang="en" className={`${archivo.variable} ${mono.variable}`}>
      <body className="flex min-h-screen flex-col">
        <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:m-2 focus:rounded focus:bg-surface focus:p-2">
          Skip to content
        </a>
        <Nav mode={meta?.mode ?? null} snapshotAt={meta?.snapshot?.taken_at ?? null} network={meta?.network ?? NEAR_NETWORK} />
        <main id="main" className="mx-auto w-full max-w-[1180px] flex-1 px-4 py-8 sm:px-6 sm:py-10">
          {children}
        </main>
        <footer className="border-t border-rule bg-surface">
          <div className="mx-auto flex max-w-[1180px] flex-wrap items-center gap-x-5 gap-y-2 px-4 py-5 text-sm text-muted sm:px-6">
            <a className="hover:text-ink" href={REPO_URL} target="_blank" rel="noreferrer">
              GitHub repo
            </a>
            <a className="hover:text-ink" href={explorerAccountUrl(meta?.contract_id ?? CONTRACT_ID)} target="_blank" rel="noreferrer">
              Contract on explorer
            </a>
            <Link className="hover:text-ink" href="/methodology">
              Methodology
            </Link>
            <p className="w-full sm:ml-auto sm:w-auto">Heuristic signals, not accusations. Testnet only. Not financial advice.</p>
          </div>
        </footer>
      </body>
    </html>
  );
}
