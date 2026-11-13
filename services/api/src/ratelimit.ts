import type { MiddlewareHandler } from "hono";
import { getConnInfo } from "@hono/node-server/conninfo";

/**
 * Fixed-window rate limit per IP (05 §8: GET 60/min, POST /blobs 20/min). In-memory: fine for a
 * single API container; T7.3 may replace it.
 */
export function rateLimit(opts: { name: string; max: number; windowMs?: number }): MiddlewareHandler {
  const windowMs = opts.windowMs ?? 60_000;
  const hits = new Map<string, { start: number; n: number }>();
  return async (c, next) => {
    let ip = c.req.header("x-forwarded-for")?.split(",")[0]?.trim();
    if (!ip) {
      try {
        ip = getConnInfo(c).remote.address;
      } catch {
        /* not running on node-server (tests) */
      }
    }
    const key = ip ?? "local";
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
