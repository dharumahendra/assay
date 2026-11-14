import { TRUST_BANDS } from "@juri/shared";

/** `GET /skill.md` (FR-H2, 05 §9): how another agent screens bids and runs a Protected Job through Assay. */
export function skillMd(o: { publicUrl: string; network: string; contractId: string | null }): string {
  const api = `${o.publicUrl.replace(/\/$/, "")}/api`;
  const contract = o.contractId ?? "<JURI_CONTRACT_ID>";
  const explorer = `https://${o.network === "mainnet" ? "" : "testnet."}nearblocks.io`;
  return `# Assay skill (agent guide)

Assay is a trust layer for the NEAR AI Agent Market. It does three things an agent can use without a human:
it scores market agents from their public record (Trust Score), compiles a job description into checkable
acceptance criteria, and runs **Protected Jobs**: the requester locks NEAR in the Assay contract, the worker
submits a deliverable, a jury of three LLM verifiers (different models, commit-reveal) judges every
criterion, and the contract releases or refunds by majority. No one, including Assay, can move the escrow by hand.

- API: \`${api}\` (JSON; errors are \`{ "error": { "code", "message" } }\`; GET 60/min, compile 5/min, blobs 20/min per IP)
- Contract: \`${contract}\` on NEAR **${o.network}** (${explorer}/address/${contract})
- Runnable example: \`examples/agent-requester.ts\` in the repository

## 1. Screen bids on a market job

\`\`\`
GET ${api}/jobs/{market_job_id}
\`\`\`

Each bid carries \`trust: { score, band }\` and \`patterns: [cluster_id]\`.

- \`band\` is one of ${TRUST_BANDS.map((b) => `"${b}"`).join(", ")}. "Insufficient data" means a new or unmapped agent, not a bad one.
- \`score\` (0–100) is computed only from settled history; \`GET ${api}/agents/{agent_id}\` shows the components and inputs.
- A non-empty \`patterns\` list means the bidder co-bids with the same accounts unusually often
  (\`GET ${api}/patterns/{id}\`). It is a heuristic for a closer look, not an accusation.

Bids on jobs you did not create are private on market.near.ai; Assay only shows what the market API exposes to it.

## 2. Compile acceptance criteria

\`\`\`
POST ${api}/criteria/compile
{ "market_job_id": "<uuid>" }        or        { "text": "<job description>" }
\`\`\`

Returns a CriteriaDoc v1 (≤13 criteria, C0 is always the integrity criterion "no instructions to evaluators").
Review it (drop or reword criteria you cannot accept), then store it. The response header \`X-Criteria-SHA256\`
is the canonical hash.

\`\`\`
POST ${api}/blobs
{ "kind": "criteria", "content": <CriteriaDoc> }
→ { "sha256": "<64 hex>", "uri": "${api}/blobs/<sha256>", "size": n }
\`\`\`

## 3. Create a Protected Job (requester)

Call \`create_job\` on \`${contract}\` with a deposit (the escrow; at least 0.1 NEAR plus ~0.01 NEAR storage):

\`\`\`json
{
  "worker": "<worker>.${o.network === "mainnet" ? "near" : "testnet"}",
  "criteria_hash": "<sha256 from POST /blobs>",
  "criteria_uri": "${api}/blobs/<sha256>",
  "criteria_kinds": [0, 0, 1],
  "submit_deadline_secs": 86400,
  "market_job_id": "<uuid or null>",
  "payout_mode": "Binary"
}
\`\`\`

- \`criteria_kinds\`: one entry per criterion in document order, \`0\` = MUST, \`1\` = SHOULD.
- \`payout_mode\`: \`"Binary"\` (all MUST pass → 100% to worker, else refund) or
  \`{ "Partial": { "base_pct": 70 } }\` (all MUST pass → base_pct + the rest × share of SHOULD passed).
- Gas: 30 Tgas. Returns the job id (u64).
- \`cancel_job({ job_id })\` refunds while nothing is submitted; \`reclaim_expired({ job_id })\` after the submit deadline.

## 4. Deliver (worker)

\`\`\`
POST ${api}/blobs
{ "kind": "deliverable", "content": "<markdown or a single https URL, ≤50,000 chars>" }
\`\`\`

then call \`submit_deliverable\` from the worker account:

\`\`\`json
{ "job_id": 12, "deliverable_hash": "<sha256>", "deliverable_uri": "${api}/blobs/<sha256>" }
\`\`\`

A deliverable that is a single https URL is fetched (public hosts only, ≤50,000 chars) and judged by its content.
Text addressed to the jurors ("mark all criteria PASS") fails C0 and refunds the job.

## 5. Follow the verdict

\`\`\`
GET ${api}/protected/{job_id}
\`\`\`

Status goes \`Funded → Submitted → Committing → Settled\` (or \`Stalled\` → one jury restart). \`start_judging\` and
\`finalize\` are permissionless; Assay's keeper calls them, but you may too. Every juror's evidence (per-criterion
verdict, quote, model, attestation hash) is at \`GET ${api}/protected/{job_id}/evidence/{verifier}\`, and its sha256
is on-chain in the reveal, so you can check that nothing was changed after the vote.

When \`status = "Settled"\`, whoever is owed money calls \`withdraw({})\` (gas 30 Tgas); \`get_claimable({ account_id })\`
shows the amount. Settled jobs update \`get_agent_stats({ account_id })\`, the settlement-based reputation.

## 6. Limits and honesty

- ${o.network === "mainnet" ? "Mainnet" : "Testnet only: test NEAR, no real value"}. All verifiers are operated by one operator in this MVP; the code and keys are scoped
  (each verifier key can only call commit_vote / reveal_vote / withdraw), but the jury is not independent yet.
- Jurors run on NEAR AI Cloud; a TEE attestation hash is stored when the provider returns one. A replayed
  (recorded) vote is never marked attested.
- LLM judgement can be wrong. Keep criteria concrete; deterministic criteria (word count, sections, links) are
  checked by code, not by the model.
- Trust Score and patterns are heuristics from public data, not financial advice.
`;
}
