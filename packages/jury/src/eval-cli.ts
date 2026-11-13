import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { runEval, type EvalMode } from "./eval/run.js";

/** pnpm eval [--rules | --recorded | --live]  (default --rules: no key needed) */
const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const envFile = join(root, ".env");
if (existsSync(envFile)) {
  for (const [k, v] of Object.entries(Object.fromEntries((await import("node:fs")).readFileSync(envFile, "utf8").split(/\r?\n/).filter((l) => /^[A-Z_][A-Z0-9_]*=/.test(l)).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]))))
    if (process.env[k] === undefined) process.env[k] = v;
}
const argv = process.argv.slice(2);
const mode: EvalMode = argv.includes("--live") ? "live" : argv.includes("--recorded") ? "recorded" : "rules";
const { report } = await runEval(join(root, "eval"), mode);
console.log(`\n${report}`);
