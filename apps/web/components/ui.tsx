/**
 * Shared page furniture from the Assay.pen page frames: a full-bleed texture behind the page head, the hand-written
 * eyebrow + display title, white cards, pill buttons with the round icon cap, and tinted status pills.
 */
import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowRight, ArrowUpRight } from "./icons";

export type Texture = "plus" | "checker" | "hatch" | "dots" | "gridlines" | "hlines" | "vlines" | "rings" | "squares" | "lattice";

/** A viewport-wide layer behind a section that sits inside the centred main column. */
export function Bleed({ className }: { className: string }) {
  return <div aria-hidden="true" className={`pointer-events-none absolute left-1/2 -z-10 w-screen -translate-x-1/2 ${className}`} />;
}

/** Page head: texture band running up behind the nav, hand eyebrow, big title, optional block on the right. */
export function PageHead({
  eyebrow,
  title,
  aside,
  texture,
  children,
}: {
  eyebrow?: string;
  title: ReactNode;
  aside?: ReactNode;
  texture?: Texture;
  children?: ReactNode;
}) {
  return (
    <header className="relative isolate pb-8 pt-4 sm:pt-8">
      {texture && <Bleed className={`-top-48 bottom-[-6rem] bg-${texture} [mask-image:linear-gradient(to_bottom,#000_70%,transparent)]`} />}
      <div className="flex flex-wrap items-end justify-between gap-x-10 gap-y-6">
        <div className="min-w-0">
          {eyebrow && <p className="hand text-[1.5rem] leading-none sm:text-[1.75rem]">{eyebrow}</p>}
          <h1 className="display mt-3 max-w-[18ch] text-[2.6rem] leading-[0.98] sm:text-[3.6rem] lg:text-[4.4rem]">{title}</h1>
        </div>
        {aside && <div className="flex flex-wrap items-center gap-3">{aside}</div>}
      </div>
      {children && <div className="mt-6">{children}</div>}
    </header>
  );
}

export function Card({ className = "", children }: { className?: string; children: ReactNode }) {
  return <section className={`rounded-[1.75rem] bg-surface p-5 shadow-[0_10px_30px_-20px_rgb(13_15_20/0.35)] sm:p-8 ${className}`}>{children}</section>;
}

/** Card heading: display title, optional muted note and right-hand actions. */
export function CardHead({ title, note, actions, id }: { title: ReactNode; note?: ReactNode; actions?: ReactNode; id?: string }) {
  return (
    <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 id={id} className="display text-[1.6rem] sm:text-[1.85rem]">
          {title}
        </h2>
        {note && <p className="text-sm text-muted">{note}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

const capCls = "grid size-10 shrink-0 place-items-center rounded-full bg-ink text-white transition-transform";
const bodyCls = "rounded-full bg-ink px-5 py-2.5 text-white";

/** Black pill with a round icon cap on the left (the primary action in every frame). */
export function PrimaryLink({ href, children, icon, external }: { href: string; children: ReactNode; icon?: ReactNode; external?: boolean }) {
  const inner = (
    <>
      <span className={`${capCls} group-hover:rotate-45`}>{icon ?? <ArrowUpRight size={16} />}</span>
      <span className={`${bodyCls} group-hover:bg-navy-2`}>{children}</span>
    </>
  );
  const cls = "group inline-flex items-center gap-1 text-sm font-medium";
  return external ? (
    <a href={href} target="_blank" rel="noreferrer" className={cls}>
      {inner}
    </a>
  ) : (
    <Link href={href} className={cls}>
      {inner}
    </Link>
  );
}

export function PrimaryButton({
  children,
  icon,
  tone = "ink",
  ...rest
}: { children: ReactNode; icon?: ReactNode; tone?: "ink" | "lime" } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const t = tone === "lime" ? "bg-lime text-ink" : "bg-ink text-white";
  return (
    <button type="button" {...rest} className={`group inline-flex items-center gap-1 text-sm font-medium disabled:opacity-50 ${rest.className ?? ""}`}>
      <span className={`grid size-10 shrink-0 place-items-center rounded-full ${t}`}>{icon ?? <ArrowRight size={16} />}</span>
      <span className={`rounded-full px-5 py-2.5 ${t}`}>{children}</span>
    </button>
  );
}

/** Outlined pill, arrow on the right. */
export function GhostLink({ href, children, external, icon }: { href: string; children: ReactNode; external?: boolean; icon?: ReactNode }) {
  const cls = "group inline-flex items-center gap-2 rounded-full border border-ink/40 bg-surface/60 px-4 py-2.5 text-sm font-medium hover:border-ink";
  const ic = icon ?? (external ? <ArrowUpRight size={14} /> : <ArrowRight size={14} className="transition-transform group-hover:translate-x-0.5" />);
  return external ? (
    <a href={href} target="_blank" rel="noreferrer" className={cls}>
      {children}
      {ic}
    </a>
  ) : (
    <Link href={href} className={cls}>
      {children}
      {ic}
    </Link>
  );
}

export const ghostBtn =
  "inline-flex items-center gap-2 rounded-full border border-ink/25 bg-surface px-4 py-2 text-sm font-medium hover:border-ink disabled:opacity-50";

export type Tone = "lime" | "sky" | "peach" | "salmon" | "sage" | "steel" | "act" | "ink" | "neutral";
const TONE: Record<Tone, string> = {
  lime: "bg-lime text-ink",
  sky: "bg-sky text-ink",
  peach: "bg-peach text-ink",
  salmon: "bg-salmon text-ink",
  sage: "bg-sage text-ink",
  steel: "bg-steel text-ink",
  act: "bg-act text-white",
  ink: "bg-ink text-white",
  neutral: "bg-surface-2 text-ink",
};

/** Tinted status pill; always icon + text so the colour is never the only signal. */
export function Pill({ tone, icon, children, className = "" }: { tone: Tone; icon?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-[0.8125rem] font-semibold leading-none ${TONE[tone]} ${className}`}>
      {icon}
      {children}
    </span>
  );
}

/** Table header cell in the frames' mono caps. */
export const th = "eyebrow py-3 pr-4 text-left font-normal text-faint";

/** "Label ... value" row used in side panels. */
export function KV({ k, v, mono }: { k: ReactNode; v: ReactNode; mono?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-rule py-3 last:border-0">
      <dt className="text-muted">{k}</dt>
      <dd className={`text-right ${mono ? "font-mono text-[0.875rem]" : "font-medium"}`}>{v}</dd>
    </div>
  );
}

/** Big number tile (account record, jury stats, market history). */
export function Tile({ value, label, tone = "neutral", className = "" }: { value: ReactNode; label: ReactNode; tone?: Tone; className?: string }) {
  return (
    <div className={`rounded-2xl p-4 sm:p-5 ${TONE[tone]} ${className}`}>
      <p className="display text-[2rem] leading-none sm:text-[2.4rem]">{value}</p>
      <p className="mt-2 text-sm opacity-75">{label}</p>
    </div>
  );
}
