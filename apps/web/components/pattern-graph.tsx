import type { PatternDetail } from "@juri/shared";
import Link from "next/link";

const NODE = ["#f98f68", "#f2bc75", "#bde5f7", "#a9c3a9", "#c8f24a", "#9fc3d6"];

/** Members on a circle on a dark card; co_bid edges white (width = twin bids), shared_funder edges lime. */
export function PatternGraph({ p }: { p: PatternDetail }) {
  const W = 760;
  const H = 520;
  const r = Math.min(W, H) / 2 - 90;
  const pos = new Map(
    p.members.map((m, i) => {
      const a = (2 * Math.PI * i) / p.members.length - Math.PI / 2 - 0.5;
      return [m.id, { x: W / 2 + r * Math.cos(a), y: H / 2 - 10 + r * Math.sin(a), m, c: NODE[i % NODE.length]! }];
    }),
  );
  const maxTwin = Math.max(1, ...p.edges.map((e) => e.twin_jobs ?? 0));
  return (
    <figure className="relative min-w-0 overflow-hidden rounded-[2rem] bg-navy p-4 sm:p-6">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label={`${p.size} agents linked by ${p.edges.length} edges`}>
        {p.edges.map((e) => {
          const a = pos.get(e.a);
          const b = pos.get(e.b);
          if (!a || !b) return null;
          const co = e.type === "co_bid";
          const w = co ? 3 + 5 * ((e.twin_jobs ?? 0) / maxTwin) : 3.5;
          const mx = (a.x + b.x) / 2;
          const my = (a.y + b.y) / 2;
          const label = co ? `${e.twin_jobs ?? 0} twin bids` : "shared funder";
          const lw = label.length * 7.6 + 20;
          return (
            <g key={`${e.a}-${e.b}-${e.type}`}>
              <title>{co ? `${e.twin_jobs ?? 0} twin bids over ${e.co_jobs ?? 0} shared jobs` : "Same first funder"}</title>
              <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={co ? "#ffffff" : "#c8f24a"} strokeWidth={w} />
              <rect x={mx - lw / 2} y={my - 14} width={lw} height={28} rx={14} fill="#1c2030" />
              <text x={mx} y={my + 4.5} textAnchor="middle" fontSize={13} fontFamily="var(--font-mono)" fill={co ? "#eef0f4" : "#c8f24a"}>
                {label}
              </text>
            </g>
          );
        })}
        {[...pos.values()].map(({ x, y, m, c }) => {
          const name = `@${m.handle ?? m.id.slice(0, 8)}`;
          const lw = name.length * 8.4 + 26;
          const ly = y + (y > H / 2 ? 62 : 62);
          return (
            <Link key={m.id} href={`/agents/${m.id}`} aria-label={`Agent ${m.handle ?? m.id}`}>
              <circle cx={x} cy={y} r={38} fill={c} />
              <rect x={x - lw / 2} y={ly - 16} width={lw} height={32} rx={16} fill="#ffffff" />
              <text x={x} y={ly + 5} textAnchor="middle" fontSize={14} fontFamily="var(--font-mono)" fill="#0d0f14">
                {name}
              </text>
            </Link>
          );
        })}
      </svg>
      <figcaption className="flex flex-wrap gap-x-6 gap-y-1 px-2 font-mono text-xs text-white/70">
        <span className="inline-flex items-center gap-2">
          <span className="h-[3px] w-5 bg-white" /> co_bid · width = twin bids
        </span>
        <span className="inline-flex items-center gap-2">
          <span className="h-[3px] w-5 bg-lime" /> shared_funder
        </span>
      </figcaption>
    </figure>
  );
}
