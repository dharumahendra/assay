# Deploy (T7.2)

| Part | Where | Why |
|---|---|---|
| Web (Next.js, `apps/web`) | **Vercel** | static + server components; calls the API through the `/api/*` and `/skill.md` rewrites |
| API + jury runner (one container, `Dockerfile`) | **Railway** (or Fly, or any Docker host) | long-running runner loop, SQLite file + blob store on a persistent volume; Vercel functions cannot do either |

API and runner share `/data/juri.db` and `/data/blobs`, so they run in the same container (`scripts/dev.mjs --no-web`).
CI job `docker` builds this image from a clean checkout and smoke-tests it in SNAPSHOT mode with no keys.

## 1. Backend on Railway

1. New Project → **Deploy from GitHub repo** → this repo, branch `develop` (or `main` at submission). Railway finds the root `Dockerfile`.
2. Service → **Volumes** → add a volume mounted at **`/data`** (SQLite + blobs survive redeploys).
3. Service → **Settings → Networking** → *Generate Domain*, target port **8787**. Healthcheck path: `/api/health`.
4. Variables. On your laptop run
   ```
   node scripts/export-runner-env.mjs
   ```
   It writes the gitignored `.env.railway` (verifier + keeper FCAKs from `~/.near-credentials`, `NEARAI_API_KEY`, network and
   contract) without printing any secret. Open Railway → Variables → **Raw Editor**, paste the file, set
   `PUBLIC_API_URL=https://<your-domain>.up.railway.app`, save, then delete `.env.railway`.
   The owner key is never needed on the server: verifier keys can only call `commit_vote / reveal_vote / withdraw`,
   the keeper key only `start_judging / finalize / restart_jury` (NFR-SEC-2).
5. Check: `https://<domain>/api/health` → `"ok": true`, `/api/meta` → your mode and contract, `/skill.md` renders.
   Logs are JSON lines (`LOG_FORMAT=json`): filter on `phase`, `job_id`, `verifier`.

`MODE`: `snapshot` serves the committed snapshot only (no market token needed). `live` also needs `MARKET_API_KEY` and a
scheduler for `pnpm sync` (not part of this container; run it from your laptop or a Railway cron service if wanted).
The jury runner works in either mode: it only needs the contract, the keys and an LLM key.

**Rate limit behind Vercel (`TRUST_PROXY`).** The browser calls `/api/*` on the Vercel domain and Vercel forwards it, so
Railway sees Vercel's egress IP with the real client earlier in `X-Forwarded-For`.
- `TRUST_PROXY=1`: per-IP limits key on the address Railway's edge saw (Vercel for browser traffic → all browsers share
  one bucket of 60 GET/min).
- `TRUST_PROXY=2`: key on the address Vercel saw (the real browser). A client calling Railway directly could then put a
  fake address in front, so direct callers can dodge the limit.
For the demo use **2** (browser traffic goes through Vercel). After deploy, a quick check: load the site from two
networks (wifi + phone data) and compare the `x-ratelimit-remaining` header on `/api/health`; they should count separately.

## 2. Web on Vercel

1. New Project → import this repo → **Root Directory `apps/web`** (keep "Include files outside the root directory" on;
   it needs `packages/shared`). Framework: Next.js. Vercel detects pnpm from the root lockfile.
2. Environment variables (Production and Preview):

   | Name | Value |
   |---|---|
   | `API_URL` | `https://<railway-domain>` (no trailing slash; used by rewrites and server components) |
   | `NEXT_PUBLIC_NEAR_NETWORK` / `NEAR_NETWORK` | `testnet` |
   | `NEXT_PUBLIC_JURI_CONTRACT_ID` / `JURI_CONTRACT_ID` | `juri.juri-assay-jdir.testnet` |
   | `NEXT_PUBLIC_NEAR_RPC_URL` / `NEAR_RPC_URL` | `https://test.rpc.fastnear.com` |

   Never put `NEARAI_API_KEY`, `MARKET_API_KEY` or any private key in Vercel: the web app does not need them, and
   CI job `web-bundle` fails if a key shape or a secret env name shows up in the client bundle (NFR-SEC-1).
3. Redeploy after changing `API_URL` (rewrites are fixed at build time).
4. Check: the site loads, `/insights` shows numbers, `/skill.md` renders, `/protected` lists jobs, wallet connect works.

## 3. Everything locally with Docker

```
docker compose up --build        # web http://localhost:3000 · API http://localhost:8787
```

No `.env` → SNAPSHOT mode, no keys, jury runner idle. With `.env` the runner signs and judges like on Railway.
Without Docker: `pnpm install && pnpm dev` (README).
