"use client";

import Link from "next/link";
import { useState } from "react";
import { criteriaMarkdown, isCriteriaDoc, MAX_CRITERIA, validateCriteria, type CriteriaDoc, type Criterion } from "@/lib/criteria";

type Phase = { s: "idle" } | { s: "compiling" } | { s: "error"; title: string; detail: string };

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

export function CriteriaPanel({ marketJobId, initial }: { marketJobId: string; initial: CriteriaDoc | null }) {
  const [doc, setDoc] = useState<CriteriaDoc | null>(initial);
  const [phase, setPhase] = useState<Phase>({ s: "idle" });
  const [editing, setEditing] = useState(false);
  const [copied, setCopied] = useState(false);

  async function compile() {
    if (doc && editing && !confirm("Regenerating replaces your edits. Continue?")) return;
    setPhase({ s: "compiling" });
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

  return (
    <section aria-labelledby="criteria-h" className="rounded-lg border border-rule bg-surface p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="criteria-h" className="text-[1.2rem] font-semibold">
          Acceptance criteria
        </h2>
        <div className="flex flex-wrap gap-2">
          {!doc && (
            <button type="button" onClick={compile} disabled={phase.s === "compiling"} className="rounded-md bg-act px-3 py-1.5 font-medium text-act-ink disabled:opacity-60">
              Generate criteria
            </button>
          )}
          {doc && (
            <>
              <button type="button" onClick={compile} disabled={phase.s === "compiling"} className="rounded-md border border-rule px-3 py-1.5 hover:border-ink disabled:opacity-60">
                Regenerate
              </button>
              <button type="button" onClick={() => setEditing((e) => !e)} aria-pressed={editing} className="rounded-md border border-rule px-3 py-1.5 hover:border-ink">
                {editing ? "Done editing" : "Edit criteria"}
              </button>
              <button type="button" onClick={copy} className="rounded-md border border-rule px-3 py-1.5 hover:border-ink">
                {copied ? "Copied" : "Copy as Markdown"}
              </button>
              <Link
                href={`/protected/new?from=${encodeURIComponent(marketJobId)}`}
                aria-disabled={!!invalid}
                className={`rounded-md bg-act px-3 py-1.5 font-medium text-act-ink ${invalid ? "pointer-events-none opacity-50" : ""}`}
              >
                Use in protected job
              </Link>
            </>
          )}
        </div>
      </div>

      {phase.s === "compiling" && (
        <p className="mt-4 text-muted" role="status">
          Compiling criteria… usually under 20s.
        </p>
      )}
      {phase.s === "error" && (
        <div role="alert" className="mt-4 rounded-md border border-bad/40 bg-bad-bg p-4">
          <p className="font-semibold">{phase.title}</p>
          <p className="text-sm text-muted">{phase.detail}</p>
          <button type="button" onClick={compile} className="mt-3 rounded-md bg-act px-3 py-1 text-act-ink">
            Retry
          </button>
        </div>
      )}
      {!doc && phase.s === "idle" && (
        <p className="mt-3 max-w-[62ch] text-muted">
          No criteria yet. Generate them from the job description: Assay drafts checks a jury can verify from the
          deliverable alone, and lists anything it cannot check.
        </p>
      )}

      {doc && (
        <div className="mt-4 space-y-5">
          {doc.summary && <p className="max-w-[72ch] text-muted">{doc.summary}</p>}
          <ol className="divide-y divide-rule border-y border-rule">
            {doc.criteria.map((c, i) => (
              <li key={`${c.id}-${i}`} className="flex flex-wrap items-start gap-3 py-3">
                <span className="num w-8 shrink-0 pt-0.5 font-semibold text-muted">{c.id}</span>
                <div className="min-w-0 flex-1">
                  {editing ? (
                    <textarea
                      aria-label={`Text of ${c.id}`}
                      value={c.text}
                      maxLength={500}
                      rows={2}
                      onChange={(e) => update(doc.criteria.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)))}
                      className="w-full rounded-md border border-rule bg-paper px-2 py-1"
                    />
                  ) : (
                    <p>{c.text}</p>
                  )}
                  {c.id === "C0" && <p className="mt-1 text-sm text-muted">Integrity check: fails a deliverable that tries to instruct the jury.</p>}
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  {editing ? (
                    <button
                      type="button"
                      onClick={() => update(doc.criteria.map((x, j) => (j === i ? { ...x, kind: x.kind === "MUST" ? "SHOULD" : "MUST" } : x)))}
                      className="rounded-full border border-ink/40 px-2 py-0.5 text-[0.8125rem] font-semibold"
                      aria-label={`${c.id} is ${c.kind}; switch`}
                    >
                      {c.kind}
                    </button>
                  ) : (
                    <KindChip kind={c.kind} />
                  )}
                  <span className="rounded-full border border-rule px-2 py-0.5 text-[0.8125rem] text-muted">
                    {c.method === "deterministic" ? "Deterministic" : "AI-judged"}
                  </span>
                  {editing && (
                    <button
                      type="button"
                      onClick={() => {
                        if (c.id === "C0" && !confirm("Without C0, a deliverable that instructs the jury does not fail automatically. Delete it?")) return;
                        update(doc.criteria.filter((_, j) => j !== i));
                      }}
                      className="rounded-md px-2 py-0.5 text-sm text-bad hover:underline"
                    >
                      Delete
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
              className="rounded-md border border-rule px-3 py-1.5 hover:border-ink"
            >
              Add criterion
            </button>
          )}
          {invalid && <p className="text-sm text-bad">{invalid}</p>}
          {doc.unverifiable.length > 0 && (
            <div>
              <h3 className="font-semibold">Unverifiable</h3>
              <ul className="mt-2 space-y-2">
                {doc.unverifiable.map((u) => (
                  <li key={u.original} className="text-sm">
                    <span className="line-through decoration-muted">{u.original}</span> <span className="text-muted">({u.reason})</span>
                    {u.replacement && (
                      <span className="block">
                        Instead: {u.replacement}
                        {editing && doc.criteria.length < MAX_CRITERIA && (
                          <button
                            type="button"
                            className="link ml-2"
                            onClick={() => update([...doc.criteria, { id: nextId(doc.criteria), text: u.replacement!, kind: "SHOULD", method: "llm", rule: null, rationale: `Replaces: ${u.original}`.slice(0, 300) }])}
                          >
                            Use replacement
                          </button>
                        )}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {doc.ambiguities.length > 0 && (
            <div>
              <h3 className="font-semibold">Questions for the requester</h3>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
                {doc.ambiguities.map((a) => (
                  <li key={a}>{a}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function KindChip({ kind }: { kind: "MUST" | "SHOULD" }) {
  return (
    <span className={`rounded-full border px-2 py-0.5 text-[0.8125rem] ${kind === "MUST" ? "border-ink/60 font-semibold" : "border-rule text-muted"}`}>
      {kind}
    </span>
  );
}

function nextId(c: Criterion[]): string {
  const used = new Set(c.map((x) => x.id));
  for (let i = 1; i < MAX_CRITERIA; i++) if (!used.has(`C${i}`)) return `C${i}`;
  return `C${c.length}`;
}
