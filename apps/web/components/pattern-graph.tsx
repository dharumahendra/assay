import type { PatternDetail } from "@juri/shared";
import Link from "next/link";

/** Members on a circle; edge width = twin bids (co_bid) or a dashed line (shared funder). */
export function PatternGraph({ p }: { p: PatternDetail }) {
  const W = 520;
  const H = 360;
  const r = Math.min(W, H) / 2 - 56;
  const pos = new Map(
    p.members.map((m, i) => {
      const a = (2 * Math.PI * i) / p.members.length - Math.PI / 2;
      return [m.id, { x: W / 2 + r * Math.cos(a), y: H / 2 + r * Math.sin(a), m }];
    }),
  );
  const maxTwin = Math.max(1, ...p.edges.map((e) => e.twin_jobs ?? 0));
  return (
    <figure className="rounded-lg border border-rule bg-surface p-3">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label={`${p.size} agents linked by ${p.edges.length} edges`}>
        {p.edges.map((e) => {
          const a = pos.get(e.a);
          const b = pos.get(e.b);
          if (!a || !b) return null;
          const w = e.type === "co_bid" ? 1.5 + 5 * ((e.twin_jobs ?? 0) / maxTwin) : 1.5;
          return (
            <line
              key={`${e.a}-${e.b}-${e.type}`}
              x1={a.x}
              y1={a.y}
              x2={b.x}
              y2={b.y}
              stroke="var(--muted)"
              strokeWidth={w}
              strokeDasharray={e.type === "shared_funder" ? "5 4" : undefined}
            >
              <title>{e.type === "co_bid" ? `${e.twin_jobs ?? 0} twin bids over ${e.co_jobs ?? 0} shared jobs` : "Same first funder"}</title>
            </line>
          );
        })}
        {[...pos.values()].map(({ x, y, m }) => (
          <Link key={m.id} href={`/agents/${m.id}`} aria-label={`Agent ${m.handle ?? m.id}`}>
            <circle cx={x} cy={y} r={12} fill="var(--surface)" stroke="var(--ink)" strokeWidth={2} />
            <text x={x} y={y + (y > H / 2 ? 30 : -20)} textAnchor="middle" fontSize={13} fill="var(--ink)">
              {m.handle ?? m.id.slice(0, 8)}
            </text>
          </Link>
        ))}
      </svg>
      <figcaption className="mt-2 flex flex-wrap gap-x-5 text-sm text-muted">
        <span>Solid line: bid on the same jobs (thicker = more twin bids)</span>
        <span>Dashed line: same first funder</span>
      </figcaption>
    </figure>
  );
}
