import { judge, prepareFacts } from "@juri/jury";
import { canonicalHash, CriteriaDocSchema, sha256Hex } from "@juri/shared";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { REPO_ROOT } from "./db/index.js";
import { replayProvider, type ReplayCase } from "./e2e-replay.js";

const EVAL = join(REPO_ROOT, "eval");
const load = (id: string) => ({
  doc: CriteriaDocSchema.parse(JSON.parse(readFileSync(join(EVAL, "cases", id, "criteria.json"), "utf8"))),
  deliverable: readFileSync(join(EVAL, "cases", id, "deliverable.md"), "utf8"),
});
const IDS = ["j1-economics-V1", "j1-economics-V5"];
const cases: ReplayCase[] = IDS.map((id) => ({ id, deliverable: load(id).deliverable }));

// Same call the runner makes (jury-runner.ts tick): real juror account, random nonce, facts from prepareFacts.
async function runnerJudge(id: string, verifier: string, deliverable = load(id).deliverable) {
  const { doc } = load(id);
  const { facts, prescan } = await prepareFacts(doc, deliverable);
  return judge({
    jobId: 7,
    verifier,
    provider: replayProvider(join(EVAL, "recorded"), cases, verifier),
    doc,
    criteriaHash: canonicalHash(doc),
    deliverable,
    deliverableHash: sha256Hex(deliverable),
    facts,
    prescan,
    jurySize: 3,
  });
}

describe("replayProvider (RECORDED juror for the e2e)", () => {
  it("replays the eval recordings for the runner's prompt", async () => {
    for (const v of ["v1", "v2", "v3"]) {
      const good = await runnerJudge("j1-economics-V1", `${v}.juri.sandbox`);
      expect(good.evidence.error).toBeNull();
      expect(good.injectionFlag).toBe(false);
      const inj = await runnerJudge("j1-economics-V5", `${v}.juri.sandbox`);
      expect(inj.evidence.error).toBeNull();
      expect(inj.injectionFlag).toBe(true);
    }
  });

  it("refuses a deliverable that was not recorded", async () => {
    const r = await runnerJudge("j1-economics-V1", "v1.juri.sandbox", `${load("j1-economics-V1").deliverable}\nextra line\n`);
    expect(r.evidence.error).toMatch(/not one of the recorded cases/);
  });
});
