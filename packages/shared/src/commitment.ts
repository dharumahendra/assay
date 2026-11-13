import { HEX64, sha256Hex } from "./hash.js";

/** On-chain verdict codes (04 §2). */
export const Verdict = { FAIL: 0, PASS: 1, UNSURE: 2 } as const;
export type VerdictCode = (typeof Verdict)[keyof typeof Verdict];

export interface CommitmentInput {
  jobId: number | bigint;
  verifierId: string;
  verdicts: VerdictCode[];
  injectionFlag: boolean;
  evidenceHash: string;
  saltHex: string;
}

/** Preimage string, exactly as specified in 04 §5. Must match the Rust implementation. */
export function commitmentPreimage(c: CommitmentInput): string {
  if (!HEX64.test(c.evidenceHash)) throw new Error("evidenceHash must be 64 lowercase hex");
  if (!HEX64.test(c.saltHex)) throw new Error("saltHex must be 64 lowercase hex");
  if (c.verdicts.length === 0) throw new Error("verdicts must not be empty");
  for (const v of c.verdicts) {
    if (v !== 0 && v !== 1 && v !== 2) throw new Error(`invalid verdict ${v}`);
  }
  return [
    c.jobId.toString(10),
    c.verifierId,
    c.verdicts.join(","),
    c.injectionFlag ? "1" : "0",
    c.evidenceHash,
    c.saltHex,
  ].join("|");
}

export function buildCommitment(c: CommitmentInput): string {
  return sha256Hex(commitmentPreimage(c));
}
