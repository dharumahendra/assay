import { C0, CriteriaDocSchema, RuleSchema, type CriteriaDoc } from "@juri/shared";
import { z } from "zod";
import { extractJson } from "./json.js";
import { MAX_TOKENS, type JudgeProvider } from "./providers.js";

/** Spec Compiler (05 §6, FR-C1–C3, FR-C5). */

export const COMPILER_SYSTEM = `You turn a job description written for AI agents into acceptance criteria that an
independent verifier can check using ONLY the delivered artifact.
Rules:
- 3 to 12 criteria. Mark MUST only if failing it makes the deliverable unusable for the stated goal.
- Prefer deterministic checks (word counts, required sections, links, formats) and give a rule.
- Anything requiring outside access or future events (publishing, followers, deployments
  the verifier cannot see) goes to "unverifiable" with a verifiable replacement.
- List genuine ambiguities as questions for the requester.
- Each criterion must cite the part of the job text it comes from in "rationale" (≤20 words).
- Output JSON only, matching the provided schema. No prose.`;

/** What the model returns; Juri assigns ids C1.. and prepends C0. */
const ModelCriterion = z.object({
  text: z.string().min(1).max(500),
  kind: z.enum(["MUST", "SHOULD"]),
  method: z.enum(["llm", "deterministic"]),
  rule: RuleSchema.nullable().default(null),
  rationale: z.string().max(300).default(""),
});
export const CompilerOutputSchema = z.object({
  summary: z.string().max(300).default(""),
  deliverable_format: z.enum(["markdown", "json", "csv", "url", "other"]).default("markdown"),
  criteria: z.array(ModelCriterion).min(3).max(12),
  unverifiable: z
    .array(z.object({ original: z.string().max(500), reason: z.string().max(300), replacement: z.string().max(500).nullable().default(null) }))
    .max(20)
    .default([]),
  ambiguities: z.array(z.string().max(300)).max(20).default([]),
});

export const COMPILER_JSON_SCHEMA = {
  type: "object",
  required: ["summary", "deliverable_format", "criteria", "unverifiable", "ambiguities"],
  properties: {
    summary: { type: "string", maxLength: 300 },
    deliverable_format: { enum: ["markdown", "json", "csv", "url", "other"] },
    criteria: {
      type: "array",
      minItems: 3,
      maxItems: 12,
      items: {
        type: "object",
        required: ["text", "kind", "method", "rule", "rationale"],
        properties: {
          text: { type: "string", maxLength: 500 },
          kind: { enum: ["MUST", "SHOULD"] },
          method: { enum: ["llm", "deterministic"] },
          rule: {
            description:
              "null for method=llm. Otherwise one of: {type:min_words|max_words, params:{n}}, {type:contains_sections, params:{headings:[...]}}, {type:regex, params:{pattern, flags, min_matches}}, {type:contains_links, params:{min}}, {type:url_reachable, params:{which:all_links|first_link}}, {type:format_is, params:{format:markdown|json|csv}}",
          },
          rationale: { type: "string", maxLength: 120 },
        },
      },
    },
    unverifiable: { type: "array", items: { type: "object", required: ["original", "reason", "replacement"] } },
    ambiguities: { type: "array", items: { type: "string" } },
  },
} as const;

export interface JobInput {
  title: string;
  description: string;
  tags?: string[];
  budget?: string | null;
  market_job_id?: string | null;
}

export class CompileError extends Error {
  constructor(
    message: string,
    readonly attempts: number,
    readonly issues: string[],
  ) {
    super(message);
  }
}

export const compilerUserMessage = (job: JobInput) =>
  [
    `Title: ${job.title}`,
    job.tags?.length ? `Tags: ${job.tags.join(", ")}` : null,
    job.budget ? `Budget: ${job.budget}` : null,
    "Description:",
    job.description,
    "",
    "JSON schema for your answer:",
    JSON.stringify(COMPILER_JSON_SCHEMA),
  ]
    .filter((l) => l !== null)
    .join("\n");

/** Model output → CriteriaDoc v1 with C0 prepended; throws a list of issues when invalid. */
export function toCriteriaDoc(raw: unknown, job: JobInput): CriteriaDoc {
  const out = CompilerOutputSchema.parse(raw);
  const doc = {
    version: "1" as const,
    source: job.market_job_id
      ? { type: "market_job" as const, market_job_id: job.market_job_id, title: job.title.slice(0, 300) }
      : { type: "text" as const, market_job_id: null, title: job.title.slice(0, 300) },
    summary: out.summary,
    deliverable_format: out.deliverable_format,
    criteria: [
      C0,
      ...out.criteria
        // the model may restate the integrity criterion; C0 already covers it
        .filter((c) => !/instructions? (addressed|directed) to (evaluators|judges|ai)/i.test(c.text))
        .map((c, i) => ({ ...c, id: `C${i + 1}`, rule: c.method === "deterministic" ? c.rule : null, method: c.method === "deterministic" && !c.rule ? ("llm" as const) : c.method })),
    ],
    unverifiable: out.unverifiable,
    ambiguities: out.ambiguities,
  };
  return CriteriaDocSchema.parse(doc);
}

const issuesOf = (e: unknown): string[] =>
  e instanceof z.ZodError ? e.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`) : [e instanceof Error ? e.message : String(e)];

/** Temperature 0.2, max_tokens 1500; one retry with the validation errors; then CompileError (→ 422). */
export async function compileCriteria(job: JobInput, provider: JudgeProvider): Promise<{ doc: CriteriaDoc; attempts: number }> {
  let user = compilerUserMessage(job);
  let issues: string[] = [];
  for (let attempt = 1; attempt <= 2; attempt++) {
    const r = await provider.complete({ system: COMPILER_SYSTEM, user, jsonSchema: COMPILER_JSON_SCHEMA, maxTokens: MAX_TOKENS, temperature: 0.2 });
    try {
      return { doc: toCriteriaDoc(extractJson(r.text), job), attempts: attempt };
    } catch (e) {
      issues = issuesOf(e);
      user = `${compilerUserMessage(job)}\n\nYour previous answer was invalid:\n- ${issues.slice(0, 10).join("\n- ")}\nReturn corrected JSON only.`;
    }
  }
  throw new CompileError("compiler output failed validation twice", 2, issues);
}
