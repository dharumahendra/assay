/** Small layout pieces shared by the wizard and /account (Assay.pen: white cards on a grid background, navy and lime accent cards). */
import type { ReactNode } from "react";

export function Card({ children, className = "", tone = "surface" }: { children: ReactNode; className?: string; tone?: "surface" | "navy" | "lime" | "peach" | "sky" | "salmon" }) {
  const t = {
    surface: "bg-surface shadow-[0_10px_30px_-20px_rgb(13_15_20/0.35)]",
    navy: "bg-navy text-paper",
    lime: "bg-lime text-ink",
    peach: "bg-peach text-ink",
    sky: "bg-sky text-ink",
    salmon: "bg-salmon text-ink",
  }[tone];
  return <section className={`rounded-[1.75rem] p-5 sm:p-7 ${t} ${className}`}>{children}</section>;
}

export function Eyebrow({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <p className={`font-mono text-[0.6875rem] uppercase tracking-[0.12em] opacity-70 ${className}`}>{children}</p>;
}

/** Handwritten note label (Caveat in the design). */
export function Hand({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <p className={`hand text-[1.6rem] leading-none ${className}`}>{children}</p>;
}

export function Num({ n, className = "" }: { n: number | string; className?: string }) {
  return <span className={`font-mono text-xs text-muted ${className}`}>{typeof n === "number" ? String(n).padStart(2, "0") : n}</span>;
}

export function Row({ k, v, strong }: { k: ReactNode; v: ReactNode; strong?: boolean }) {
  return (
    <div className={`flex items-baseline justify-between gap-4 py-1.5 text-sm ${strong ? "font-semibold" : ""}`}>
      <span className="opacity-75">{k}</span>
      <span className="num font-mono">{v}</span>
    </div>
  );
}

export function KindToggle({ kind, onChange, disabled }: { kind: "MUST" | "SHOULD"; onChange?: (k: "MUST" | "SHOULD") => void; disabled?: boolean }) {
  return (
    <span className="inline-flex shrink-0 rounded-lg border border-rule bg-surface p-0.5 text-[0.6875rem] font-bold">
      {(["MUST", "SHOULD"] as const).map((k) => (
        <button
          key={k}
          type="button"
          disabled={disabled || !onChange}
          aria-pressed={kind === k}
          onClick={() => onChange?.(k)}
          className={`rounded-md px-2.5 py-1 ${kind === k ? "bg-ink text-white" : "text-faint hover:text-ink"} disabled:cursor-default`}
        >
          {k}
        </button>
      ))}
    </span>
  );
}

export const inputCls = "w-full rounded-2xl border border-rule bg-surface-2 px-4 py-3 outline-none focus:border-act focus:bg-surface focus:ring-2 focus:ring-act/15";
