import type { CriteriaDoc, Fact, Rule } from "@juri/shared";
import { safeFetch, type SafeFetchOptions } from "./ssrf.js";

/**
 * Deterministic rule engine (05 §6.2, FR-C2). Rule results replace LLM verdicts for
 * `method = deterministic` criteria, so those criteria cannot be swayed by prompt injection.
 */

export const countWords = (text: string): number => (text.match(/[\p{L}\p{N}][\p{L}\p{N}'’_-]*/gu) ?? []).length;

export const markdownHeadings = (text: string): string[] =>
  [...text.matchAll(/^ {0,3}#{1,6}[ \t]+(.+?)[ \t#]*$/gm)].map((m) => normalize(m[1]!));

const normalize = (s: string) =>
  s
    .toLowerCase()
    .replace(/[*_`[\]()]/g, "")
    .replace(/^\d+(\.\d+)*[.)]?\s+/, "")
    .replace(/\s+/g, " ")
    .trim();

export const extractLinks = (text: string): string[] => [
  ...new Set((text.match(/https?:\/\/[^\s<>()[\]"'`]+/g) ?? []).map((u) => u.replace(/[.,;:!?]+$/, ""))),
];

function parsesAs(format: "markdown" | "json" | "csv", text: string): { ok: boolean; detail: string } {
  const t = text.trim();
  if (!t) return { ok: false, detail: "empty" };
  if (format === "json") {
    try {
      JSON.parse(t);
      return { ok: true, detail: "valid JSON" };
    } catch (e) {
      return { ok: false, detail: e instanceof Error ? e.message.slice(0, 120) : "invalid JSON" };
    }
  }
  if (format === "csv") {
    const rows = t.split(/\r?\n/).filter((l) => l.trim());
    const cols = rows.map((r) => r.replace(/"([^"]|"")*"/g, "x").split(",").length);
    const ok = rows.length >= 2 && cols[0]! >= 2 && cols.every((c) => c === cols[0]);
    return { ok, detail: `${rows.length} rows, columns ${[...new Set(cols)].join("/")}` };
  }
  // markdown: plain text that is not a JSON document and has some structure or prose
  let isJson = false;
  try {
    JSON.parse(t);
    isJson = /^[[{]/.test(t);
  } catch {
    /* not JSON */
  }
  const ok = !isJson && (markdownHeadings(t).length > 0 || countWords(t) >= 20);
  return { ok, detail: `${markdownHeadings(t).length} headings, ${countWords(t)} words` };
}

export interface RuleContext {
  /** Fetch options for url_reachable (SSRF guard always applies). */
  fetch?: SafeFetchOptions;
  maxLinksChecked?: number;
}

export async function runRule(rule: Rule, text: string, ctx: RuleContext = {}): Promise<Fact> {
  switch (rule.type) {
    case "min_words":
    case "max_words": {
      const n = countWords(text);
      return { rule: rule.type, value: n, pass: rule.type === "min_words" ? n >= rule.params.n : n <= rule.params.n };
    }
    case "contains_sections": {
      const hs = markdownHeadings(text);
      const missing = rule.params.headings.filter((h) => !hs.some((x) => x.includes(normalize(h))));
      return { rule: rule.type, value: { found: hs.slice(0, 40), missing }, pass: missing.length === 0 };
    }
    case "regex": {
      let re: RegExp;
      try {
        re = new RegExp(rule.params.pattern, `${rule.params.flags.replace(/g/g, "")}g`);
      } catch (e) {
        return { rule: rule.type, value: null, pass: false, error: `invalid regex: ${e instanceof Error ? e.message : e}` };
      }
      const n = [...text.slice(0, 50_000).matchAll(re)].length;
      return { rule: rule.type, value: n, pass: n >= rule.params.min_matches };
    }
    case "contains_links": {
      const n = extractLinks(text).length;
      return { rule: rule.type, value: n, pass: n >= rule.params.min };
    }
    case "url_reachable": {
      const links = extractLinks(text);
      const targets = (rule.params.which === "first_link" ? links.slice(0, 1) : links).slice(0, ctx.maxLinksChecked ?? 10);
      if (!targets.length) return { rule: rule.type, value: { checked: [] }, pass: false, error: "no links" };
      const checked = await Promise.all(
        targets.map(async (url) => {
          try {
            const r = await safeFetch(url, { timeoutMs: 6_000, maxChars: 1_000, ...ctx.fetch });
            return { url, status: r.status, ok: r.status >= 200 && r.status < 400 };
          } catch (e) {
            return { url, status: null, ok: false, error: e instanceof Error ? e.message.slice(0, 120) : String(e) };
          }
        }),
      );
      return { rule: rule.type, value: { checked, skipped: Math.max(0, links.length - targets.length) }, pass: checked.every((c) => c.ok) };
    }
    case "format_is": {
      const r = parsesAs(rule.params.format, text);
      return { rule: rule.type, value: r.detail, pass: r.ok };
    }
  }
}

/** Facts for every deterministic criterion, keyed by criterion id. */
export async function runRules(doc: CriteriaDoc, text: string, ctx: RuleContext = {}): Promise<Record<string, Fact>> {
  const out: Record<string, Fact> = {};
  for (const c of doc.criteria) if (c.method === "deterministic" && c.rule) out[c.id] = await runRule(c.rule, text, ctx);
  return out;
}
