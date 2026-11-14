"use client";

/** Acceptance criteria for a market job (page-design "04 Job Analysis": the peach panel beside the bids). */
import { useState } from "react";
import { criteriaMarkdown, isCriteriaDoc, MAX_CRITERIA, validateCriteria, type CriteriaDoc, type Criterion } from "@/lib/criteria";
import { Copy, Gear, Plus, Refresh, Spark, Trash } from "./icons";

type Phase = { s: "idle" } | { s: "compiling"; t0: number } | { s: "error"; title: string; detail: string };

async function explain(res: Response): Promise<{ title: string; detail: string }> {
  const body = (await res.json().catch(() => null)) as { error?: { code?: string; message?: string } } | null;
  const code = body?.error?.code;
  if (res.status === 503 && code === "no_llm")
    return { title: "No model is configured for the criteria compiler.", detail: "Set a NEAR AI Cloud or OpenAI-compatible key on the API, then retry." };
  if (res.status === 404 && !code) return { title: "The criteria compiler is not available on this API yet.", detail: "It ships with the jury runner. Retry after updating the API." };
  if (res.status === 422) return { title: "The model returned criteria that failed validation.", detail: body?.error?.message ?? "Retry to compile again." };
  if (res.status === 502) return { title: "The model provider returned an error.", detail: "Retry in a moment." };
  if (res.status === 429) return { title: "Too many compile requests.", detail: "Wait a minute, then retry." };
  return { title: "Compiling criteria failed.", detail: body?.error?.message ?? `The API answered ${res.status}.` };
}

const btn = "inline-flex items-center justify-center gap-2 rounded-full bg-surface px-4 py-2.5 text-sm font-semibold hover:bg-surface-2 disabled:opacity-60";

export function CriteriaPanel({ marketJobId, initial }: { marketJobId: string; initial: CriteriaDoc | null }) {
  const [doc, setDoc] = useState<CriteriaDoc | null>(initial);
  const [phase, setPhase] = useState<Phase>({ s: "idle" });
  const [ms, setMs] = useState<number | null>(null);
  const [editing, setEditing] = useState(false);
  const [copied, setCopied] = useState(false);

  async function compile() {
    if (doc && editing && !confirm("Regenerating replaces your edits. Continue?")) return;
    const t0 = performance.now();
    setPhase({ s: "compiling", t0 });
    try {
      const res = await fetch("/api/criteria/compile", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ market_job_id: marketJobId }),
      });
      if (!res.ok) return setPhase({ s: "error", ...(await explain(res)) });
      const body: unknown = await res.json();
      if (!isCriteriaDoc(body)) return setPhase({ s: "error", title: "The compiler answered in an unexpected shape.", detail: "Retry, or report it." });
      setDoc(body);
      setMs(Math.round(performance.now() - t0));
      setEditing(false);
      setPhase({ s: "idle" });
    } catch {
      setPhase({ s: "error", title: "The Assay API could not be reached.", detail: "Check your connection, then retry." });
    }
  }

  async function copy() {
    if (!doc) return;
    await navigator.clipboard.writeText(criteriaMarkdown(doc));
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  }

  const update = (criteria: Criterion[]) => doc && setDoc({ ...doc, criteria });
  const invalid = doc ? validateCriteria(doc.criteria) : null;
  const compiling = phase.s === "compiling";

  return (
    <section aria-labelledby="criteria-h" className="rounded-[1.75rem] bg-peach p-5 text-ink sm:p-7">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="criteria-h" className="display text-[1.9rem]">
          Acceptance criteria
        </h2>
        <button type="button" onClick={compile} disabled={compiling} className="inline-flex items-center gap-2 rounded-full bg-white/60 px-3.5 py-2 text-sm font-semibold hover:bg-white disabled:opacity-60">
          <Refresh size={14} /> {compiling ? "Compiling…" : doc ? "Regenerate" : "Generate"}
        </button>
      </div>
      {doc && (
        <p className="mt-2 font-mono text-xs text-ink/70">
          {ms !== null ? `Compiled in ${(ms / 1000).toFixed(1)}s · ` : ""}CriteriaDoc v{doc.version} · {doc.unverifiable.length} unverifiable · {doc.ambiguities.length} question
          {doc.ambiguities.length === 1 ? "" : "s"}
        </p>
      )}

      {compiling && (
        <p className="mt-4 text-ink/80" role="status">
          Compiling criteria… usually under 20s.
        </p>
      )}
      {phase.s === "error" && (
        <div role="alert" className="mt-4 rounded-2xl bg-white/60 p-4">
          <p className="font-semibold">{phase.title}</p>
          <p className="text-sm text-ink/70">{phase.detail}</p>
          <button type="button" onClick={compile} className="mt-3 rounded-full bg-ink px-4 py-1.5 text-sm font-semibold text-white">
            Retry
          </button>
        </div>
      )}
      {!doc && phase.s === "idle" && (
        <p className="mt-3 text-ink/80">
          No criteria yet. Generate them from the job description: Assay drafts checks a jury can verify from the deliverable alone, and lists anything it cannot check.
        </p>
      )}

      {doc && (
        <div className="mt-4 space-y-3">
          <ol className="space-y-2">
            {doc.criteria.map((c, i) => (
              <li key={`${c.id}-${i}`} className="flex items-start gap-3 rounded-2xl bg-surface px-4 py-3.5">
                <span className="w-6 shrink-0 pt-0.5 font-mono text-xs text-faint">{c.id}</span>
                <div className="min-w-0 flex-1">
                  {editing ? (
                    <textarea
                      aria-label={`Text of ${c.id}`}
                      value={c.text}
                      maxLength={500}
                      rows={2}
                      onChange={(e) => update(doc.criteria.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)))}
                      className="w-full resize-none rounded-lg border border-rule bg-surface-2 px-2 py-1 outline-none focus:border-act"
                    />
                  ) : (
                    <p className="leading-snug">{c.text}</p>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <button
                    type="button"
                    disabled={!editing}
                    onClick={() => update(doc.criteria.map((x, j) => (j === i ? { ...x, kind: x.kind === "MUST" ? "SHOULD" : "MUST" } : x)))}
                    aria-label={editing ? `${c.id} is ${c.kind}; switch` : c.kind}
                    className={`rounded-md px-2 py-1 text-[0.6875rem] font-bold disabled:cursor-default ${c.kind === "MUST" ? "bg-ink text-white" : ""}`}
                  >
                    {c.kind}
                  </button>
                  <span title={c.method === "deterministic" ? "Deterministic check" : "AI-judged"} className="text-muted">
                    {c.method === "deterministic" ? <Gear size={15} /> : <Spark size={15} />}
                  </span>
                  {editing && (
                    <button
                      type="button"
                      aria-label={`Delete ${c.id}`}
                      onClick={() => {
                        if (c.id === "C0" && !confirm("Without C0, a deliverable that instructs the jury does not fail automatically. Delete it?")) return;
                        update(doc.criteria.filter((_, j) => j !== i));
                      }}
                      className="text-faint hover:text-bad"
                    >
                      <Trash size={15} />
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ol>
          {editing && doc.criteria.length < MAX_CRITERIA && (
            <button
              type="button"
              onClick={() => update([...doc.criteria, { id: nextId(doc.criteria), text: "", kind: "SHOULD", method: "llm", rule: null, rationale: "Added by the requester" }])}
              className={btn}
            >
              <Plus size={13} /> Add criterion
            </button>
          )}
          {invalid && <p className="text-sm font-medium text-bad">{invalid}</p>}

          {doc.unverifiable.length > 0 && (
            <div className="rounded-2xl bg-white/45 px-5 py-4">
              <p className="eyebrow text-ink/60">Unverifiable</p>
              <ul className="mt-2 space-y-3">
                {doc.unverifiable.map((u) => (
                  <li key={u.original}>
                    <p className="font-semibold">“{u.original}”</p>
                    <p className="text-sm text-ink/70">{u.reason}</p>
                    {u.replacement && (
                      <p className="mt-1 text-ink/80">
                        → Replacement: {u.replacement}
                        {editing && doc.criteria.length < MAX_CRITERIA && (
                          <button
                            type="button"
                            className="ml-2 font-semibold underline"
                            onClick={() => update([...doc.criteria, { id: nextId(doc.criteria), text: u.replacement!, kind: "SHOULD", method: "llm", rule: null, rationale: `Replaces: ${u.original}`.slice(0, 300) }])}
                          >
                            Use it
                          </button>
                        )}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {doc.ambiguities.length > 0 && (
            <div className="rounded-2xl bg-white/45 px-5 py-4">
              <p className="eyebrow text-ink/60">Questions for the requester</p>
              <ul className="mt-2 space-y-1.5">
                {doc.ambiguities.map((a) => (
                  <li key={a}>{a}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="grid grid-cols-2 gap-2 pt-1">
            <button type="button" onClick={() => setEditing((e) => !e)} aria-pressed={editing} className={btn}>
              ✎ {editing ? "Done editing" : "Edit criteria"}
            </button>
            <button type="button" onClick={copy} className={btn}>
              <Copy size={14} /> {copied ? "Copied" : "Copy as Markdown"}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

function nextId(c: Criterion[]): string {
  const used = new Set(c.map((x) => x.id));
  for (let i = 1; i < MAX_CRITERIA; i++) if (!used.has(`C${i}`)) return `C${i}`;
  return `C${c.length}`;
}
