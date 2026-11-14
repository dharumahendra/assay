"use client";

/** Step 2 · Lock what "done" means: review and edit the compiled criteria (07 §2.8 step 2, FR-C4). */
import { useEffect, useState } from "react";
import { MAX_CRITERIA, validateCriteria, type CriteriaDoc, type Criterion } from "@/lib/criteria";
import { canonicalJson, sha256Hex } from "@/lib/wallet/near";
import { Check, Close, Eye, Gear, Info, Plus, Refresh, Shield, Spark, Trash } from "@/components/icons";
import { ghostBtn } from "@/components/ui";
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
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_26rem]">
      <Card>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="display text-[1.8rem]">
              Criteria · {doc.criteria.length} of {MAX_CRITERIA}
            </h2>
            <p className="text-sm text-muted">{meta}</p>
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={onRegenerate} disabled={compiling} className={ghostBtn}>
              <Refresh size={14} /> {compiling ? "Compiling…" : "Regenerate"}
            </button>
            <button
              type="button"
              disabled={doc.criteria.length >= MAX_CRITERIA}
              onClick={() => update([...doc.criteria, { id: nextId(doc.criteria), text: "", kind: "SHOULD", method: "llm", rule: null, rationale: "Added by the requester" }])}
              className="inline-flex items-center gap-2 rounded-full bg-ink px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              <Plus size={14} /> Add criterion
            </button>
          </div>
        </div>

        <ol className="mt-5 space-y-3">
          {doc.criteria.map((c, i) =>
            c.id === "C0" ? (
              <li key={c.id} className="rounded-2xl bg-navy px-5 py-4 text-paper">
                <div className="flex items-start gap-3">
                  <Shield size={17} className="mt-0.5 shrink-0 text-lime" />
                  <span className="pt-0.5 font-mono text-xs opacity-60">C0</span>
                  <p className="flex-1">{c.text}</p>
                  <span className="rounded-md bg-lime px-2.5 py-1 text-[0.6875rem] font-bold text-ink">MUST</span>
                  <button
                    type="button"
                    aria-label="Remove C0"
                    className="opacity-60 hover:opacity-100"
                    onClick={() => confirm("Without C0, a deliverable that instructs the jury does not fail automatically. Remove it?") && update(doc.criteria.filter((_, j) => j !== i))}
                  >
                    <Trash size={16} />
                  </button>
                </div>
                <p className="mt-2 text-sm opacity-60">Integrity criterion added by Assay. Without it, a deliverable that tries to instruct the jury does not automatically fail.</p>
              </li>
            ) : (
              <li key={`${c.id}-${i}`} className="rounded-2xl border border-rule bg-surface-2 px-5 py-4 focus-within:border-act focus-within:ring-1 focus-within:ring-act">
                <div className="flex flex-wrap items-start gap-3">
                  <span className="pt-1 font-mono text-xs text-faint">{c.id}</span>
                  <textarea
                    aria-label={`Text of ${c.id}`}
                    value={c.text}
                    maxLength={500}
                    rows={Math.max(1, Math.ceil(c.text.length / 70))}
                    onChange={(e) => edit(i, { text: e.target.value })}
                    placeholder="A check a juror can verify from the deliverable alone"
                    className="min-w-0 flex-1 basis-60 resize-none bg-transparent outline-none"
                  />
                  <KindToggle kind={c.kind} onChange={(k) => edit(i, { kind: k })} />
                  <span className="inline-flex w-[8.5rem] shrink-0 items-center gap-1.5 rounded-lg border border-rule bg-surface px-2.5 py-1.5 text-xs text-muted">
                    {c.method === "deterministic" ? <Gear size={12} /> : <Spark size={12} />}
                    {c.method === "deterministic" ? "Deterministic" : "AI-judged"}
                  </span>
                  <button type="button" aria-label={`Delete ${c.id}`} onClick={() => update(doc.criteria.filter((_, j) => j !== i))} className="pt-1 text-faint hover:text-bad">
                    <Trash size={16} />
                  </button>
                </div>
                {ruleSummary(c) && (
                  <p className="mt-2 flex items-center gap-2 pl-8">
                    <span aria-hidden className="text-faint">
                      ↳
                    </span>
                    <code className="rounded-md bg-surface px-2 py-1 font-mono text-xs">{ruleSummary(c)}</code>
                  </p>
                )}
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
          <h3 className="display text-[1.6rem]">{invalid ? "Fix before continuing" : "Ready to continue"}</h3>
          <ul className="mt-3 space-y-2">
            {checks.map(([ok, t]) => (
              <li key={t} className="flex items-center gap-2.5">
                {ok ? <Check size={14} /> : <Close size={12} />}
                {t}
              </li>
            ))}
          </ul>
        </Card>

        {doc.unverifiable.length > 0 && (
          <Card>
            <h3 className="display flex items-center gap-2 text-[1.4rem]">
              <Eye size={18} /> Unverifiable · {doc.unverifiable.length}
            </h3>
            <ul className="mt-3 space-y-5">
              {doc.unverifiable.map((u) => (
                <li key={u.original}>
                  <p className="font-semibold">“{u.original}”</p>
                  <p className="mt-1.5 text-muted">{u.reason}</p>
                  {u.replacement && (
                    <button
                      type="button"
                      disabled={doc.criteria.length >= MAX_CRITERIA || doc.criteria.some((c) => c.text === u.replacement)}
                      onClick={() => update([...doc.criteria, { id: nextId(doc.criteria), text: u.replacement!, kind: "SHOULD", method: "llm", rule: null, rationale: `Replaces: ${u.original}`.slice(0, 300) }])}
                      title={u.replacement}
                      className="mt-3 inline-flex max-w-full items-center gap-2 rounded-full border border-ink px-4 py-2 text-left text-sm font-semibold hover:bg-surface-2 disabled:opacity-50"
                    >
                      <Plus size={13} className="shrink-0" /> <span className="truncate">Use replacement: {u.replacement}</span>
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </Card>
        )}

        {doc.ambiguities.length > 0 && (
          <Card>
            <h3 className="display flex items-center gap-2 text-[1.4rem]">
              <Info size={18} /> Questions for you
            </h3>
            <ul className="mt-3 space-y-2 text-muted">
              {doc.ambiguities.map((a) => (
                <li key={a}>{a}</li>
              ))}
            </ul>
          </Card>
        )}

        <Card tone="navy">
          <Eyebrow>Canonical JSON → SHA-256</Eyebrow>
          <p className="mt-2 break-all font-mono text-lime" title={hash ?? undefined}>
            {hash ? `${hash.slice(0, 12)}…${hash.slice(-9)}` : "…"}
          </p>
          <p className="mt-3 text-sm opacity-70">Computed in your browser. Sent to create_job with criteria_kinds [{kindsOf(doc).join(",")}].</p>
        </Card>
      </div>
    </div>
  );
}
