import type { Metadata } from "next";
import { BidsTable } from "@/components/bids-table";
import { Chip } from "@/components/badges";
import { CriteriaPanel } from "@/components/criteria-panel";
import { External } from "@/components/icons";
import { api, API_URL } from "@/lib/api";
import { isCriteriaDoc, type CriteriaDoc } from "@/lib/criteria";
import { shortDate } from "@/lib/format";

export const metadata: Metadata = { title: "Job Analysis" };

async function latestCriteria(sha: string | undefined): Promise<CriteriaDoc | null> {
  if (!sha) return null;
  try {
    const res = await fetch(`${API_URL}/api/blobs/${sha}`, { cache: "force-cache" });
    const body: unknown = res.ok ? await res.json() : null;
    return isCriteriaDoc(body) ? body : null;
  } catch {
    return null;
  }
}

export default async function JobAnalysis({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { job, bids, criteria_docs } = await api.job(id);
  const criteria = await latestCriteria(criteria_docs[0]?.blob_sha256);

  return (
    <div className="space-y-8">
      <header>
        <h1 className="display text-[1.8rem] sm:text-[2.3rem]">{job.title ?? "Untitled job"}</h1>
        <dl className="mt-4 flex flex-wrap gap-x-8 gap-y-2 text-sm">
          <div>
            <dt className="text-muted">Status</dt>
            <dd className="font-medium">{job.status ?? "–"}</dd>
          </div>
          <div>
            <dt className="text-muted">Budget</dt>
            <dd className="num font-medium">{job.budget.amount ? `${job.budget.amount} ${job.budget.token ?? ""}` : "–"}</dd>
          </div>
          <div>
            <dt className="text-muted">Posted</dt>
            <dd className="font-medium">{shortDate(job.created_at)}</dd>
          </div>
          {job.creator_id && (
            <div>
              <dt className="text-muted">Creator</dt>
              <dd className="font-mono text-[0.8125rem]">{job.creator_id}</dd>
            </div>
          )}
        </dl>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          {job.tags.map((t) => (
            <Chip key={t}>{t}</Chip>
          ))}
          <a href={job.market_url} target="_blank" rel="noreferrer" className="link inline-flex items-center gap-1">
            Open on market <External size={12} />
          </a>
        </div>
      </header>

      {job.description && (
        <details className="rounded-lg border border-rule bg-surface p-5" open={job.description.length < 600}>
          <summary className="cursor-pointer font-semibold">Job description</summary>
          <p className="mt-3 max-w-[75ch] whitespace-pre-wrap text-muted">{job.description}</p>
        </details>
      )}

      <CriteriaPanel marketJobId={job.id} initial={criteria} />

      <section aria-labelledby="bids-h">
        <h2 id="bids-h" className="mb-3 text-[1.2rem] font-semibold">
          Bids
        </h2>
        <BidsTable bids={bids} />
      </section>
    </div>
  );
}
