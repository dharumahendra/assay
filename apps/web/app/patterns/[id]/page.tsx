import { marketJobUrl } from "@juri/shared";
import type { Metadata } from "next";
import Link from "next/link";
import { LinkIcon } from "@/components/icons";
import { PatternEvidence, type EvidenceRow } from "@/components/pattern-evidence";
import { PatternGraph } from "@/components/pattern-graph";
import { Bleed } from "@/components/ui";
import { api } from "@/lib/api";
import { count, reportIssueUrl } from "@/lib/format";

export const metadata: Metadata = { title: "Linked Pattern" };

export default async function PatternPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const p = await api.pattern(id);
  const handle = new Map(p.members.map((m) => [m.id, m.handle ?? m.id.slice(0, 8)]));
  const rows: EvidenceRow[] = p.edges.flatMap((e) =>
    Array.isArray(e.evidence)
      ? e.evidence.map((ev) => ({ ...ev, a_handle: handle.get(ev.a.agent_id) ?? ev.a.agent_id.slice(0, 8), b_handle: handle.get(ev.b.agent_id) ?? ev.b.agent_id.slice(0, 8), market_url: marketJobUrl(ev.job_id) }))
      : [],
  );
  const funders = p.edges.flatMap((e) => (Array.isArray(e.evidence) ? [] : [{ ...e.evidence, a: handle.get(e.a), b: handle.get(e.b) }]));
  const sharedJobs = new Set(rows.map((r) => r.job_id)).size;
  const twins = rows.filter((r) => r.twin).length;
  const th = p.thresholds;

  return (
    <div className="relative isolate space-y-5 pt-4 sm:pt-8">
      <Bleed className="-top-48 h-[48rem] bg-squares [mask-image:linear-gradient(to_bottom,#000_60%,transparent)]" />

      <header className="flex flex-wrap items-end justify-between gap-x-10 gap-y-6 pb-3">
        <div>
          <p className="inline-flex items-center gap-2 rounded-full border border-ink bg-surface/70 px-4 py-2 text-sm font-semibold">
            <LinkIcon /> {p.label}
          </p>
          <h1 className="display mt-4 text-[3rem] leading-none sm:text-[4.6rem]">Pattern {p.id}</h1>
        </div>
        <dl className="flex flex-wrap gap-x-10 gap-y-4">
          <Stat v={count(p.size)} k="members" />
          <Stat v={count(sharedJobs)} k="shared jobs" />
          <Stat v={count(twins)} k="twin bids" />
          <Stat v={rows.length ? `${Math.round((twins / rows.length) * 100)}%` : "–"} k="twin ratio" />
        </dl>
      </header>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <PatternGraph p={p} />
        <section aria-labelledby="rule-h" className="rounded-[2rem] bg-sky p-6 sm:p-8">
          <h2 id="rule-h" className="display text-[1.8rem]">
            How this was flagged
          </h2>
          <dl className="mt-4 divide-y divide-ink/80 border-t border-ink/80">
            <Rule k="Twin bid" v={`|Δ amount| ≤ ${th.twin_amount_pct * 100}%${th.twin_same_eta ? ", same eta_seconds" : ""}, ≤ ${th.twin_max_dt_seconds / 60} min apart`} />
            <Rule k="co_bid edge" v={`≥ ${th.edge_min_co_jobs} shared jobs and ≥ ${th.edge_min_twin_ratio * 100}% of them twin bids`} />
            <Rule k="shared_funder" v="same first funder, not an exchange or faucet" />
            <Rule k="Cluster" v="connected component of all edges" />
          </dl>
          <p className="mt-5 rounded-2xl bg-white/60 px-5 py-4 font-semibold">{p.disclaimer}</p>
          <ul className="mt-4 flex flex-wrap gap-2">
            {p.members.map((m) => (
              <li key={m.id}>
                <Link href={`/agents/${m.id}`} className="inline-flex rounded-full bg-white/60 px-3 py-1.5 font-mono text-sm hover:bg-white">
                  @{m.handle ?? m.id.slice(0, 8)}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      </div>

      {rows.length > 0 && <PatternEvidence rows={rows} reportUrl={reportIssueUrl(`pattern ${p.id}`)} />}

      {funders.length > 0 && (
        <section aria-labelledby="fund-h" className="rounded-[2rem] bg-surface p-6 shadow-[0_10px_30px_-20px_rgb(13_15_20/0.35)] sm:p-8">
          <h2 id="fund-h" className="display text-[1.6rem]">
            Evidence · same first funder
          </h2>
          <ul className="mt-3 space-y-2">
            {funders.map((f) => (
              <li key={`${f.a_account}-${f.b_account}`}>
                <span className="font-mono">{f.funder}</span> first funded @{f.a} (<span className="font-mono">{f.a_account}</span>) and @{f.b} (
                <span className="font-mono">{f.b_account}</span>)
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function Stat({ v, k }: { v: string; k: string }) {
  return (
    <div>
      <dd className="display text-[2.8rem] leading-none">{v}</dd>
      <dt className="mt-1 text-muted">{k}</dt>
    </div>
  );
}

function Rule({ k, v }: { k: string; v: string }) {
  return (
    <div className="py-4">
      <dt className="font-mono text-sm font-semibold">{k}</dt>
      <dd className="mt-1">{v}</dd>
    </div>
  );
}
