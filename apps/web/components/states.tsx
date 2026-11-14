"use client";

import { useRouter } from "next/navigation";
import { useTransition, type ReactNode } from "react";

export function EmptyState({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="rounded-[1.75rem] bg-surface px-6 py-8 shadow-[0_10px_30px_-20px_rgb(13_15_20/0.35)] sm:px-8">
      <p className="font-semibold">{title}</p>
      {children && <div className="mt-1 max-w-[62ch] text-muted">{children}</div>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

/** Error with a Retry that re-runs the server render (07 §1.3). */
export function ErrorState({ title = "This data could not be loaded.", message, onRetry }: { title?: string; message?: string; onRetry?: () => void }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <div role="alert" className="rounded-[1.75rem] bg-salmon/35 px-6 py-7 text-ink sm:px-8">
      <p className="font-semibold">{title}</p>
      {message && <p className="mt-1 max-w-[70ch] text-muted">{message}</p>}
      <button
        type="button"
        className="mt-4 rounded-full bg-ink px-5 py-2 text-sm font-semibold text-white disabled:opacity-60"
        disabled={pending}
        onClick={() => (onRetry ? onRetry() : start(() => router.refresh()))}
      >
        {pending ? "Retrying…" : "Retry"}
      </button>
    </div>
  );
}

export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`skeleton ${className}`} aria-hidden />;
}
