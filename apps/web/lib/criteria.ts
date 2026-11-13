/**
 * CriteriaDoc v1 (docs/05 §6.1). Local shape until P4 publishes the frozen schema in
 * @juri/shared (criteria.ts); then this file re-exports that one.
 */
export type CriterionKind = "MUST" | "SHOULD";

export interface Criterion {
  id: string;
  text: string;
  kind: CriterionKind;
  method: "llm" | "deterministic";
  rule: { type: string; params: Record<string, unknown> } | null;
  rationale?: string | null;
}

export interface CriteriaDoc {
  version: string;
  source?: { type: string; market_job_id?: string | null; title?: string | null };
  summary?: string | null;
  deliverable_format?: string | null;
  criteria: Criterion[];
  unverifiable: { original: string; reason: string; replacement: string | null }[];
  ambiguities: string[];
}

export const MAX_CRITERIA = 13;

export function isCriteriaDoc(x: unknown): x is CriteriaDoc {
  const d = x as CriteriaDoc;
  return !!d && typeof d === "object" && Array.isArray(d.criteria);
}

/** "At most 13 criteria; at least one MUST besides C0" (07 §2.8 step 2). */
export function validateCriteria(c: Criterion[]): string | null {
  if (c.length > MAX_CRITERIA) return `Use at most ${MAX_CRITERIA} criteria.`;
  if (!c.some((x) => x.kind === "MUST" && x.id !== "C0")) return "Add at least one MUST criterion besides C0.";
  if (c.some((x) => !x.text.trim())) return "Every criterion needs text.";
  return null;
}

export function criteriaMarkdown(d: CriteriaDoc): string {
  const lines = [`# Acceptance criteria${d.source?.title ? `: ${d.source.title}` : ""}`, ""];
  if (d.summary) lines.push(d.summary, "");
  for (const c of d.criteria)
    lines.push(`- **${c.id} · ${c.kind}** (${c.method === "deterministic" ? "Deterministic" : "AI-judged"}): ${c.text}`);
  if (d.unverifiable.length) {
    lines.push("", "## Unverifiable", "");
    for (const u of d.unverifiable) lines.push(`- ${u.original}: ${u.reason}${u.replacement ? ` → use instead: ${u.replacement}` : ""}`);
  }
  if (d.ambiguities.length) {
    lines.push("", "## Questions for the requester", "");
    for (const a of d.ambiguities) lines.push(`- ${a}`);
  }
  return `${lines.join("\n")}\n`;
}
