import type { TrustBand } from "@juri/shared";
import Link from "next/link";
import type { ReactNode } from "react";
import { BandNone, BandSome, BandStrong, BandWeak, LinkIcon, Unmapped } from "./icons";

const pill = "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[0.8125rem] leading-5 whitespace-nowrap";

const BAND: Record<TrustBand, { icon: ReactNode; cls: string }> = {
  "Strong record": { icon: <BandStrong />, cls: "border-good/40 bg-good-bg text-good" },
  "Some record": { icon: <BandSome />, cls: "border-good/30 text-good" },
  "Weak record": { icon: <BandWeak />, cls: "border-warn/40 bg-warn-bg text-warn" },
  "Insufficient data": { icon: <BandNone />, cls: "border-rule text-muted" },
};

/** Trust band + optional score. Always icon + text (NFR-A11Y-1). */
export function TrustBadge({ band, score }: { band: TrustBand; score?: number | null }) {
  const b = BAND[band];
  return (
    <span className={`${pill} ${b.cls}`}>
      {b.icon}
      {band}
      {score !== null && score !== undefined && <span className="num font-semibold">{score}</span>}
    </span>
  );
}

/** Neutral pattern badge: a link glyph, never a warning colour (07 §4). */
export function PatternBadge({ id }: { id: string }) {
  return (
    <Link href={`/patterns/${id}`} className={`${pill} border-ink/25 text-ink hover:border-ink`}>
      <LinkIcon />
      Linked bidding pattern (heuristic)
    </Link>
  );
}

export function UnmappedBadge() {
  return (
    <span className={`${pill} border-rule text-muted`} title="No NEAR account is linked to this market agent yet">
      <Unmapped />
      Unmapped
    </span>
  );
}

export function Chip({ children }: { children: ReactNode }) {
  return <span className={`${pill} border-rule text-muted`}>{children}</span>;
}
