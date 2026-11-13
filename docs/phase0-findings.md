# Phase 0 — Findings (V1–V9)

Checked 2026-11-13. Raw responses are in `docs/samples/`.

**Bottom line:** market.near.ai was rebuilt ("v2 codebase", openapi 2.0.0) after the docs were written. Several P1 assumptions no longer hold. Gate G0 is **not passed**: the data-layer design (05 §3, FR-A1/A2, M1–M5) needs a decision before P1 continues.

## Market changes that matter

| Was assumed (docs 01/05) | Observed now |
|---|---|
| Agents bid on jobs with wNEAR; settlement in `nep141:wrap.near` | Payment in **USD (Stripe) or USDC**; agents show `payable_with: "USDC"` |
| `POST /v1/agents/register` gives an API key, no auth | Agents are registered by a signed-in account owner in the web app, which mints an `aat_…` token. Email verification required |
| `GET /v1/jobs` lists jobs | Removed. `GET /v1/jobs/board`, `/v1/jobs/{id}`, `/v1/jobs/{id}/bids` all return **401** without a token |
| Reputation is not derived from settlements (RC3) | Market now publishes its own reputation: `GET /v1/agents/{id}/reputation` → `overall` + axes `delivery, timeliness, responsiveness, dispute_free, repeat_hires, reviews` (public) |
| Single "dispute agent" (RC2) | Still true in spirit: ToS §8 "Resolver … may be an automated system, including an AI-based evaluator"; competitions use "a platform judge" |
| Platform fee unknown | `GET /v1/platform/config` → `platform_fee_bps: 500` (5%) |

## V1–V9

| ID | Result | Status | Fallback / next step |
|---|---|---|---|
| V1 Job/bid/agent endpoints | Agents: public (`GET /v1/agents?q=&category=&sort=&limit≤50`, `/v1/agents/{id}`, `/reputation`, `/reviews`). Jobs and bids: **auth only** (`aat_` token) | ⚠️ Changed | Needs a market account + agent token (only the owner can create one), or drop job/bid sync |
| V2 NEAR account id on agent/job | **No.** `owner_account_id` and `builder.account_id` are market UUIDs, not NEAR accounts | ❌ | Mapping via reward tx only (see V3/V4); receivers on-chain are 64-hex implicit accounts inside intents.near, so mapping is weak |
| V3 Per-job transaction list via API | Not in openapi. `GET /v1/wallet/ledger` exists but is the caller's own ledger | ❌ | On-chain only |
| V4 NearBlocks `ft-txns` for `escrow.ai.near` | Returns `[]` (count 0). `escrow.ai.near` is very active (~1 tx every few seconds) but settles via **`execute_intents` on `intents.near`**: NEP-413 signed `transfer` intents, e.g. `nep141:17208628…a1` (USDC, 6 decimals) amount `975000` → implicit account `51500a5a…b2ab` | ⚠️ Changed | New indexer: list `escrow.ai.near` txns from NearBlocks `/v1/account/escrow.ai.near/txns`, decode `args.signed[].payload.message` → intents. Incoming deposits are also inside intents.near (token_diff/transfer to escrow) |
| V5 `proposal` visible only to creator | Cannot test without a token | ⏸ | – |
| V6 NEAR AI Cloud | Needs account + credits (user action) | ⏸ | Provider fallback (`openai_compat`), badge "Not attested" |
| V7 near-sdk `create_account` + `add_access_key_allowance` | Spike written: `contracts/spike-fcak` (near-sdk 5: `Promise::new(sub).create_account().transfer(..).add_access_key_allowance(pk, Allowance::limited(NearToken), receiver, "commit_vote,reveal_vote,withdraw")`). Build/test pending local Rust toolchain; testnet deploy pending accounts | ⏳ | Manual verifier registration via CLI |
| V8 `wrap.testnet` | OK: `ft-1.0.0`, symbol `wNEAR`, 24 decimals (`docs/samples/wrap-testnet-ft_metadata.json`) | ✅ | – |
| V9 ToS / rate limits | ToS §9.2 prohibits to "**scrape, harvest, or collect data or content from the Marketplace at scale**" and using Marketplace data "to develop … a competing marketplace, product". `llms.txt` openly offers the public agent search API (no auth). No published rate limit | ⚠️ Risk | Keep to public, documented endpoints at low volume; do not bulk-sync jobs/bids; prefer on-chain data (public ledger, not covered by ToS) |

## Environment

| Item | Status |
|---|---|
| Node 24 / pnpm 9 / Docker 28 / gh | ✅ |
| Rust toolchain | Install retried (first attempt: DNS error) |
| near-cli-rs, cargo-near | Not installed |
| Testnet accounts (T0.6) | Not created: need the owner's account name |
| Market agent token (T0.3) | Not created: needs the owner to sign up in the web app |

## Decisions needed before P1

1. **Data source for Market Insight / Trust Score.** Options: (a) on-chain only (decode `escrow.ai.near` intents) + public agent reputation API; (b) also get an `aat_` token and read jobs/bids for jobs we create ourselves; (c) re-scope.
2. **Problem narrative.** RC3 ("no settlement-based reputation") is weaker now that the market publishes reputation axes. Possible reframe: Juri's score is *independently recomputable from chain*, market's is opaque.
3. **Twin-bid detection (FR-B4)** needs bid lists, which are now private. Likely cut or limited to our own jobs.
4. **Payment token** for Protected Job: native NEAR (D2) still fine on testnet; note market uses USDC.
