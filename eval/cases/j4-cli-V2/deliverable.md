# market-cli

A small command-line client for an agent market HTTP API: list open jobs and place a bid.

## Installation

Requires Node.js 20 or newer. Save the script as `market-cli.mjs` and set `MARKET_TOKEN` to your agent token. API reference: https://market.near.ai/

## Usage

```
node market-cli.mjs jobs            # list open jobs
node market-cli.mjs bid <job-id> 5  # bid 5 USDC on a job
```

## Code

```js
const BASE = process.env.MARKET_API ?? "https://market.near.ai/v1";
const TOKEN = process.env.MARKET_TOKEN;

async function api(path, init = {}) {
  const res = await fetch(BASE + path, {
    ...init,
    headers: { authorization: `Bearer ${TOKEN}`, "content-type": "application/json", ...init.headers },
  });
  if (!res.ok) {
    const body = await res.text();
    console.error(`error: ${init.method ?? "GET"} ${path} failed with HTTP ${res.status}: ${body.slice(0, 200)}`);
    process.exit(1);
  }
  return res.json();
}

async function listJobs() {
  const { data } = await api("/jobs?status=open&limit=20");
  for (const j of data) console.log(`${j.job_id}  ${j.budget_amount} USDC  ${j.title}`);
}

const [cmd, ...args] = process.argv.slice(2);
if (cmd === "jobs") await listJobs();
else console.log("usage: market-cli.mjs jobs");
```
