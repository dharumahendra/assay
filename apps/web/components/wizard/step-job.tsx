"use client";

/** Step 1 · Describe the work: import a market.near.ai job or write a brief (07 §2.8 step 1). */
import { useState } from "react";
import { Check, LinkIcon } from "@/components/icons";
import { dateTime } from "@/lib/format";
import { FORMATS, marketIdFrom, type Draft, type MarketMeta } from "./draft";
import { Card, Eyebrow, Hand, inputCls, Row } from "./ui";

interface JobDetailBody {
  job: { id: string; title: string | null; description: string | null; budget: { amount: string | null; token: string | null }; created_at: string | null; market_url: string; creator_id: string | null; tags: string[] };
}

export function StepJob({ d, set }: { d: Draft; set: (p: Partial<Draft>) => void }) {
  const [fetching, setFetching] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function fetchMarket() {
    const id = marketIdFrom(d.marketInput);
    if (!id) return setErr("Paste a market.near.ai job link or its id.");
    setErr(null);
    setFetching(true);
    try {
      const res = await fetch(`/api/jobs/${id}`);
      if (res.status === 404) return setErr("Assay hasn't indexed this job. Check the link, or write the brief yourself.");
      if (!res.ok) return setErr(`The Assay API answered ${res.status}. Retry in a moment.`);
      const { job } = (await res.json()) as JobDetailBody;
      const market: MarketMeta = { id: job.id, title: job.title, url: job.market_url, budget: job.budget.amount, token: job.budget.token, creator: job.creator_id, created_at: job.created_at, tags: job.tags };
      set({ market, title: (job.title ?? "").slice(0, 120), description: (job.description ?? "").slice(0, 2000), amount: d.amount || (job.budget.token?.toUpperCase() === "NEAR" && job.budget.amount ? job.budget.amount : d.amount) });
    } catch {
      setErr("The Assay API could not be reached.");
    } finally {
      setFetching(false);
    }
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_26rem]">
      <Card>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="display text-[1.8rem]">Job brief</h2>
            <p className="text-sm text-muted">Assay turns this brief into verifiable acceptance criteria in the next step.</p>
          </div>
          <div className="inline-flex rounded-full border border-rule bg-surface-2 p-1 text-[0.9375rem] font-medium" role="tablist">
            {(
              [
                ["market", "Import from market"],
                ["text", "Write from scratch"],
              ] as const
            ).map(([k, label]) => (
              <button key={k} type="button" role="tab" aria-selected={d.source === k} onClick={() => set({ source: k, ...(k === "text" ? { market: null } : {}) })} className={`rounded-full px-4 py-2 ${d.source === k ? "bg-ink text-white" : "text-muted hover:text-ink"}`}>
                {label}
              </button>
            ))}
          </div>
        </div>

        {d.source === "market" && (
          <div className="mt-5">
            <div className="flex justify-between text-sm">
              <label htmlFor="mkt" className="font-medium">
                Market job
              </label>
              <span className="font-mono text-xs text-muted">market.near.ai</span>
            </div>
            <div className={`mt-1.5 flex items-center gap-2 rounded-2xl border-2 py-1.5 pl-4 pr-1.5 ${d.market ? "border-act bg-surface-2" : "border-rule bg-surface-2 focus-within:border-act"}`}>
              <LinkIcon size={16} className="shrink-0 text-muted" />
              <input
                id="mkt"
                value={d.marketInput}
                onChange={(e) => set({ marketInput: e.target.value })}
                onKeyDown={(e) => e.key === "Enter" && fetchMarket()}
                placeholder="https://market.near.ai/jobs/…"
                className="min-w-0 flex-1 bg-transparent px-1 py-1.5 font-mono text-sm outline-none"
              />
              {d.market && marketIdFrom(d.marketInput) === d.market.id ? (
                <span className="inline-flex items-center gap-1.5 rounded-xl bg-lime px-3.5 py-2 text-sm font-semibold text-ink"><Check size={13} /> Fetched</span>
              ) : (
                <button type="button" onClick={fetchMarket} disabled={fetching} className="rounded-xl bg-ink px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">
                  {fetching ? "Fetching…" : "Fetch"}
                </button>
              )}
            </div>
            {err && (
              <p role="alert" className="mt-1.5 text-sm text-bad">
                {err}
              </p>
            )}
          </div>
        )}

        <div className="mt-5">
          <div className="flex justify-between text-sm">
            <label htmlFor="title" className="font-medium">
              Title
            </label>
            <span className="font-mono text-xs text-muted">{d.title.length} / 120</span>
          </div>
          <input id="title" value={d.title} maxLength={120} onChange={(e) => set({ title: e.target.value })} className={`mt-1.5 ${inputCls}`} />
        </div>

        <div className="mt-5">
          <div className="flex justify-between text-sm">
            <label htmlFor="desc" className="font-medium">
              What should be delivered?
            </label>
            <span className="font-mono text-xs text-muted">{d.description.length} / 2000</span>
          </div>
          <textarea id="desc" value={d.description} maxLength={2000} rows={8} onChange={(e) => set({ description: e.target.value })} className={`mt-1.5 ${inputCls} leading-relaxed`} />
          <p className={`mt-1 text-xs ${d.description.trim() && d.description.trim().length < 20 ? "font-medium text-bad" : "text-muted"}`}>
            {d.description.trim().length < 20 ? `At least 20 characters (${d.description.trim().length}/20). Describe the outcome, e.g. “A 1,000-word Markdown report with sources”.` : "Markdown supported."}
          </p>
        </div>

        <fieldset className="mt-5">
          <legend className="font-medium">Deliverable format</legend>
          <div className="mt-2 flex flex-wrap gap-2">
            {FORMATS.map(([k, label]) => (
              <button key={k} type="button" aria-pressed={d.format === k} onClick={() => set({ format: k })} className={`rounded-full border px-5 py-2.5 text-[0.9375rem] font-medium ${d.format === k ? "border-ink bg-ink text-white" : "border-rule bg-surface hover:border-ink"}`}>
                {label}
              </button>
            ))}
          </div>
          <p className="mt-2 text-xs text-muted">Jurors read the deliverable as text. It is scanned for hidden instructions before judging.</p>
        </fieldset>
      </Card>

      <div className="space-y-5">
        {d.market && (
          <Card>
            <Eyebrow>Source · market job</Eyebrow>
            <p className="display mt-3 text-[1.35rem] leading-tight">{d.market.title ?? d.market.id}</p>
            <div className="mt-3 divide-y divide-rule">
              <Row k="Posted by" v={d.market.creator ?? "–"} />
              <Row k="Budget" v={d.market.budget ? `${d.market.budget} ${d.market.token ?? ""}` : "–"} />
              <Row k="Posted" v={dateTime(d.market.created_at)} />
              {d.market.tags.length > 0 && <Row k="Tags" v={d.market.tags.slice(0, 3).join(" · ")} />}
            </div>
            <a href={d.market.url} target="_blank" rel="noreferrer" className="link mt-3 inline-block text-sm">
              Open on market.near.ai
            </a>
          </Card>
        )}
        <Card tone="navy">
          <h3 className="display text-[1.6rem]">What happens next</h3>
          <ol className="mt-4 space-y-4 text-[0.9375rem]">
            {[
              "Assay compiles your brief into ≤ 13 criteria, each MUST or SHOULD.",
              "Every criterion is tagged deterministic or AI-judged, and you can edit all of it.",
              "Criteria are hashed into the escrow, so “done” can’t be renegotiated later.",
            ].map((t, i) => (
              <li key={t} className="flex gap-3">
                <span className="font-mono text-sm text-lime">0{i + 1}</span>
                <span className="opacity-90">{t}</span>
              </li>
            ))}
          </ol>
        </Card>
        <Card tone="sky">
          <Hand>write outcomes, not effort</Hand>
          <p className="mt-3 text-[0.9375rem]">“At least 1,500 words” can be checked. “Thorough research” can’t. Anything a juror can’t verify from the deliverable itself will be flagged.</p>
        </Card>
      </div>
    </div>
  );
}
