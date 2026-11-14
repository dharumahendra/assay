"use client";

import { useEffect, useState } from "react";

/** "On this page" list with the section in view highlighted (methodology frame). */
export function Toc({ items }: { items: readonly (readonly [string, string])[] }) {
  const [active, setActive] = useState<string>(items[0]?.[0] ?? "");
  useEffect(() => {
    const els = items.map(([id]) => document.getElementById(id)).filter((e): e is HTMLElement => !!e);
    const io = new IntersectionObserver(
      (entries) => {
        const top = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (top) setActive(top.target.id);
      },
      { rootMargin: "-20% 0px -60% 0px" },
    );
    els.forEach((e) => io.observe(e));
    return () => io.disconnect();
  }, [items]);
  return (
    <nav aria-label="On this page" className="rounded-[1.5rem] bg-surface p-4 shadow-[0_10px_30px_-20px_rgb(13_15_20/0.35)]">
      <p className="eyebrow px-2 pb-2 text-faint">On this page</p>
      <ul className="flex flex-wrap gap-1 lg:flex-col">
        {items.map(([id, label], i) => (
          <li key={id}>
            <a
              href={`#${id}`}
              aria-current={active === id ? "true" : undefined}
              className={`flex items-center gap-3 rounded-xl px-3 py-2 text-[0.9375rem] ${active === id ? "bg-ink text-white" : "text-ink hover:bg-surface-2"}`}
            >
              <span className={`font-mono text-[0.6875rem] ${active === id ? "text-lime" : "text-faint"}`}>{String(i + 1).padStart(2, "0")}</span>
              {label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
