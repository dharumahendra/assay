import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { REPO_ROOT } from "./db/index.js";

/**
 * Loads `<repo>/.env` (P0 config: testnet accounts, contract id, API keys) into process.env
 * without overriding variables that are already set. No-op when the file is missing.
 * Uses Node's built-in parser (process.loadEnvFile, Node ≥ 20.12).
 */
export function loadRepoEnv(file = resolve(REPO_ROOT, ".env")): boolean {
  if (!existsSync(file)) return false;
  const before = { ...process.env };
  process.loadEnvFile(file);
  for (const [k, v] of Object.entries(before)) process.env[k] = v; // existing env wins
  return true;
}
