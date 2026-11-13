/** Small layout pieces shared by the wizard and /account (Assay.pen: white cards on a grid background, navy and lime accent cards). */
import type { ReactNode } from "react";

export function Card({ children, className = "", tone = "surface" }: { children: ReactNode; className?: string; tone?: "surface" | "navy" | "lime" | "peach" }) {
  const t = {
    surface: "border border-rule bg-surface",
    navy: "bg-[#12151F] text-[#EEF0F4]",
    lime: "bg-[#C8F24A] text-[#0D0F14]",
    peach: "bg-[#F2BC75] text-[#0D0F14]",
  }[tone];
  return <section className={`rounded-3xl p-5 sm:p-6 ${t} ${className}`}>{children}</section>;
}

export function Eyebrow({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <p className={`font-mono text-[0.6875rem] uppercase tracking-[0.12em] opacity-70 ${className}`}>{children}</p>;
}

/** Handwritten note label (Caveat in the design). */
export function Hand({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <p className={`font-[Caveat,cursive] text-[1.35rem] font-semibold italic leading-none ${className}`}>{children}</p>;
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
    <span className="inline-flex rounded-full border border-rule p-0.5 text-[0.6875rem] font-semibold">
      {(["MUST", "SHOULD"] as const).map((k) => (
        <button
          key={k}
          type="button"
          disabled={disabled || !onChange}
          aria-pressed={kind === k}
          onClick={() => onChange?.(k)}
          className={`rounded-full px-2 py-0.5 ${kind === k ? "bg-ink text-paper" : "text-muted"} disabled:cursor-default`}
        >
          {k}
        </button>
      ))}
    </span>
  );
}

export const inputCls = "w-full rounded-xl border border-rule bg-surface px-3 py-2 outline-none focus:border-ink";
