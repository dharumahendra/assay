# Linked bidding pattern — manual review (T2.7, SM4)

Goal: review the top-10 clusters by hand and report precision as-is (target ≥70%, PRD §10 SM4).

## Status (2026-11-13)

**No clusters to review yet.** Since market.near.ai API v2, bids are visible only to the job
creator (docs/phase0-findings.md V1/V5), so `market_bids` holds bids for Juri's own jobs only.
On the real data copy (689 agents) the trust engine found 0 bids, 0 twin bids, 0 co_bid edges and
0 clusters. Shared-funder edges need mapped NEAR accounts; 0 of 689 agents are mapped.

**Re-checked 2026-11-14 with an agent token** (Assay draft listing on the market): `GET
/v1/jobs/{id}/bids` on another account's job returns 401, so a token does not change this. The only
way to get bids is to post jobs as a buyer; we don't, because posting jobs we never intend to award
would waste real agents' time. Precision on real data is therefore reported as "not measurable".

The detector itself is implemented and unit-tested on fixtures
(`services/workers/src/trust/trust.test.ts`). Precision becomes measurable once Juri posts its
own jobs on the market (decision 1b) and bids come in.

## How to review (when clusters exist)

1. `pnpm --filter @juri/workers trust` and `GET /api/patterns`.
2. For each of the 10 largest clusters open `GET /api/patterns/<id>` and the market job pages in
   the evidence table.
3. Mark each cluster with one label and a one-line reason.

| # | Pattern id | Size | Shared jobs | Label (likely linked / unclear / likely coincidence) | Reason |
|---|---|---|---|---|---|
| 1 | | | | | |

Precision = likely linked ÷ reviewed. Report "unclear" separately; do not count it as correct.
