# Phase 0 — Findings (V1–V9)

Checked 2026-11-13. Raw responses are in `docs/samples/`.

**Bottom line:** market.near.ai was rebuilt ("v2 codebase", openapi 2.0.0) after the docs were written. Several P1 assumptions no longer hold. Gate G0 is **passed with fallbacks**: V7 FCAK spike runs on testnet, V5/V6 have recorded fallbacks, data layer goes on-chain-first (decision 1a, chosen by the owner).

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
| V4 NearBlocks `ft-txns` for `escrow.ai.near` | Returns `[]` (count 0). `escrow.ai.near` is very active (~1 tx every few seconds) but settles via **`execute_intents` on `intents.near`**: NEP-413 signed `transfer` intents, e.g. `nep141:17208628…a1` (USDC, 6 decimals) amount `975000` → implicit account `51500a5a…b2ab`. Re-checked: `/v1/account/escrow.ai.near/txns-only` works (`nearblocks-escrow-txns.json`); RPC `tx` + base64 args decode works (`escrow-intent-decoded.json`). **Note:** escrow is a *relayer* — `signer_id` in the decoded message is often another implicit account, and tokens include `nep141:wrap.near`, not only USDC | ⚠️ Changed, decode path ✅ | Indexer must filter by `signer_id`/token and classify (settlement vs. relayed user transfer) |
| V5 `proposal` visible only to creator | Cannot test without a token | ⏸ fallback | Not needed for MVP: Protected Job keeps proposals/commitments in Juri's own contract; market proposals are not read |
| V6 NEAR AI Cloud | Public without key: `GET /v1/models` (≈60 models; `nearai-models.json`) and `GET /v1/attestation/report` (gateway TDX quote, ed25519 signing address; `nearai-attestation-report.json`). Chat, per-model attestation and response signatures need an API key. With the key (added 2026-11): chat + attestation + signature verified end to end on testnet jobs | ✅ | Fallback `openai_compat` kept for when credits run out (badge "Not attested") |
| V7 near-sdk `create_account` + `add_access_key_allowance` | ✅ **Works on testnet.** near-sdk 5.30: `Promise::new(sub).create_account().transfer(..).add_access_key_allowance(pk, Allowance::limited(NearToken)?, receiver, "commit_vote,reveal_vote,withdraw")`. Unit tests 3/3; wasm 108.7 KB (cargo-near 0.23). Testnet run (`testnet-spike.sh`): contract `spike.juri-assay-jdir.testnet`, verifier `v1.spike.…` has one key "only do [commit_vote, reveal_vote, withdraw] on spike.… with allowance 0.25 NEAR" (tx `5LPv3AHNFcvRShpRCAcJHXhSU3teJMhxLucopeZ71B8d`). FCAK **allowed** `commit_vote`; **denied** `owner_only` ("method name isn't allowed"), NEAR transfer ("requires a full permission access key") and calls to `wrap.testnet` ("doesn't match the access key"). Non-owner → `E01: NotOwner` | ✅ | – |
| V8 `wrap.testnet` | OK: `ft-1.0.0`, symbol `wNEAR`, 24 decimals (`docs/samples/wrap-testnet-ft_metadata.json`) | ✅ | – |
| V9 ToS / rate limits | ToS §9.2 prohibits to "**scrape, harvest, or collect data or content from the Marketplace at scale**" and using Marketplace data "to develop … a competing marketplace, product". `llms.txt` openly offers the public agent search API (no auth). No published rate limit | ⚠️ Risk | Keep to public, documented endpoints at low volume; do not bulk-sync jobs/bids; prefer on-chain data (public ledger, not covered by ToS) |

## Environment

| Item | Status |
|---|---|
| Node 24 / pnpm 9 / Docker 28 / gh | ✅ |
| Rust 1.100 (host) | Installed, but host has no MSVC linker → builds run in Docker |
| Contract build image | `contracts/Dockerfile.build` (rust:1-slim + cargo-near 0.23.0 + near-cli-rs 0.31.1, sha256-checked) |
| Testnet accounts (T0.6) | ✅ `juri-assay-jdir.testnet` (faucet) + `juri.`, `keeper.`, `demo-requester.`, `demo-worker-honest.`, `demo-worker-injector.` (`scripts/testnet-accounts.sh`); keys in `~/.near-credentials/testnet/` |
| Market agent token (T0.3) | Not created: needs the owner to sign up in the web app (only blocks V5, which has a fallback) |
| NEAR AI Cloud key (T0.5) | ✅ Created by the owner (hackathon credits). Chat, per-model attestation and response signatures work: job #8 (2026-11-14) was judged by 3 nearai models, all with valid TEE attestation signatures |

## Escrow flows (P1, indexed 2026-11-13)

Source: FastNEAR tx API (`tx.main.fastnear.com/v0/account`, `is_success:true`, `desc:false`) + `/v0/transactions`. NearBlocks cannot filter on status and the free tier (~6 req/min) is too slow for this account.

| Fact | Value |
|---|---|
| Txns touching `escrow.ai.near` | 1,993,811 |
| Successful | 9,653 (0.5%) — first 2026-02-02, **last 2026-10-29 03:22** (`HPnA2yCS…`) |
| Successful per month | Feb 1,400 · Mar 3,187 · Apr 2,269 · May 2,577 · Jun 125 · Jul 53 · Aug 33 · Sep 1 · Oct 8 |
| Now | escrow re-tries the same $1.00 payout (0.975 to `51500a5a…` + 0.025 fee) every ~20 s since ≥2026-11-13 10:51 and fails with `insufficient balance or overflow`; its USDC balance in intents.near is 0.023001. A wNEAR self-transfer loop by `5cdaee…` fails with `invalid intent` |
| Tokens | mostly wNEAR (2026-02..05), then USDC; some native NEAR |
| Fee | 2% leg to `5cdaee…` (early), later 2.5% to `treasury.ai.near` |
| Operator wallet (inferred) | `5cdaee04…c3c8`: 4,534 of 4,721 deposits, receives the 2% fee legs and most outflows → classified `internal`, excluded from M2 and rewards |

Classifier (`services/workers/src/classify.ts`, `kind_method=heuristic`): deposit · reward · refund (exact amount of an outstanding deposit) · fee (fee account, or ≤3% leg of a multi-leg payout) · internal (operator wallet) · relay. Cross-checked 3 legs against archival RPC `dip4` transfer events: all match.

## Metrics (adapted M1–M5, + M6)

Jobs and bids are private since API v2, so job-level M1/M3/M4/M5 from 05 §4 are not computable. Replacements, all with `sources_json`:

| ID | Definition | Value 2026-11-13 |
|---|---|---|
| M1 | Delivered ÷ all jobs (`/v1/platform/stats`) | 64.1% (760/1185) |
| M2 | Refund legs ÷ deposit legs, excl. operator wallet (+ value ratio per token) | 23.5% (44/187); 30d n/a (no successful settlements) |
| M3 | Share of delivered jobs by top-10 agents | 39.7% (235/592) |
| M4 | Listed agents with 0 delivered jobs | 79.5% (549/691) |
| M5 | Rated agents with `dispute_free` < 100 | 0% (0/23) |
| M6 | Failed ÷ all escrow txns | 99.5% |

Note: the public agent list returns 691 agents vs `live_agents` 816 in platform stats; delivered-jobs sum over listed agents (592) < platform `delivered_jobs` (760).

## Decisions for P1

1. **Data source for Market Insight / Trust Score.** **Chosen: (a)** on-chain (decode `escrow.ai.near` intents) + public agent reputation API at low volume. (Other options were (b) `aat_` token for our own jobs, (c) re-scope.)
2. **Problem narrative.** RC3 ("no settlement-based reputation") is weaker now that the market publishes reputation axes. Possible reframe: Juri's score is *independently recomputable from chain*, market's is opaque.
3. **Twin-bid detection (FR-B4)** needs bid lists, which are now private. Likely cut or limited to our own jobs.
4. **Payment token** for Protected Job: native NEAR (D2) still fine on testnet; note market uses USDC.
