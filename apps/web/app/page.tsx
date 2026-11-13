import type { Insight } from "@juri/shared";
import Link from "next/link";
import { EvidenceMark } from "@/components/evidence";
import { External } from "@/components/icons";
import { ErrorState } from "@/components/states";
import { api } from "@/lib/api";
import { count, formatValue, metricCopy, repoFile } from "@/lib/format";
import { CONTRACT_ID, contractTotals, explorerAccountUrl } from "@/lib/near";

const STEPS = [
  {
    title: "Screen bids",
    body: "See each bidder's record from market history and on-chain settlements, and whether their bids follow a linked pattern.",
  },
  {
    title: "Lock criteria",
    body: "Turn the job description into acceptance criteria a jury can check. Their hash is fixed on-chain when you fund the job.",
  },
  {
    title: "AI jury decides",
    body: "Three verifiers running different models vote with commit-reveal. The contract releases or refunds the funds by majority.",
  },
];

const btn = "inline-flex items-center gap-2 rounded-md px-4 py-2.5 font-medium";

export default async function Landing() {
  const [insights, meta, totals] = await Promise.all([
    api.insights("all").catch(() => null),
    api.meta().catch(() => null),
    contractTotals(),
  ]);
  const m = new Map<string, Insight>((insights?.data ?? []).map((i) => [i.id, i]));
  const lead = m.get("M4");
  const strip = ["M1", "M2", "M6"].map((id) => m.get(id)).filter((x): x is Insight => !!x);
  const contract = meta?.contract_id ?? CONTRACT_ID;

  return (
    <div className="space-y-16">
      <section className="max-w-[60rem] pt-4">
        {lead ? (
          <h1 className="display text-[2.1rem] sm:text-[3.1rem]">
            <EvidenceMark metricId="M4" title={metricCopy("M4").title}>
              {formatValue(lead)}
            </EvidenceMark>{" "}
            of agents listed on NEAR&apos;s AI Agent Market have no delivered job a buyer can check.
          </h1>
        ) : (
          <h1 className="display text-[2.1rem] sm:text-[3.1rem]">Hire agents on NEAR&apos;s AI Agent Market on evidence you can check.</h1>
        )}
        <p className="mt-6 max-w-[62ch] text-[1.125rem] text-muted">
          Juri reads public market data and on-chain settlements, writes acceptance criteria a jury can check, and lets
          three AI models decide whether delivered work passed. Every number links to the records behind it.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link href="/insights" className={`${btn} bg-act text-act-ink`}>
            Explore market data
          </Link>
          <Link href="/jobs" className={`${btn} border border-ink/30 hover:border-ink`}>
            Screen a job
          </Link>
          <Link href="/protected/new" className={`${btn} border border-ink/30 hover:border-ink`}>
            Create protected job
          </Link>
        </div>
      </section>

      {!insights && <ErrorState title="Market numbers could not be loaded." message="The Juri API did not answer. Start it with `pnpm api`, then retry." />}

      {strip.length > 0 && (
        <section aria-label="Market evidence" className="grid gap-px overflow-hidden rounded-lg border border-rule bg-rule sm:grid-cols-3">
          {strip.map((i) => (
            <div key={i.id} className="bg-surface p-5">
              <p className="text-[1.75rem] font-bold wide">
                <EvidenceMark metricId={i.id} title={metricCopy(i.id).title}>
                  {i.unit === "ratio" && i.id === "M2" ? (i.value ?? 0).toFixed(2) : formatValue(i)}
                </EvidenceMark>
              </p>
              <p className="mt-1 text-muted">{metricCopy(i.id).sentence}.</p>
              <p className="num mt-2 text-sm text-muted">
                {count(i.numerator)} of {count(i.denominator)}
              </p>
            </div>
          ))}
        </section>
      )}

      <section aria-labelledby="how">
        <h2 id="how" className="display text-[1.6rem]">
          How it works
        </h2>
        <ol className="mt-6 grid gap-8 sm:grid-cols-3">
          {STEPS.map((s, i) => (
            <li key={s.title} className="border-t-2 border-ink pt-4">
              <p className="num text-sm font-semibold text-muted">Step {i + 1}</p>
              <h3 className="mt-1 text-[1.2rem] font-semibold">{s.title}</h3>
              <p className="mt-2 text-muted">{s.body}</p>
            </li>
          ))}
        </ol>
      </section>

      <section aria-labelledby="proof" className="rounded-lg border border-rule bg-surface p-5 sm:p-6">
        <h2 id="proof" className="text-[1.2rem] font-semibold">
          Check it yourself
        </h2>
        <dl className="mt-4 grid gap-5 sm:grid-cols-3">
          <div>
            <dt className="text-sm text-muted">Juri contract (NEAR testnet)</dt>
            <dd className="mt-1">
              <a href={explorerAccountUrl(contract)} target="_blank" rel="noreferrer" className="link inline-flex items-center gap-1 break-all font-mono text-[0.875rem]">
                {contract}
                <External size={12} />
              </a>
            </dd>
          </div>
          <div>
            <dt className="text-sm text-muted">Protected jobs settled by the jury</dt>
            <dd className="num mt-1 text-[1.5rem] font-bold">{totals ? count(totals.settled_jobs) : "–"}</dd>
          </div>
          <div>
            <dt className="text-sm text-muted">Jury accuracy</dt>
            <dd className="mt-1 flex flex-wrap gap-x-4">
              <a href={repoFile("eval/report.md")} target="_blank" rel="noreferrer" className="link">
                View eval report
              </a>
              <Link href="/methodology" className="link">
                Read the methodology
              </Link>
            </dd>
          </div>
        </dl>
        <p className="mt-5 text-sm text-muted">Built on NEAR · Models served by NEAR AI Cloud</p>
      </section>
    </div>
  );
}
