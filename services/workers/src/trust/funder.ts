import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { REPO_ROOT } from "../db/index.js";
import type { FunderEdge } from "./patterns.js";

/**
 * Shared funder (FR-B5, SHOULD), 05 §5.3: agents whose NEAR accounts were first funded by the same
 * account get a `shared_funder` edge, unless the funder is a known exchange/relayer/system account
 * (data/funder-exclude.json). Pure, except for loading the exclude list.
 */
export interface FunderRow {
  account: string;
  funder: string | null;
  excluded: boolean;
}

export function loadFunderExclude(file = resolve(REPO_ROOT, "data/funder-exclude.json")): Set<string> {
  try {
    const j = JSON.parse(readFileSync(file, "utf8")) as { accounts?: string[] };
    return new Set(j.accounts ?? []);
  } catch {
    return new Set();
  }
}

export function sharedFunderEdges(
  funders: FunderRow[],
  agentsByAccount: Map<string, string[]>,
  exclude: Set<string>,
): FunderEdge[] {
  const byFunder = new Map<string, { agent: string; account: string }[]>();
  for (const f of funders) {
    if (!f.funder || f.excluded || exclude.has(f.funder)) continue;
    for (const agent of agentsByAccount.get(f.account) ?? []) {
      byFunder.set(f.funder, [...(byFunder.get(f.funder) ?? []), { agent, account: f.account }]);
    }
  }
  const edges = new Map<string, FunderEdge>();
  for (const [funder, list] of [...byFunder.entries()].sort((x, y) => x[0].localeCompare(y[0]))) {
    list.sort((x, y) => x.agent.localeCompare(y.agent));
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const x = list[i]!;
        const y = list[j]!;
        if (x.agent === y.agent) continue;
        const key = `${x.agent}\u0000${y.agent}`;
        if (!edges.has(key))
          edges.set(key, {
            a: x.agent,
            b: y.agent,
            type: "shared_funder",
            evidence: { funder, a_account: x.account, b_account: y.account },
          });
      }
    }
  }
  return [...edges.values()];
}
