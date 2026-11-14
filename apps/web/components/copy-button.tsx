"use client";

import { useState } from "react";
import { Copy } from "./icons";

export function CopyButton({ text, label = "Copy", className }: { text: string; label?: string; className?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setDone(true);
          setTimeout(() => setDone(false), 1600);
        } catch {
          /* clipboard blocked: the text stays selectable on the page */
        }
      }}
      className={className ?? "inline-flex items-center gap-1 rounded-md border border-rule px-2 py-0.5 text-sm hover:border-ink"}
    >
      <Copy size={className ? 14 : 12} />
      <span aria-live="polite">{done ? "Copied" : label}</span>
    </button>
  );
}
