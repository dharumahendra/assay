import type { Context, MiddlewareHandler } from "hono";
import { getConnInfo } from "@hono/node-server/conninfo";

/**
 * Client IP for rate limiting. X-Forwarded-For is client-controlled, so it is only used when the API runs
 * behind `trustProxy` reverse proxies (TRUST_PROXY=1 on Railway/Fly). Each proxy appends the address it saw,
 * so the client is the entry `trustProxy` places from the right; anything further left could be forged.
 */
export function clientIp(c: Context, trustProxy = 0): string {
  if (trustProxy > 0) {
    const xff = (c.req.header("x-forwarded-for") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
    const ip = xff[xff.length - trustProxy];
    if (ip) return ip;
  }
  try {
    return getConnInfo(c).remote.address ?? "local";
  } catch {
    return "local"; // not running on node-server (tests)
  }
}

/**
 * Fixed-window rate limit per IP (05 §8: GET 60/min, POST /blobs 20/min, compile 5/min). In-memory: fine for
 * a single API container.
 */
export function rateLimit(opts: { name: string; max: number; windowMs?: number; trustProxy?: number }): MiddlewareHandler {
  const windowMs = opts.windowMs ?? 60_000;
  const hits = new Map<string, { start: number; n: number }>();
  return async (c, next) => {
    const key = clientIp(c, opts.trustProxy ?? 0);
    const now = Date.now();
    const cur = hits.get(key);
    const w = cur && now - cur.start < windowMs ? cur : { start: now, n: 0 };
    w.n += 1;
    hits.set(key, w);
    if (hits.size > 10_000) for (const [k, v] of hits) if (now - v.start >= windowMs) hits.delete(k);
    c.header("x-ratelimit-limit", String(opts.max));
    c.header("x-ratelimit-remaining", String(Math.max(0, opts.max - w.n)));
    if (w.n > opts.max) {
      c.header("retry-after", String(Math.ceil((w.start + windowMs - now) / 1000)));
      return c.json({ error: { code: "rate_limited", message: `Too many requests (${opts.name}), try again later.` } }, 429);
    }
    await next();
  };
}
