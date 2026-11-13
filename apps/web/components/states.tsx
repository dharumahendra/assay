"use client";

import { useRouter } from "next/navigation";
import { useTransition, type ReactNode } from "react";

export function EmptyState({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed border-rule bg-surface px-5 py-8">
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
    <div role="alert" className="rounded-lg border border-bad/40 bg-bad-bg px-5 py-6 text-ink">
      <p className="font-semibold">{title}</p>
      {message && <p className="mt-1 max-w-[70ch] text-muted">{message}</p>}
      <button
        type="button"
        className="mt-4 rounded-md bg-act px-3 py-1.5 font-medium text-act-ink disabled:opacity-60"
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
