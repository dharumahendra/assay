import type { Metadata } from "next";
import Link from "next/link";
import { BidsTable } from "@/components/bids-table";
import { Chip } from "@/components/badges";
import { CriteriaPanel } from "@/components/criteria-panel";
import { ChevronDown } from "@/components/icons";
import { JobStatusPill } from "@/components/status";
import { Bleed, GhostLink, PrimaryLink } from "@/components/ui";
import { api, API_URL } from "@/lib/api";
import { CriteriaDocSchema, type CriteriaDoc } from "@juri/shared";
import { dateTime, middle } from "@/lib/format";

export const metadata: Metadata = { title: "Job Analysis" };

async function latestCriteria(sha: string | undefined): Promise<CriteriaDoc | null> {
  if (!sha) return null;
  try {
    const res = await fetch(`${API_URL}/api/blobs/${sha}`, { cache: "force-cache" });
    const parsed = CriteriaDocSchema.safeParse(res.ok ? await res.json() : null);
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

const CUT = 320;

export default async function JobAnalysis({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { job, bids, criteria_docs } = await api.job(id);
  const criteria = await latestCriteria(criteria_docs[0]?.blob_sha256);
  const flagged = bids.filter((b) => b.patterns.length > 0).length;
  const desc = job.description?.trim() ?? "";

  return (
    <div className="relative isolate space-y-5 pt-4 sm:pt-8">
      <Bleed className="-top-48 h-[46rem] bg-gridlines [mask-image:linear-gradient(to_bottom,#000_65%,transparent)]" />

      <header className="grid gap-8 rounded-[2rem] bg-surface p-6 shadow-[0_10px_30px_-20px_rgb(13_15_20/0.35)] sm:p-10 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="min-w-0">
          <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-sm text-muted">
            <Link href="/jobs" className="hover:text-ink">
              Jobs
            </Link>
            <span aria-hidden>›</span>
            <span className="font-mono text-ink" title={job.id}>
              {middle(job.id, 13, 6)}
            </span>
          </nav>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <JobStatusPill status={job.status} />
            {job.tags.map((t) => (
              <Chip key={t}>{t}</Chip>
            ))}
          </div>
          <h1 className="display mt-4 text-[2.2rem] leading-[1] sm:text-[3.2rem]">{job.title ?? "Untitled job"}</h1>
          {desc &&
            (desc.length <= CUT ? (
              <p className="mt-5 max-w-[75ch] whitespace-pre-wrap text-lg text-muted">{desc}</p>
            ) : (
              <details className="group mt-5 max-w-[75ch]">
                <summary className="cursor-pointer list-none text-lg text-muted [&::-webkit-details-marker]:hidden">
                  <span className="group-open:hidden">{desc.slice(0, CUT).trimEnd()}…</span>
                  <span className="mt-3 flex items-center gap-1 text-base font-semibold text-act group-open:hidden">
                    Show full description <ChevronDown size={13} />
                  </span>
                  <span className="hidden text-base font-semibold text-act group-open:flex group-open:items-center group-open:gap-1">
                    Hide full description <ChevronDown size={13} className="rotate-180" />
                  </span>
                </summary>
                <p className="mt-2 whitespace-pre-wrap text-lg text-muted">{desc}</p>
              </details>
            ))}
        </div>
        <div>
          <dl>
            <Meta k="Budget" v={job.budget.amount ? `${job.budget.amount} ${job.budget.token ?? ""}` : "–"} />
            {job.creator_id && <Meta k="Creator" v={<span className="font-mono text-[0.875rem]">{middle(job.creator_id, 14, 6)}</span>} />}
            <Meta k="Posted" v={dateTime(job.created_at)} />
            <Meta k="Bids" v={`${bids.length}${flagged ? ` · ${flagged} flagged` : ""}`} />
          </dl>
          <div className="mt-6 flex flex-col items-start gap-3">
            <PrimaryLink href={`/protected/new?from=${encodeURIComponent(job.id)}`}>Use in protected job</PrimaryLink>
            <GhostLink href={job.market_url} external>
              Open on market.near.ai
            </GhostLink>
          </div>
        </div>
      </header>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_28rem]">
        <BidsTable bids={bids} />
        <CriteriaPanel marketJobId={job.id} initial={criteria} />
      </div>
    </div>
  );
}

function Meta({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-rule py-3.5">
      <dt className="text-muted">{k}</dt>
      <dd className="text-right font-semibold">{v}</dd>
    </div>
  );
}
