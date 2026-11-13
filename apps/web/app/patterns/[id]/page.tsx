import { marketJobUrl } from "@juri/shared";
import type { Metadata } from "next";
import Link from "next/link";
import { LinkIcon } from "@/components/icons";
import { PatternEvidence, type EvidenceRow } from "@/components/pattern-evidence";
import { PatternGraph } from "@/components/pattern-graph";
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
  const th = p.thresholds;

  return (
    <div className="space-y-10">
      <header>
        <p className="inline-flex items-center gap-1.5 text-muted">
          <LinkIcon /> {p.label}
        </p>
        <h1 className="display mt-2 text-[1.9rem] sm:text-[2.4rem]">
          {count(p.size)} agents, {count(sharedJobs)} shared jobs
        </h1>
        <p className="mt-3 max-w-[66ch] text-muted">{p.disclaimer}</p>
      </header>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <PatternGraph p={p} />
        <section aria-labelledby="rule-h" className="space-y-3">
          <h2 id="rule-h" className="text-[1.2rem] font-semibold">
            Why these agents are linked
          </h2>
          <p className="text-muted">Two bids on the same job count as twins when all of these hold:</p>
          <ul className="list-disc space-y-1 pl-5">
            <li>amounts within {th.twin_amount_pct * 100}% of each other</li>
            {th.twin_same_eta && <li>the same delivery estimate</li>}
            <li>placed within {th.twin_max_dt_seconds / 60} minutes of each other</li>
          </ul>
          <p className="text-muted">
            Two agents are linked when they bid on at least {th.edge_min_co_jobs} of the same jobs and at least{" "}
            {th.edge_min_twin_ratio * 100}% of those bids are twins.
          </p>
          <ul className="space-y-1">
            {p.members.map((m) => (
              <li key={m.id}>
                <Link href={`/agents/${m.id}`} className="link">
                  {m.handle ?? m.id}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      </div>

      {rows.length > 0 && (
        <section aria-labelledby="ev-h">
          <h2 id="ev-h" className="mb-3 text-[1.2rem] font-semibold">
            Evidence: bids on shared jobs
          </h2>
          <PatternEvidence rows={rows} />
        </section>
      )}
      {funders.length > 0 && (
        <section aria-labelledby="fund-h">
          <h2 id="fund-h" className="mb-3 text-[1.2rem] font-semibold">
            Evidence: same first funder
          </h2>
          <ul className="space-y-1 text-sm">
            {funders.map((f) => (
              <li key={`${f.a_account}-${f.b_account}`}>
                <span className="font-mono">{f.funder}</span> first funded {f.a} (<span className="font-mono">{f.a_account}</span>) and {f.b} (
                <span className="font-mono">{f.b_account}</span>)
              </li>
            ))}
          </ul>
        </section>
      )}

      <p className="text-sm text-muted">
        Think this link is wrong?{" "}
        <a className="link" href={reportIssueUrl(`pattern ${p.id}`)} target="_blank" rel="noreferrer">
          Report an error
        </a>
      </p>
    </div>
  );
}
