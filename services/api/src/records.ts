import { KNOWN_TOKENS, marketAgentUrl, marketJobUrl, nearblocksTxUrl, type SourceRecord } from "@juri/shared";

/**
 * Flattens a metric's `sources_json` (whatever shape the metric wrote) into Source drawer records
 * (FR-A5). Known shapes from P1 metrics:
 *   { endpoint, fetched_at }                       → one endpoint record
 *   { deposit_txs: [hash], refund_txs: [hash] }    → tx records
 *   { agent_ids: [uuid] }                          → agent records
 *   { top10: [{agent_id, handle, ...}] }           → agent records
 *   { agents: [{agent_id, ...}] }                  → agent records
 *   { by_token: {token: {deposit, refund, …}} }    → one value record per token (M2)
 *   { endpoint, …, last_success_tx }               → endpoint record + tx record (M6)
 * Unknown shapes still render: scalars become `value` records.
 */
const TX_HASH = /^[1-9A-HJ-NP-Za-km-z]{43,44}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Handles = Map<string, string>;

function fromString(group: string, s: string, handles: Handles): SourceRecord {
  if (TX_HASH.test(s)) return { group, kind: "tx", id: s, label: null, url: nearblocksTxUrl(s), extra: null };
  if (UUID.test(s)) {
    const h = handles.get(s) ?? null;
    return { group, kind: "agent", id: s, label: h, url: h ? marketAgentUrl(h) : null, extra: null };
  }
  return { group, kind: "value", id: s, label: null, url: null, extra: null };
}

function fromObject(group: string, o: Record<string, unknown>, handles: Handles): SourceRecord {
  const { agent_id, tx_hash, job_id, handle, ...rest } = o;
  const extra = Object.keys(rest).length ? rest : null;
  if (typeof tx_hash === "string")
    return { group, kind: "tx", id: tx_hash, label: null, url: nearblocksTxUrl(tx_hash), extra };
  if (typeof agent_id === "string") {
    const h = typeof handle === "string" ? handle : (handles.get(agent_id) ?? null);
    return { group, kind: "agent", id: agent_id, label: h, url: h ? marketAgentUrl(h) : null, extra };
  }
  if (typeof job_id === "string") return { group, kind: "job", id: job_id, label: null, url: marketJobUrl(job_id), extra };
  return { group, kind: "value", id: JSON.stringify(o).slice(0, 120), label: null, url: null, extra: o };
}

export function flattenSources(sources: unknown, handles: Handles = new Map()): SourceRecord[] {
  if (sources === null || sources === undefined) return [];
  if (typeof sources !== "object" || Array.isArray(sources)) {
    const arr = Array.isArray(sources) ? sources : [sources];
    return arr.flatMap((v) => flattenItem("sources", v, handles));
  }
  const s = sources as Record<string, unknown>;
  const out: SourceRecord[] = [];
  if (typeof s.endpoint === "string") {
    const { endpoint, ...extra } = s;
    out.push({ group: "endpoint", kind: "endpoint", id: endpoint, label: null, url: null, extra: Object.keys(extra).length ? extra : null });
    // Tx hashes named next to an endpoint (e.g. M6 last_success_tx) stay clickable.
    for (const [k, v] of Object.entries(extra)) if (typeof v === "string" && TX_HASH.test(v)) out.push(fromString(k, v, handles));
    return out;
  }
  for (const [group, v] of Object.entries(s)) {
    if (Array.isArray(v)) for (const item of v) out.push(...flattenItem(group, item, handles));
    else if (isRecordMap(v)) out.push(...fromRecordMap(group, v));
    else out.push(...flattenItem(group, v, handles));
  }
  return out;
}

/** `{ key: {…}, key2: {…} }`, e.g. M2 `by_token` → one value record per key. */
function isRecordMap(v: unknown): v is Record<string, Record<string, unknown>> {
  if (typeof v !== "object" || v === null || Array.isArray(v)) return false;
  const vals = Object.values(v);
  return vals.length > 0 && vals.every((x) => typeof x === "object" && x !== null && !Array.isArray(x));
}

function fromRecordMap(group: string, m: Record<string, Record<string, unknown>>): SourceRecord[] {
  return Object.entries(m).map(([key, extra]) => ({
    group,
    kind: "value" as const,
    id: key,
    label: KNOWN_TOKENS[key]?.symbol ?? null,
    url: null,
    extra: KNOWN_TOKENS[key] ? { ...extra, decimals: KNOWN_TOKENS[key]!.decimals } : extra,
  }));
}

function flattenItem(group: string, v: unknown, handles: Handles): SourceRecord[] {
  if (v === null || v === undefined) return [];
  if (typeof v === "string") return [fromString(group, v, handles)];
  if (typeof v === "number" || typeof v === "boolean")
    return [{ group, kind: "value", id: String(v), label: null, url: null, extra: null }];
  if (typeof v === "object" && !Array.isArray(v)) return [fromObject(group, v as Record<string, unknown>, handles)];
  return [{ group, kind: "value", id: JSON.stringify(v).slice(0, 120), label: null, url: null, extra: null }];
}
