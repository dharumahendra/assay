import { C0 } from "@juri/shared";

/** A minimal valid CriteriaDoc v1 for API tests (POST /api/blobs validates criteria). */
export const CRITERIA_DOC = {
  version: "1",
  source: { type: "demo", market_job_id: null, title: "API test" },
  summary: "",
  deliverable_format: "markdown",
  criteria: [
    C0,
    { id: "C1", text: "At least 10 words.", kind: "MUST", method: "deterministic", rule: { type: "min_words", params: { n: 10 } }, rationale: "" },
  ],
  unverifiable: [],
  ambiguities: [],
};
