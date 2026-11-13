import { describe, expect, it } from "vitest";
import { criteriaMarkdown, validateCriteria, type CriteriaDoc, type Criterion } from "./criteria";
import { duration, formatValue, middle, shortDate } from "./format";

const c = (id: string, kind: "MUST" | "SHOULD", text = "x"): Criterion => ({ id, kind, text, method: "llm", rule: null, rationale: "" });

describe("format", () => {
  it("formats ratios as percentages, keeping precision near 100%", () => {
    expect(formatValue({ value: 0.6413, unit: "ratio" })).toBe("64%");
    expect(formatValue({ value: 0.99516, unit: "ratio" })).toBe("99.52%");
    expect(formatValue({ value: 0.042, unit: "ratio" })).toBe("4.2%");
    expect(formatValue({ value: null, unit: "ratio" })).toBe("–");
    expect(formatValue({ value: 1234, unit: null })).toBe("1,234");
  });
  it("shortens hashes and formats dates and durations", () => {
    expect(middle("344ea38c3142a92cc002d7de20b6edcc")).toBe("344ea3…edcc");
    expect(middle("short")).toBe("short");
    expect(shortDate("2026-11-13T12:37:41Z")).toBe("13 Nov 2026");
    expect(shortDate(null)).toBe("–");
    expect(duration(1800)).toBe("30 min");
    expect(duration(7200)).toBe("2 h");
    expect(duration(3 * 86400)).toBe("3 days");
  });
});

describe("criteria", () => {
  it("needs a MUST besides C0, text on every row and at most 13 rows", () => {
    expect(validateCriteria([c("C0", "MUST"), c("C1", "SHOULD")])).toMatch(/MUST/);
    expect(validateCriteria([c("C0", "MUST"), c("C1", "MUST", " ")])).toMatch(/text/);
    expect(validateCriteria(Array.from({ length: 14 }, (_, i) => c(`C${i}`, "MUST")))).toMatch(/13/);
    expect(validateCriteria([c("C0", "MUST"), c("C1", "MUST")])).toBeNull();
  });
  it("renders Markdown with kinds, unverifiable items and questions", () => {
    const doc: CriteriaDoc = {
      version: "1",
      source: { type: "text", title: "Report" },
      summary: "",
      deliverable_format: "markdown",
      criteria: [c("C0", "MUST", "No instructions to the jury."), { ...c("C1", "SHOULD", "Has Sources."), method: "deterministic", rule: { type: "contains_sections", params: { headings: ["Sources"] } } }],
      unverifiable: [{ original: "Publish on Medium", reason: "Not visible", replacement: "Deliver Markdown" }],
      ambiguities: ["Which sources count?"],
    };
    const md = criteriaMarkdown(doc);
    expect(md).toContain("# Acceptance criteria: Report");
    expect(md).toContain("**C0 · MUST** (AI-judged)");
    expect(md).toContain("**C1 · SHOULD** (Deterministic)");
    expect(md).toContain("→ use instead: Deliver Markdown");
    expect(md).toContain("## Questions for the requester");
  });
});
