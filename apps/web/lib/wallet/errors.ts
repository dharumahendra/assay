/**
 * Contract error codes (contracts/juri/src/types.rs E01–E23) and wallet failures → plain messages (T6.6).
 */

export interface FriendlyError {
  code: string | null;
  title: string;
  detail: string;
  /** The user closed or rejected the wallet prompt: nothing happened on chain. */
  cancelled?: boolean;
}

const CONTRACT: Record<string, [string, string]> = {
  E01: ["Only the contract owner can do this.", "This action is reserved for the Assay operator account."],
  E02: ["Only the requester can do this.", "Connect the account that funded this job."],
  E03: ["Only the assigned worker can submit.", "Connect the worker account named on this job."],
  E04: ["This account is not on the jury for this job.", "Jurors are drawn when the work is submitted."],
  E05: ["The job is no longer in a state that allows this.", "Someone may have acted on it already. Reload the job to see its current status."],
  E06: ["The deadline has passed.", "The window for this action closed. Reload to see what can still be done."],
  E07: ["It is too early for this.", "The deadline has not been reached yet. Try again after it passes."],
  E08: ["This juror already committed a vote.", "Each juror commits once per round."],
  E09: ["No vote was committed for this juror.", "A juror must commit before revealing."],
  E10: ["The revealed vote does not match the commitment.", "The verdicts or salt differ from what was committed."],
  E11: ["The criteria are not valid for the contract.", "Use 1–13 criteria, each MUST or SHOULD, with at least one MUST."],
  E12: ["The verdicts are not valid.", "There must be one PASS, FAIL or UNSURE per criterion."],
  E13: ["The deposit is too small.", "The escrow must cover the minimum amount plus the storage cost of the job. Increase the amount."],
  E14: ["Not enough active verifiers to form a jury.", "The jury pool is below the jury size. Try again later."],
  E15: ["A value is out of range.", "Check the deadline (1 minute to 30 days) and the payout settings."],
  E16: ["Nothing to withdraw.", "This account has no claimable balance in the contract right now."],
  E17: ["A hash is malformed.", "Hashes must be 64 lowercase hex characters. Re-upload the criteria and retry."],
  E18: ["A text field is too long.", "A URI or market job id exceeds the contract's limit."],
  E19: ["The worker can't be the requester.", "Pick a different worker account than the one paying."],
  E20: ["This verifier is already registered.", ""],
  E21: ["This juror already revealed.", ""],
  E22: ["The job does not exist.", "Check the job id."],
  E23: ["The verifier was not found.", ""],
};

const text = (e: unknown): string => {
  if (typeof e === "string") return e;
  if (e instanceof Error) return `${e.message} ${typeof e.cause === "string" ? e.cause : ""}`;
  try {
    return JSON.stringify(e);
  } catch {
    return String(e);
  }
};

export function explainError(e: unknown): FriendlyError {
  const s = text(e);
  const m = s.match(/\b(E\d{2}):/);
  if (m && CONTRACT[m[1]!]) {
    const [title, detail] = CONTRACT[m[1]!]!;
    return { code: m[1]!, title, detail };
  }
  if (/reject|cancel|denied|closed|User (?:rejected|cancelled)|Wallet closed/i.test(s))
    return { code: "cancelled", title: "You cancelled in the wallet.", detail: "Nothing was signed and no funds moved.", cancelled: true };
  if (/NotEnoughBalance|LackBalanceForState|insufficient/i.test(s))
    return { code: "balance", title: "The wallet balance is too low.", detail: "Top up the account to cover the amount, storage and gas, then retry." };
  if (/Exceeded the prepaid gas|GasExceeded/i.test(s)) return { code: "gas", title: "The transaction ran out of gas.", detail: "Retry; if it keeps failing, report it." };
  if (/not signed in|No account|wallet is not/i.test(s)) return { code: "no_wallet", title: "Connect a wallet first.", detail: "" };
  if (/RPC|fetch|network|timeout|Timeout/i.test(s))
    return { code: "rpc", title: "The NEAR network could not be reached.", detail: "The transaction may still go through. Check the explorer before retrying." };
  return { code: null, title: "The transaction failed.", detail: s.slice(0, 240) };
}
