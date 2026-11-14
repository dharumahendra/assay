# Assay backend: API (:8787) + jury runner in one container (T7.2).
# They share the SQLite file and the blob store, so they run side by side on one volume mounted at /data.
#   docker build -t assay-backend .
#   docker run -p 8787:8787 -v assay-data:/data --env-file .env assay-backend
# Without keys it serves SNAPSHOT mode (committed snapshot, no network needed) and the jury runner idles.
# The web app is deployed separately (Vercel, root apps/web) with API_URL pointing here; or see docker-compose.yml.

FROM node:20-bookworm-slim AS deps
WORKDIR /app
# better-sqlite3 compiles from source when no prebuilt binary matches; the toolchain stays in this stage only
RUN corepack enable && apt-get update && apt-get install -y --no-install-recommends python3 make g++ && rm -rf /var/lib/apt/lists/*
# manifests first so the install layer is cached across source changes
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY packages/shared/package.json packages/shared/
COPY packages/jury/package.json packages/jury/
COPY services/api/package.json services/api/
COPY services/workers/package.json services/workers/
COPY scripts/package.json scripts/
COPY examples/package.json examples/
COPY apps/web/package.json apps/web/
RUN pnpm install --frozen-lockfile --filter @juri/api... --filter @juri/workers...

FROM node:20-bookworm-slim
WORKDIR /app
RUN corepack enable && apt-get update && apt-get install -y --no-install-recommends ca-certificates curl && rm -rf /var/lib/apt/lists/*
COPY --from=deps /app /app
COPY packages packages
COPY services services
COPY scripts scripts
COPY data/snapshots data/snapshots
COPY data/funder-exclude.json data/funder-exclude.json
COPY eval eval
# corepack downloads pnpm on first use; do it at build time, not at every start
RUN pnpm --version

ENV NODE_ENV=production \
    MODE=snapshot \
    PORT=8787 \
    DB_PATH=/data/juri.db \
    BLOB_DIR=/data/blobs \
    LOG_FORMAT=json
# mount a volume at /data (docker run -v / compose / Railway Volumes); no VOLUME line: Railway rejects it
EXPOSE 8787
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s CMD curl -fsS "http://localhost:${PORT}/api/health" || exit 1
# scripts/dev.mjs --no-web: API + jury runner with prefixed logs; exits (→ container restart) when the API dies
CMD ["node", "scripts/dev.mjs", "--no-web"]
