/**
 * Polite JSON fetcher: per-host minimum interval, timeout, exponential backoff on
 * network errors / 429 / 5xx. Honours Retry-After when present.
 */
export interface FetchOpts {
  minIntervalMs?: number;
  retries?: number;
  timeoutMs?: number;
  headers?: Record<string, string>;
}

export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly url: string,
    body: string,
  ) {
    super(`HTTP ${status} ${url}: ${body.slice(0, 200)}`);
  }
}

const lastCall = new Map<string, number>();
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function getJson<T = unknown>(url: string | URL, opts: FetchOpts = {}): Promise<T> {
  return requestJson<T>(url, undefined, opts);
}

export function postJson<T = unknown>(url: string | URL, body: unknown, opts: FetchOpts = {}): Promise<T> {
  return requestJson<T>(url, body, opts);
}

async function requestJson<T>(url: string | URL, body: unknown, opts: FetchOpts): Promise<T> {
  const { minIntervalMs = 1000, retries = 5, timeoutMs = 30_000, headers = {} } = opts;
  const u = new URL(url);
  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const wait = (lastCall.get(u.host) ?? 0) + minIntervalMs - Date.now();
    if (wait > 0) await sleep(wait);
    lastCall.set(u.host, Date.now());
    try {
      const res = await fetch(u, {
        method: body === undefined ? "GET" : "POST",
        body: body === undefined ? undefined : JSON.stringify(body),
        headers: {
          accept: "application/json",
          "user-agent": "juri-indexer/0.1",
          ...(body === undefined ? {} : { "content-type": "application/json" }),
          ...headers,
        },
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (res.ok) return (await res.json()) as T;
      const text = await res.text();
      const err = new HttpError(res.status, u.toString(), text);
      if (res.status !== 429 && res.status < 500) throw err; // not retryable
      lastErr = err;
      const ra = Number(res.headers.get("retry-after"));
      if (Number.isFinite(ra) && ra > 0) {
        await sleep(ra * 1000);
        continue;
      }
    } catch (e) {
      if (e instanceof HttpError && e.status !== 429 && e.status < 500) throw e;
      lastErr = e;
    }
    if (attempt < retries) await sleep(Math.min(60_000, 2000 * 2 ** attempt) + Math.random() * 500);
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}
