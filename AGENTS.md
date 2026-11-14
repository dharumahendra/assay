# Guide for AI agents working in or reviewing this repository

Assay is a trust layer for NEAR's AI Agent Market (market.near.ai): Trust Scores from paid on-chain work, a Spec
Compiler that hash-locks acceptance criteria, and Protected Jobs judged by three model verifiers with commit-reveal on a
NEAR testnet contract. Start with [README.md](README.md); [SUBMISSION.md](SUBMISSION.md) has the hackathon summary.

## Reviewing: fastest path

Everything below runs without API keys, a wallet or network access to the market (SNAPSHOT mode).

| Step | Command | Expected |
|---|---|---|
| Install | `pnpm install` (Node ≥ 20, pnpm 9 via `corepack enable`) | completes; native build of better-sqlite3 |
| Tests | `pnpm test` | 134 TypeScript tests pass across shared, jury, workers, api, web |
| Data | `pnpm load:snapshot` | 691 agents, 142 scored, M1 64.1% (760/1185), M4 79.5% (549/691) |
| Jury eval | `pnpm eval --recorded` | quorum 24/24, injection false-PASS 0%, writes `eval/report-replay.md` |
| App | `pnpm dev` → http://localhost:3000 | Insights, Jobs, Agents, Protected Jobs, Jury pages render from the snapshot |
| API | `curl localhost:8787/api/health` · `curl localhost:8787/skill.md` | `{"ok":true,"status":"ok","mode":"snapshot",…}`; the agent guide |
| Contract | `cargo test` in `contracts/juri` (host needs a linker; `contracts/Dockerfile.build` otherwise) | 51 unit tests |
| Sandbox e2e | `pnpm e2e` (Linux/macOS) | Protected Job released for a good report, refunded for an injected one |

Hosted copy of the app: https://assay-near.vercel.app (API on Railway, same snapshot). Settled testnet jobs to
inspect: `/protected/6` (injected deliverable, Refunded) and `/protected/8` (10/10 criteria, Released); each has
"Verify against chain" and NearBlocks links. The README table "Claim → evidence" maps every claim to a file, test or
transaction.

What needs keys and is not expected to work from a clean clone: LIVE market sync (`MARKET_API_KEY`), the live jury
runner (testnet keys + `NEARAI_API_KEY`), and creating jobs from the UI (a testnet wallet). Limits are listed in the
README under "Limits".

## Layout

- `contracts/juri`: Rust contract (escrow, verifier registry with Function Call keys, jury, commit-reveal, tally, fees)
- `services/workers`: market and `escrow.ai.near` indexers, Trust Score engine, jury runner, snapshot export/import
- `services/api`: Hono REST API, blob store, Spec Compiler endpoint, `/skill.md`
- `packages/jury`: Spec Compiler, judge prompt, injection pre-scan, model providers, attestation
- `packages/shared`: schemas and hashing shared by all packages (the contract's commitment format lives here)
- `apps/web`: Next.js app
- `docs/`: PRD, requirements, architecture, contract spec, backend spec, UI, workplan, findings, devlog

## Working on it

- Git: commit to `develop`; `main` only when the owner asks. No AI co-author trailers or "generated with" lines.
  Never push without the owner's go-ahead; never force-push.
- `.env` and `~/.near-credentials` stay local and are never committed or sent anywhere.
- Market data: public endpoints only, low volume (market ToS §9.2); never post jobs on market.near.ai.
- User-facing wording stays neutral: "Linked bidding pattern (heuristic)", "Insufficient data"; never "scam", "fraud" or
  "sybil".
