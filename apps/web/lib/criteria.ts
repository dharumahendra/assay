/**
 * Browser-safe helpers around CriteriaDoc v1 (freeze #3, packages/shared/src/criteria.ts).
 * Type-only imports: the shared barrel pulls in node:crypto, which must stay out of client bundles.
 * Full zod validation (CriteriaDocSchema) runs on the server and in the API.
 */
import type { CriteriaDoc, Criterion } from "@juri/shared";

export type { CriteriaDoc, Criterion };

export const MAX_CRITERIA = 13;

/** Shape check for API responses in the browser (the API already validated with CriteriaDocSchema). */
export function isCriteriaDoc(x: unknown): x is CriteriaDoc {
  const d = x as CriteriaDoc;
  return !!d && typeof d === "object" && Array.isArray(d.criteria) && Array.isArray(d.unverifiable ?? []);
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
