"use client";

/** Step 2 · Lock what "done" means: review and edit the compiled criteria (07 §2.8 step 2, FR-C4). */
import { useEffect, useState } from "react";
import { MAX_CRITERIA, validateCriteria, type CriteriaDoc, type Criterion } from "@/lib/criteria";
import { canonicalJson, sha256Hex } from "@/lib/wallet/near";
import { Card, Eyebrow, KindToggle } from "./ui";

export const kindsOf = (doc: CriteriaDoc) => doc.criteria.map((c) => (c.kind === "MUST" ? 0 : 1));

export function ruleSummary(c: Criterion): string | null {
  const r = c.rule as { type: string; params: Record<string, unknown> } | null;
  if (!r) return null;
  const p = r.params;
  switch (r.type) {
    case "min_words":
    case "max_words":
      return `${r.type} · n = ${p.n}`;
    case "contains_sections":
      return `contains_sections · ${(p.headings as string[]).length} headings`;
    case "contains_links":
      return `contains_links · min = ${p.min}`;
    case "regex":
      return `regex · /${p.pattern}/`;
    default:
      return `${r.type}`;
  }
}

function nextId(c: Criterion[]): string {
  const used = new Set(c.map((x) => x.id));
  for (let i = 1; i < MAX_CRITERIA; i++) if (!used.has(`C${i}`)) return `C${i}`;
  return `C${c.length}`;
}

export function useCriteriaHash(doc: CriteriaDoc | null) {
  const [h, setH] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    if (!doc) return setH(null);
    void sha256Hex(canonicalJson(doc)).then((x) => live && setH(x));
    return () => {
      live = false;
    };
  }, [doc]);
  return h;
}

export function StepCriteria({
  doc,
  meta,
  compiling,
  onChange,
  onRegenerate,
}: {
  doc: CriteriaDoc;
  meta: string;
  compiling: boolean;
  onChange: (d: CriteriaDoc) => void;
  onRegenerate: () => void;
}) {
  const hash = useCriteriaHash(doc);
  const update = (criteria: Criterion[]) => onChange({ ...doc, criteria });
  const edit = (i: number, p: Partial<Criterion>) => update(doc.criteria.map((x, j) => (j === i ? { ...x, ...p } : x)));
  const invalid = validateCriteria(doc.criteria);
  const musts = doc.criteria.filter((c) => c.kind === "MUST" && c.id !== "C0").length;
  const hasC0 = doc.criteria.some((c) => c.id === "C0");
  const checks: [boolean, string][] = [
    [doc.criteria.length <= MAX_CRITERIA, `${doc.criteria.length} of max ${MAX_CRITERIA} criteria`],
    [musts >= 1, `${musts} MUST besides C0`],
    [doc.criteria.every((c) => c.text.trim() && c.text.length <= 500), "All texts ≤ 500 characters"],
    [hasC0, hasC0 ? "C0 integrity criterion kept" : "C0 integrity criterion removed"],
  ];

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_22rem]">
      <Card>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold tracking-tight">
              Criteria · {doc.criteria.length} of {MAX_CRITERIA}
            </h2>
            <p className="text-sm text-muted">{meta}</p>
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={onRegenerate} disabled={compiling} className="rounded-full border border-rule px-3 py-1.5 text-sm hover:border-ink disabled:opacity-60">
              {compiling ? "Compiling…" : "↻ Regenerate"}
            </button>
            <button
              type="button"
              disabled={doc.criteria.length >= MAX_CRITERIA}
              onClick={() => update([...doc.criteria, { id: nextId(doc.criteria), text: "", kind: "SHOULD", method: "llm", rule: null, rationale: "Added by the requester" }])}
              className="rounded-full bg-ink px-3 py-1.5 text-sm font-semibold text-paper disabled:opacity-50"
            >
              + Add criterion
            </button>
          </div>
        </div>

        <ol className="mt-5 space-y-3">
          {doc.criteria.map((c, i) =>
            c.id === "C0" ? (
              <li key={c.id} className="rounded-2xl bg-[#12151F] p-4 text-[#EEF0F4]">
                <div className="flex items-start gap-3">
                  <span className="font-mono text-xs text-[#C8F24A]">C0</span>
                  <p className="flex-1 text-sm">{c.text}</p>
                  <span className="rounded-full bg-[#C8F24A] px-2 py-0.5 text-[0.6875rem] font-semibold text-[#0D0F14]">MUST</span>
                </div>
                <div className="mt-2 flex items-center justify-between gap-3 pl-7 text-xs opacity-70">
                  <span>Integrity criterion added by Assay. Without it, a deliverable that tries to instruct the jury does not automatically fail.</span>
                  <button
                    type="button"
                    className="shrink-0 underline"
                    onClick={() => confirm("Without C0, a deliverable that instructs the jury does not fail automatically. Remove it?") && update(doc.criteria.filter((_, j) => j !== i))}
                  >
                    Remove
                  </button>
                </div>
              </li>
            ) : (
              <li key={`${c.id}-${i}`} className="rounded-2xl border border-rule p-4 focus-within:border-[#1D3BFF]">
                <div className="flex items-start gap-3">
                  <span className="pt-1 font-mono text-xs text-muted">{c.id}</span>
                  <textarea
                    aria-label={`Text of ${c.id}`}
                    value={c.text}
                    maxLength={500}
                    rows={Math.max(1, Math.ceil(c.text.length / 80))}
                    onChange={(e) => edit(i, { text: e.target.value })}
                    placeholder="A check a juror can verify from the deliverable alone"
                    className="min-w-0 flex-1 resize-none bg-transparent text-sm outline-none"
                  />
                  <KindToggle kind={c.kind} onChange={(k) => edit(i, { kind: k })} />
                  <button type="button" aria-label={`Delete ${c.id}`} onClick={() => update(doc.criteria.filter((_, j) => j !== i))} className="px-1 text-muted hover:text-bad">
                    ×
                  </button>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-2 pl-7">
                  <span className={`rounded-full px-2 py-0.5 text-[0.6875rem] font-medium ${c.method === "deterministic" ? "bg-[#BDE5F7] text-[#0D0F14]" : "bg-[#F6F7FA] text-muted"}`}>
                    {c.method === "deterministic" ? "Deterministic" : "AI-judged"}
                  </span>
                  {ruleSummary(c) && <code className="rounded-md bg-paper px-1.5 py-0.5 font-mono text-[0.6875rem] text-muted">{ruleSummary(c)}</code>}
                </div>
              </li>
            ),
          )}
        </ol>
        {invalid && (
          <p role="alert" className="mt-3 text-sm text-bad">
            {invalid}
          </p>
        )}
      </Card>

      <div className="space-y-5">
        <Card tone={invalid ? "peach" : "lime"}>
          <h3 className="font-semibold">{invalid ? "Fix before continuing" : "Ready to continue"}</h3>
          <ul className="mt-3 space-y-1.5 text-sm">
            {checks.map(([ok, t]) => (
              <li key={t} className="flex gap-2">
                <span aria-hidden>{ok ? "✓" : "!"}</span>
                {t}
              </li>
            ))}
          </ul>
        </Card>

        {doc.unverifiable.length > 0 && (
          <Card>
            <h3 className="font-semibold">Unverifiable · {doc.unverifiable.length}</h3>
            <ul className="mt-3 space-y-4 text-sm">
              {doc.unverifiable.map((u) => (
                <li key={u.original}>
                  <p className="font-medium">“{u.original}”</p>
                  <p className="mt-1 text-muted">{u.reason}</p>
                  {u.replacement && (
                    <button
                      type="button"
                      disabled={doc.criteria.length >= MAX_CRITERIA || doc.criteria.some((c) => c.text === u.replacement)}
                      onClick={() => update([...doc.criteria, { id: nextId(doc.criteria), text: u.replacement!, kind: "SHOULD", method: "llm", rule: null, rationale: `Replaces: ${u.original}`.slice(0, 300) }])}
                      className="mt-2 rounded-full border border-rule px-3 py-1 text-xs hover:border-ink disabled:opacity-50"
                    >
                      + Use replacement: {u.replacement}
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </Card>
        )}

        {doc.ambiguities.length > 0 && (
          <Card>
            <h3 className="font-semibold">Questions for you</h3>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted">
              {doc.ambiguities.map((a) => (
                <li key={a}>{a}</li>
              ))}
            </ul>
          </Card>
        )}

        <Card tone="navy">
          <Eyebrow>Canonical JSON → SHA-256</Eyebrow>
          <p className="mt-2 break-all font-mono text-sm text-[#C8F24A]">{hash ?? "…"}</p>
          <p className="mt-2 text-xs opacity-70">Computed in your browser. Sent to create_job with criteria_kinds [{kindsOf(doc).join(",")}].</p>
        </Card>
      </div>
    </div>
  );
}
