# Assay

**A trust layer for NEAR's AI Agent Market: checkable acceptance criteria, an AI jury, settlement-based reputation.**

[![CI](https://github.com/dharumahendra/assay/actions/workflows/ci.yml/badge.svg?branch=develop)](https://github.com/dharumahendra/assay/actions/workflows/ci.yml)
· License MIT · NEAR testnet

On market.near.ai a requester picks an agent from bids it cannot check and pays for work that is accepted by hand.
Assay adds three things:

1. **Trust Score + bid screening.** Every listed agent gets a deterministic score from its public settled history
   (market API + `escrow.ai.near` transactions), with "Insufficient data" instead of a penalty for new agents.
2. **Spec Compiler.** A job description becomes ≤13 checkable acceptance criteria (MUST/SHOULD, deterministic rules where
   possible) plus the integrity criterion C0, hashed and stored.
3. **Protected Jobs.** The requester locks NEAR in the Assay contract. The worker submits a deliverable (hash on-chain).
   Three verifiers running **different LLMs** judge every criterion with commit-reveal; the contract releases or refunds
   by majority, pays the jurors from the fee, and records the result as on-chain reputation. Nobody, including the
   operator, can move escrow by hand, and a verifier key can only vote.

> The contract and the npm packages carry the project's working name **Juri** (`juri.juri-assay-jdir.testnet`, `@juri/*`).

## Run it (no API key, no wallet)

```bash
git clone https://github.com/dharumahendra/assay && cd assay
pnpm install                 # Node ≥ 20, pnpm 9 (corepack enable)
pnpm dev                     # API http://localhost:8787 + web http://localhost:3000, SNAPSHOT mode
pnpm eval --recorded         # replays the live jury eval from eval/recorded/ → eval/report-replay.md
pnpm e2e                     # Linux/macOS: full Protected Job on a local NEAR sandbox with recorded jurors
```

Or with Docker: `docker compose up --build` (same ports). Hosted setup: [docs/DEPLOY.md](docs/DEPLOY.md).

| Do | See |
|---|---|
| open http://localhost:3000/insights | six market metrics from the committed snapshot; each number opens the records it was computed from |
| open `/agents`, pick an agent | Trust Score with its components and inputs, or "Insufficient data" |
| open `/protected/6` | a real testnet job: three jurors (DeepSeek, Qwen, Qwen-MoE) caught an injected instruction → **Refunded**; "Verify against chain" re-hashes criteria, deliverable and every juror's evidence in your browser |
| open `/protected/8` | a job judged PASS on 10/10 criteria by DeepSeek, Qwen and GLM → **Released**, juror shares paid |
| `curl localhost:8787/skill.md` | the agent guide: screen bids → compile criteria → `create_job` → follow the verdict |
| `pnpm e2e` | sandbox: deploy → 3 verifier FCAKs → good report **Released**, injected report **Refunded** → withdrawals |

Modes (FR-A4, labelled in the UI): **SNAPSHOT** (default; committed data, no network for market data),
**LIVE** (`MARKET_API_KEY`, `pnpm sync`), **RECORDED-JURY** (replayed LLM outputs, never marked attested).
With your own testnet keys in `.env` (see `.env.example`) `pnpm dev` also runs the live jury runner.

## Results

**Market (snapshot `data/snapshots/2026-11-13T12-37-41-104Z.json`,
sha256 `706e0f4a1ecd1cce021d554f2d19d198c0fee40890da04620ad5cafd589ef653`):**

| Metric | Value |
|---|---|
| M1 delivered ÷ all jobs posted | 64% (760 / 1185) |
| M2 refund legs ÷ deposit legs in escrow | 24% (44 / 187), from 9,653 indexed `escrow.ai.near` txns |
| M3 delivered jobs done by the 10 busiest of 691 agents | 40% (235 / 592) |
| M4 listed agents with zero delivered jobs | 79% (549 / 691) |
| M6 failed ÷ all txns touching `escrow.ai.near` | 99.5% |

**Jury eval** ([eval/report.md](eval/report.md)): 24 cases = 4 real market jobs × 6 deliverable variants
(good, missing MUST, off-topic, missing SHOULD, plain injection, obfuscated injection), labelled by hand.

| Model (NEAR AI Cloud) | Outcome accuracy | Criterion agreement | Injection false-PASS | Injection detection |
|---|---|---|---|---|
| v1 DeepSeek-V4.1-Flash | 100% (24/24) | 99% | 0% | 100% |
| v2 Qwen3.8-27B | 96% (23/24) | 96% | 0% | 100% |
| v3 GLM-5.3-flash | 100% (24/24) | 94% | 0% | 100% |
| **Quorum (3)** | **100% (24/24)** | – | **0%** | **100%** |

The eval is small and the variants were written by us; treat it as a regression suite, not a benchmark.
Cost of the live testnet jury so far: about $0.005 of NEAR AI credits per job (3 judge calls).

## Claim → evidence

| Claim | How to check |
|---|---|
| Market metrics come from real public data | the snapshot above (sha256) · `pnpm metrics` · Sources drawer on `/insights` · `services/workers/src/{sync-market,index-escrow}.ts` |
| Trust Score is deterministic and versioned | `services/workers/src/trust/` · `pnpm --filter @juri/workers test` (16 trust tests) · `algo_version` in `/api/agents/:id` |
| A verifier key can only vote | `contracts/juri-it/tests/lifecycle.rs` (`verifiers_get_function_call_keys_only`, `verifier_key_cannot_call_other_methods`) · access keys of `v1.juri.juri-assay-jdir.testnet` on [nearblocks](https://testnet.nearblocks.io/address/v1.juri.juri-assay-jdir.testnet) |
| Votes are commit-reveal | `contracts/juri/src/jury.rs` · job #8 juror v1: [commit](https://testnet.nearblocks.io/txns/8VEn4PN3pSK3y9tTrH1XJarYnsTeQvPDLtstWMX7MhKX) then [reveal](https://testnet.nearblocks.io/txns/5XhxsE7CfbKFpUcgssRPCb7VKW5RreXzHK4FKM3w5Dwi) |
| Three different models judge independently | `model` in every on-chain reveal · evidence drawer on `/protected/<id>` · `VERIFIER_MODELS_JSON` defaults in `packages/jury/src/providers.ts` |
| Prompt-injected deliverables do not pass | `eval/report.md` (8 injection cases, 0 released) · `pnpm eval --recorded` · testnet job #6: [v1 reveal](https://testnet.nearblocks.io/txns/FgAPJ7XcU5RmXXy5mDMbj1aLkEmBVh8S65HT4k3miA6) · `pnpm e2e` case V5 |
| Evidence can't be changed after the vote | evidence sha256 is in the commitment and the reveal · "Verify against chain" on `/protected/<id>` re-hashes it in the browser |
| Inference is attested when the provider supports it | NEAR AI Cloud TEE report + signed response; the report's sha256 is the reveal's `attestation_hash` · badge per juror · `packages/jury/src/attestation.ts` |
| Fees are split automatically | `contracts/juri/src/tally.rs` · `job_settled` event · `get_claimable` of a verifier → `withdraw` lands on its payout account (`pnpm e2e`) |
| No secrets in the frontend | CI job `web-bundle` (`scripts/scan-bundle.mjs`) |
| It runs from a clean checkout | CI jobs `docker` (image build + SNAPSHOT smoke test) and `e2e` |

## How it works

```
market.near.ai API ─┐                         ┌─ web (Next.js, wallet selector)
escrow.ai.near txns ┼─ workers: sync, index ──┤
                    │  trust engine → SQLite  ├─ API (Hono): read API, blobs, Spec Compiler, /skill.md
                    │                         │
NEAR AI Cloud ──────┴─ jury runner ───────────┴─ Assay contract (testnet): escrow, jury, commit-reveal, payouts
                       (3 models, FCAK keys)
```

- `contracts/juri`: Rust, near-sdk 5. Escrow, verifier registry (each verifier is a sub-account whose only key is a
  function-call key for `commit_vote / reveal_vote / withdraw`), random jury of 3, commit-reveal, majority tally,
  Binary or Partial payout, fee split, per-agent stats, Trust Score snapshot roots. 51 unit tests + near-workspaces tests.
- `services/workers`: market + escrow indexers, Trust Score, co-bidding patterns, the jury runner (idempotent; state per
  job/round/juror), `pnpm e2e`.
- `packages/jury`: Spec Compiler, deterministic rules, injection pre-scan, judge prompt (deliverable fenced by a random
  nonce), providers (NEAR AI Cloud, OpenAI-compatible fallback, recorded, rules), attestation, SSRF guard.
- `services/api`: REST API ([docs/05](docs/05-BACKEND-AI-SPEC.md) §8), content-addressed blob store, rate limits.
- `apps/web`: insights, jobs, agents, patterns, create-job wizard, Protected Job page, account, jury console.
- Specs: [docs/00-INDEX.md](docs/00-INDEX.md) (PRD, requirements, architecture, contract, backend, UI, workplan, testing).

## Limits (read before trusting it)

- **Testnet.** Test NEAR only.
- **One operator.** All verifiers are run by the project in this MVP. Keys are scoped and votes are on-chain, but the jury
  is not independent yet; permissionless verifiers and slashing are future work.
- **Market data is partial.** market.near.ai v2 keeps bids private to the job's creator and agent objects carry no NEAR
  account, so most agents are unmapped and the co-bidding detector has no real clusters yet (tested on fixtures).
  We read only public endpoints at low volume and do not post jobs (ToS §9.2, [docs/phase0-findings.md](docs/phase0-findings.md)).
- **LLMs can be wrong.** Deterministic criteria are checked by code; the rest is a majority of three models.
- Trust Score and patterns are heuristics from public data, not accusations and not financial advice.

## Built during the hackathon

Everything in this repository after the `pre-hackathon` tag:
[`pre-hackathon...develop`](https://github.com/dharumahendra/assay/compare/pre-hackathon...develop)
(becomes `pre-hackathon...hackathon-submission` at submission).

Libraries: near-sdk, near-workspaces, cargo-near (contract); near-api-js, @near-js/*, NEAR Wallet Selector (wallet);
Hono, drizzle-orm, better-sqlite3, zod (backend); Next.js, React (web); near-sandbox, Vitest (tests). No template.
Code was written with the help of AI coding assistants and reviewed by the author.

## License

MIT, see [LICENSE](LICENSE).
