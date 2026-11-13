import type { MappingMethod } from "@juri/shared";

/**
 * Identity mapping market agent → NEAR account (FR-B1), 05 §5.1. Pure.
 *   1. The agent object carries a NEAR account            → mapping_method = api
 *   2. A job awarded to the agent has reward legs to Y     → reward_tx (conflicts kept + flagged)
 *   3. Otherwise                                           → unknown ("Unmapped" in the UI)
 *
 * Market API v2 (phase0 V2): agent objects carry market UUIDs, not NEAR accounts, and awards are
 * private, so today almost every agent ends up `unknown`. The rules still run on what is visible.
 */
export interface AgentForMapping {
  id: string;
  /** A NEAR account found on the agent object itself, if any. */
  api_account: string | null;
}

export interface AwardEvidence {
  agent_id: string;
  market_job_id: string;
  /** Receivers of reward legs linked to this job. */
  reward_to: string[];
}

export interface Identity {
  near_account: string | null;
  mapping_method: MappingMethod;
  /** All accounts seen for this agent; >1 means conflict. */
  candidates: string[];
  conflict: boolean;
}

const NEAR_ACCOUNT = /^(?=.{2,64}$)(([a-z\d]+[-_])*[a-z\d]+\.)*([a-z\d]+[-_])*[a-z\d]+$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isNearAccount(s: unknown): s is string {
  return typeof s === "string" && NEAR_ACCOUNT.test(s) && !UUID.test(s);
}

/** Looks for a NEAR account on a raw market agent object (field names the API might use). */
export function apiAccountFromRaw(raw: unknown): string | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  for (const k of ["near_account_id", "near_account", "account_id", "wallet_account_id", "payout_account_id"]) {
    if (isNearAccount(r[k])) return r[k] as string;
  }
  return null;
}

export function mapIdentities(agents: AgentForMapping[], awards: AwardEvidence[]): Map<string, Identity> {
  const counts = new Map<string, Map<string, number>>();
  for (const a of awards) {
    const m = counts.get(a.agent_id) ?? new Map<string, number>();
    for (const to of a.reward_to) m.set(to, (m.get(to) ?? 0) + 1);
    counts.set(a.agent_id, m);
  }
  const out = new Map<string, Identity>();
  for (const ag of agents) {
    if (ag.api_account) {
      out.set(ag.id, { near_account: ag.api_account, mapping_method: "api", candidates: [ag.api_account], conflict: false });
      continue;
    }
    const m = counts.get(ag.id);
    if (m && m.size > 0) {
      // Most frequent receiver wins; ties broken by account id so the result is deterministic.
      const ranked = [...m.entries()].sort((x, y) => y[1] - x[1] || x[0].localeCompare(y[0]));
      out.set(ag.id, {
        near_account: ranked[0]![0],
        mapping_method: "reward_tx",
        candidates: ranked.map(([acc]) => acc),
        conflict: ranked.length > 1,
      });
      continue;
    }
    out.set(ag.id, { near_account: null, mapping_method: "unknown", candidates: [], conflict: false });
  }
  return out;
}
