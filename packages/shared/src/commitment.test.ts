import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildCommitment, commitmentPreimage, type VerdictCode } from "./commitment.js";

/** Same file is read by the Rust unit test `commitment_vectors` in contracts/juri. */
const { vectors } = JSON.parse(readFileSync(new URL("./commitment-vectors.json", import.meta.url), "utf8")) as {
  vectors: {
    job_id: number;
    verifier_id: string;
    verdicts: VerdictCode[];
    injection_flag: boolean;
    evidence_hash: string;
    salt_hex: string;
    preimage: string;
    commitment: string;
  }[];
};

describe("shared commitment vectors (TS ↔ Rust)", () => {
  it.each(vectors)("job $job_id / $verifier_id", (v) => {
    const input = {
      jobId: v.job_id,
      verifierId: v.verifier_id,
      verdicts: v.verdicts,
      injectionFlag: v.injection_flag,
      evidenceHash: v.evidence_hash,
      saltHex: v.salt_hex,
    };
    expect(commitmentPreimage(input)).toBe(v.preimage);
    expect(buildCommitment(input)).toBe(v.commitment);
  });
});
