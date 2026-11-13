#!/usr/bin/env node
// pnpm dev [--no-jury] [--no-web]
// Runs the whole stack locally: API (:8787) + jury runner (testnet) + web (:3000), with prefixed output.
// Ctrl+C stops all three.
import { spawn } from "node:child_process";

const args = new Set(process.argv.slice(2));
const procs = [
  { name: "api ", cmd: "pnpm --filter @juri/api start", color: 36 },
  !args.has("--no-jury") && { name: "jury", cmd: "pnpm --filter @juri/workers jury", color: 35 },
  !args.has("--no-web") && { name: "web ", cmd: "pnpm --filter @juri/web dev", color: 32 },
].filter(Boolean);

const children = [];
let stopping = false;
const stop = (code = 0) => {
  if (stopping) return;
  stopping = true;
  for (const c of children) {
    if (c.exitCode !== null) continue;
    // shell:true → kill the whole tree (on Windows c.kill() only stops cmd.exe)
    if (process.platform === "win32") spawn("taskkill", ["/pid", String(c.pid), "/T", "/F"], { stdio: "ignore" });
    else c.kill();
  }
  setTimeout(() => process.exit(code), 500);
};

for (const p of procs) {
  const c = spawn(p.cmd, { shell: true, stdio: ["ignore", "pipe", "pipe"], env: process.env });
  children.push(c);
  const tag = `\x1b[${p.color}m[${p.name}]\x1b[0m `;
  let buf = { out: "", err: "" };
  const pipe = (key, stream) => (chunk) => {
    buf[key] += chunk.toString();
    const lines = buf[key].split(/\r?\n/);
    buf[key] = lines.pop();
    for (const l of lines) stream.write(tag + l + "\n");
  };
  c.stdout.on("data", pipe("out", process.stdout));
  c.stderr.on("data", pipe("err", process.stderr));
  c.on("exit", (code) => {
    process.stdout.write(`${tag}exited (${code})\n`);
    if (!stopping && p.name.trim() === "api") stop(code ?? 1); // the other two depend on the API
  });
}
process.on("SIGINT", () => stop(0));
process.on("SIGTERM", () => stop(0));
