#!/usr/bin/env node
/**
 * NFR-SEC-1 / T7.3: no secrets in what the browser downloads.
 *   pnpm --filter @juri/web build && node scripts/scan-bundle.mjs [dir]
 * Scans the client output of `next build` (.next/static plus prerendered HTML/RSC payloads) for
 *   - key-shaped strings (market agent tokens, OpenAI-style keys, NEAR ed25519 private keys),
 *   - names of server-only secret env vars (a sign that server code leaked into a client chunk),
 *   - the literal values of those env vars when they are set (locally from .env, or in CI).
 * Prints only file, pattern name and a masked excerpt; exits 1 on any hit.
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(fileURLToPath(import.meta.url), "../..");
const NEXT = resolve(process.argv[2] ?? join(ROOT, "apps/web/.next"));
const SECRET_ENV = ["NEARAI_API_KEY", "MARKET_API_KEY", "FALLBACK_LLM_API_KEY", "OPENAI_API_KEY", "KEEPER_KEY", "VERIFIER_KEYS_JSON", "NEAR_PRIVATE_KEY"];

const PATTERNS = [
  ["market agent token", /\baat_[A-Za-z0-9_-]{16,}/g],
  ["sk- API key", /\bsk-(?:proj-)?[A-Za-z0-9_-]{20,}/g],
  ["NEAR private key", /ed25519:[1-9A-HJ-NP-Za-km-z]{80,}/g],
  ["secp256k1 private key", /secp256k1:[1-9A-HJ-NP-Za-km-z]{80,}/g],
  ["secret env name", new RegExp(`\\b(?:${SECRET_ENV.join("|")})\\b`, "g")],
];

// literal values: process env first, then the repo .env (never printed)
const values = new Map();
const envFile = join(ROOT, ".env");
const fileEnv = existsSync(envFile)
  ? Object.fromEntries(
      readFileSync(envFile, "utf8")
        .split(/\r?\n/)
        .filter((l) => /^[A-Z_][A-Z0-9_]*=/.test(l))
        .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim().replace(/^["']|["']$/g, "")]),
    )
  : {};
for (const k of SECRET_ENV) {
  const v = process.env[k] || fileEnv[k];
  if (v && v.length >= 12) values.set(k, v);
}

if (!existsSync(join(NEXT, "static"))) {
  console.error(`no Next build at ${NEXT} (run \`pnpm --filter @juri/web build\` first)`);
  process.exit(2);
}

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) yield* walk(p);
    else yield p;
  }
}
const clientFiles = [
  ...walk(join(NEXT, "static")),
  ...(existsSync(join(NEXT, "server/app")) ? [...walk(join(NEXT, "server/app"))].filter((f) => /\.(html|rsc|body|meta)$/.test(f)) : []),
];

const mask = (s) => (s.length <= 10 ? "***" : `${s.slice(0, 6)}…${s.slice(-2)} (${s.length} chars)`);
let hits = 0;
let bytes = 0;
for (const f of clientFiles) {
  if (!/\.(js|mjs|css|html|rsc|body|meta|json|txt|map)$/.test(f)) continue;
  const text = readFileSync(f, "utf8");
  bytes += text.length;
  const rel = relative(ROOT, f);
  for (const [name, re] of PATTERNS) {
    for (const m of text.matchAll(re)) {
      hits++;
      console.log(`HIT ${rel}: ${name}: ${name === "secret env name" ? m[0] : mask(m[0])}`);
    }
  }
  for (const [k, v] of values) {
    if (text.includes(v)) {
      hits++;
      console.log(`HIT ${rel}: value of ${k}`);
    }
  }
}

console.log(
  `scanned ${clientFiles.length} client files (${(bytes / 1024 / 1024).toFixed(1)} MB) for ${PATTERNS.length} patterns` +
    ` + ${values.size} secret value(s) from env: ${hits ? `${hits} hit(s)` : "clean"}`,
);
process.exit(hits ? 1 : 0);
