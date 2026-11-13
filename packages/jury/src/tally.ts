import type { CriteriaDoc, Outcome, VerdictCode } from "@juri/shared";

/**
 * Off-chain mirror of the contract tally outcome (contracts/juri/src/tally.rs, 04 §7) for the eval:
 * PASS per criterion iff #PASS ≥ majority; any MUST not passed → Refunded; else Released
 * (Split only in partial payout mode, which the eval does not use).
 */
export function tallyOutcome(kinds: CriteriaDoc["criteria"][number]["kind"][], reveals: VerdictCode[][], jurySize = reveals.length): { result: number[]; outcome: Outcome } | null {
  const maj = Math.floor(jurySize / 2) + 1;
  if (reveals.length < maj) return null;
  const result = kinds.map((_, i) => (reveals.filter((r) => r[i] === 1).length >= maj ? 1 : 0));
  const mustOk = kinds.every((k, i) => k !== "MUST" || result[i] === 1);
  return { result, outcome: mustOk ? "Released" : "Refunded" };
}

/** Single-model outcome (one verifier deciding alone). */
export const singleOutcome = (kinds: CriteriaDoc["criteria"][number]["kind"][], verdicts: VerdictCode[]): Outcome =>
  kinds.every((k, i) => k !== "MUST" || verdicts[i] === 1) ? "Released" : "Refunded";
