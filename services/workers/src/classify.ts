import type { TransferKind } from "./db/schema.js";

/**
 * Heuristic `kind` for decoded escrow legs (05 §3.2 rule 2, re-derived from observed data,
 * see docs/phase0-findings.md §Escrow flows). Pure; legs must be passed oldest first.
 *
 *   to ∈ escrow ids, from ∈ operator accounts                → internal (operator funds the escrow)
 *   to ∈ escrow ids                                          → deposit
 *   from ∈ escrow ids, and
 *     to ∈ fee accounts                                      → fee
 *     tx pays ≥2 legs of one token and this leg is ≤3%        → fee      (2% era: fee leg to operator wallet)
 *     to ∈ operator accounts                                 → internal (role of that wallet is inferred, so
 *                                                                        these flows stay out of M2 / rewards)
 *     to = a depositor with an outstanding deposit of the
 *          exact same token+amount                           → refund   (consumes that deposit)
 *     otherwise                                              → reward
 *   escrow on neither side (escrow only relayed)             → relay
 */
export interface ClassifyConfig {
  escrowIds: Set<string>;
  feeAccounts: Set<string>;
  operatorAccounts: Set<string>;
  /** A leg at or below this share of its tx's same-token payout total counts as a fee. */
  feeShareMax: number;
}

export interface LegForClass {
  id: string;
  txHash: string;
  from: string;
  to: string | null;
  token: string;
  amount: string;
}

/** Observed 2026-02..05: deposits on behalf of requesters, 2% fee legs, leftover returns. */
export const OBSERVED_OPERATOR_WALLET = "5cdaee04aeec7abf076fd197411ffab6b08cf7aaefba14b57f6fc5fbececc3c8";

export function defaultClassifyConfig(env = process.env): ClassifyConfig {
  const list = (v: string | undefined, d: string[]) =>
    new Set((v !== undefined ? v.split(",") : d).map((s) => s.trim()).filter(Boolean));
  return {
    escrowIds: list(env.ESCROW_INTENT_IDS, ["escrow.ai.near"]),
    feeAccounts: list(env.ESCROW_FEE_ACCOUNTS, ["treasury.ai.near"]),
    operatorAccounts: list(env.ESCROW_OPERATOR_ACCOUNTS, [OBSERVED_OPERATOR_WALLET]),
    feeShareMax: 0.03,
  };
}

const big = (s: string) => {
  try {
    return BigInt(s);
  } catch {
    return 0n;
  }
};

export function classifyLegs(legs: LegForClass[], cfg: ClassifyConfig): Map<string, TransferKind> {
  // Same-token payout totals per tx, and how many payout legs it has.
  const payout = new Map<string, { total: bigint; n: number }>();
  for (const l of legs) {
    if (!cfg.escrowIds.has(l.from) || (l.to && cfg.escrowIds.has(l.to))) continue;
    const k = `${l.txHash}|${l.token}`;
    const p = payout.get(k) ?? { total: 0n, n: 0 };
    p.total += big(l.amount);
    p.n++;
    payout.set(k, p);
  }
  const outstanding = new Map<string, number>(); // `${account}|${token}|${amount}` → count
  const out = new Map<string, TransferKind>();
  for (const l of legs) {
    let kind: TransferKind;
    if (l.to && cfg.escrowIds.has(l.to) && cfg.operatorAccounts.has(l.from)) {
      kind = "internal";
    } else if (l.to && cfg.escrowIds.has(l.to)) {
      kind = "deposit";
      const k = `${l.from}|${l.token}|${l.amount}`;
      outstanding.set(k, (outstanding.get(k) ?? 0) + 1);
    } else if (cfg.escrowIds.has(l.from)) {
      const p = payout.get(`${l.txHash}|${l.token}`);
      const share = p && p.total > 0n ? Number((big(l.amount) * 10_000n) / p.total) / 10_000 : 1;
      const dk = `${l.to}|${l.token}|${l.amount}`;
      if (!l.to) kind = "unknown";
      else if (cfg.feeAccounts.has(l.to)) kind = "fee";
      else if (p && p.n >= 2 && share <= cfg.feeShareMax) kind = "fee";
      else if (cfg.operatorAccounts.has(l.to)) kind = "internal";
      else if ((outstanding.get(dk) ?? 0) > 0) {
        kind = "refund";
        outstanding.set(dk, outstanding.get(dk)! - 1);
      } else kind = "reward";
    } else {
      kind = "relay";
    }
    out.set(l.id, kind);
  }
  return out;
}
