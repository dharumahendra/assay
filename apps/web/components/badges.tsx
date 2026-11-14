import type { TrustBand } from "@juri/shared";
import Link from "next/link";
import type { ReactNode } from "react";
import { BandNone, BandSome, BandStrong, BandWeak, LinkIcon, Unmapped } from "./icons";

const pill = "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[0.8125rem] font-semibold leading-none whitespace-nowrap";

const BAND: Record<TrustBand, { icon: ReactNode; cls: string }> = {
  "Strong record": { icon: <BandStrong />, cls: "bg-lime text-ink" },
  "Some record": { icon: <BandSome />, cls: "bg-sky text-ink" },
  "Weak record": { icon: <BandWeak />, cls: "bg-peach text-ink" },
  "Insufficient data": { icon: <BandNone />, cls: "bg-surface-2 text-ink" },
};

/** Trust band + optional score ("82 · Strong record"). Always icon + text (NFR-A11Y-1). */
export function TrustBadge({ band, score }: { band: TrustBand; score?: number | null }) {
  const b = BAND[band];
  return (
    <span className={`${pill} ${b.cls}`}>
      {b.icon}
      {score !== null && score !== undefined && <span className="num">{score} ·</span>}
      {band}
    </span>
  );
}

/** Neutral pattern badge: a link glyph and an outline, never a warning colour (07 §4). */
export function PatternBadge({ id }: { id: string }) {
  return (
    <Link href={`/patterns/${id}`} title="Linked bidding pattern (heuristic)" className={`${pill} border border-ink bg-surface text-ink hover:bg-surface-2`}>
      <LinkIcon />
      Linked pattern {id}
    </Link>
  );
}

export function UnmappedBadge() {
  return (
    <span className="inline-flex items-center gap-1 whitespace-nowrap text-[0.8125rem] text-muted" title="No NEAR account is linked to this market agent yet">
      <Unmapped />
      Unmapped
    </span>
  );
}

export function Chip({ children }: { children: ReactNode }) {
  return <span className="inline-flex items-center whitespace-nowrap rounded-full bg-surface-2 px-3 py-1.5 text-sm font-medium">{children}</span>;
}
