import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

/**
 * SSRF guard (NFR-SEC-4) for every URL Juri fetches on behalf of untrusted input
 * (deliverable URIs, `url_reachable` rules):
 * - http/https only (https only for deliverables: `httpsOnly`), default ports only, no credentials in the URL;
 * - every resolved address must be public (no loopback, private, link-local, CGNAT, multicast, metadata);
 * - optional host allowlist (DELIVERABLE_URI_ALLOWLIST) for deliverable fetches;
 * - redirects are followed manually (≤3) and re-checked; timeout; body capped at `maxChars`.
 * Residual risk: DNS can change between our lookup and fetch's own lookup (rebinding). Acceptable for the
 * testnet demo; a pinned-IP dispatcher is the fix if this runs on shared infra.
 */
export class SsrfError extends Error {
  constructor(
    readonly code: "bad_url" | "blocked_host" | "blocked_address" | "not_allowlisted" | "too_many_redirects" | "http_error" | "timeout" | "fetch_failed",
    message: string,
  ) {
    super(message);
  }
}

export interface SafeFetchOptions {
  /** Hostnames allowed (exact or subdomain match). Empty/undefined = any public host. */
  allowlist?: string[];
  maxChars?: number;
  timeoutMs?: number;
  method?: "GET" | "HEAD";
  maxRedirects?: number;
  /** Deliverable fetches (NFR-SEC-4): refuse plain http, also on redirects. */
  httpsOnly?: boolean;
  /** Test hook. */
  resolve?: (host: string) => Promise<string[]>;
  fetchImpl?: typeof fetch;
}

export interface SafeFetchResult {
  url: string;
  status: number;
  contentType: string | null;
  text: string;
  truncated: boolean;
}

const v4ToInt = (ip: string) => ip.split(".").reduce((a, o) => (a << 8) + Number(o), 0) >>> 0;
const inV4 = (ip: string, cidr: string) => {
  const [base, bits] = cidr.split("/") as [string, string];
  const mask = Number(bits) === 0 ? 0 : (~0 << (32 - Number(bits))) >>> 0;
  return (v4ToInt(ip) & mask) === (v4ToInt(base) & mask);
};
const BLOCKED_V4 = [
  "0.0.0.0/8", "10.0.0.0/8", "100.64.0.0/10", "127.0.0.0/8", "169.254.0.0/16", "172.16.0.0/12", "192.0.0.0/24",
  "192.0.2.0/24", "192.88.99.0/24", "192.168.0.0/16", "198.18.0.0/15", "198.51.100.0/24", "203.0.113.0/24",
  "224.0.0.0/4", "240.0.0.0/4",
];

/** IPv6 → 8 numeric groups (handles "::" and a trailing dotted IPv4). Null when malformed. */
function v6Groups(ip: string): number[] | null {
  let a = ip.toLowerCase().split("%")[0]!;
  const dotted = /(\d+\.\d+\.\d+\.\d+)$/.exec(a);
  if (dotted) {
    const n = v4ToInt(dotted[1]!);
    a = `${a.slice(0, dotted.index)}${(n >>> 16).toString(16)}:${(n & 0xffff).toString(16)}`;
  }
  const [head, tail, extra] = a.split("::");
  if (extra !== undefined) return null;
  const h = head ? head.split(":") : [];
  const t = tail !== undefined ? (tail ? tail.split(":") : []) : null;
  const groups = t === null ? h : [...h, ...Array(8 - h.length - t.length).fill("0"), ...t];
  if (groups.length !== 8) return null;
  const nums = groups.map((g) => parseInt(g, 16));
  return nums.some((n) => Number.isNaN(n) || n < 0 || n > 0xffff) ? null : nums;
}

export function isPublicAddress(ip: string): boolean {
  const fam = isIP(ip);
  if (fam === 4) return !BLOCKED_V4.some((c) => inV4(ip, c));
  if (fam !== 6) return false;
  const g = v6Groups(ip);
  if (!g) return false;
  const v4 = (hi: number, lo: number) => `${hi >> 8}.${hi & 0xff}.${lo >> 8}.${lo & 0xff}`;
  // ::/96 (incl. ::, ::1, IPv4-compatible) and ::ffff:0:0/96 (IPv4-mapped): judge the embedded IPv4.
  // WHATWG URL rewrites [::ffff:10.0.0.1] to [::ffff:a00:1], so the hex form must be caught too.
  if (g.slice(0, 5).every((x) => x === 0) && (g[5] === 0 || g[5] === 0xffff)) {
    if (g[5] === 0 && g[6] === 0) return false; // :: and ::1 and ::x
    return isPublicAddress(v4(g[6]!, g[7]!));
  }
  const first = g[0]!;
  if ((first & 0xfe00) === 0xfc00) return false; // fc00::/7 unique local
  if ((first & 0xffc0) === 0xfe80) return false; // fe80::/10 link local
  if ((first & 0xff00) === 0xff00) return false; // multicast
  if (first === 0x2002) return false; // 6to4 (embeds an IPv4)
  if (first === 0x2001 && g[1] === 0) return false; // Teredo
  if (first === 0x2001 && g[1] === 0xdb8) return false; // documentation
  if (first === 0x64 && g[1] === 0xff9b) return false; // NAT64
  if (first === 0x100 && g[1] === 0 && g[2] === 0 && g[3] === 0) return false; // discard-only
  return true;
}

const hostAllowed = (host: string, allowlist?: string[]) =>
  !allowlist?.length || allowlist.some((h) => host === h || host.endsWith(`.${h}`));

export async function checkUrl(raw: string, opts: Pick<SafeFetchOptions, "allowlist" | "resolve" | "httpsOnly"> = {}): Promise<URL> {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    throw new SsrfError("bad_url", `not a URL: ${raw.slice(0, 80)}`);
  }
  if (u.protocol !== "https:" && (opts.httpsOnly || u.protocol !== "http:")) throw new SsrfError("bad_url", `scheme ${u.protocol} not allowed`);
  if (u.username || u.password) throw new SsrfError("bad_url", "credentials in URL are not allowed");
  if (u.port && !["80", "443"].includes(u.port)) throw new SsrfError("bad_url", `port ${u.port} not allowed`);
  const host = u.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".internal") || host.endsWith(".local"))
    throw new SsrfError("blocked_host", `host ${host} is not public`);
  if (!hostAllowed(host, opts.allowlist)) throw new SsrfError("not_allowlisted", `host ${host} is not on the allowlist`);
  const addrs = isIP(host) ? [host] : await (opts.resolve ?? defaultResolve)(host).catch(() => {
    throw new SsrfError("fetch_failed", `cannot resolve ${host}`);
  });
  if (!addrs.length || !addrs.every(isPublicAddress)) throw new SsrfError("blocked_address", `host ${host} resolves to a non-public address`);
  return u;
}

const defaultResolve = async (host: string) => (await lookup(host, { all: true, verbatim: true })).map((r) => r.address);

export async function safeFetch(raw: string, opts: SafeFetchOptions = {}): Promise<SafeFetchResult> {
  const maxChars = opts.maxChars ?? 50_000;
  const f = opts.fetchImpl ?? fetch;
  let url = raw;
  for (let hop = 0; hop <= (opts.maxRedirects ?? 3); hop++) {
    const u = await checkUrl(url, opts);
    let res: Response;
    try {
      res = await f(u, {
        method: opts.method ?? "GET",
        redirect: "manual",
        signal: AbortSignal.timeout(opts.timeoutMs ?? 8_000),
        headers: { "user-agent": "juri-verifier/0.1", accept: "text/*, application/json;q=0.9, */*;q=0.1" },
      });
    } catch (e) {
      const timeout = e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError");
      throw new SsrfError(timeout ? "timeout" : "fetch_failed", `${u.host}: ${e instanceof Error ? e.message : String(e)}`);
    }
    if (res.status >= 300 && res.status < 400 && res.headers.get("location")) {
      url = new URL(res.headers.get("location")!, u).toString();
      await res.body?.cancel();
      continue;
    }
    const { text, truncated } = opts.method === "HEAD" ? { text: "", truncated: false } : await readCapped(res, maxChars);
    return { url: u.toString(), status: res.status, contentType: res.headers.get("content-type"), text, truncated };
  }
  throw new SsrfError("too_many_redirects", `more than ${opts.maxRedirects ?? 3} redirects`);
}

async function readCapped(res: Response, maxChars: number): Promise<{ text: string; truncated: boolean }> {
  if (!res.body) return { text: "", truncated: false };
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let text = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    text += dec.decode(value, { stream: true });
    if (text.length > maxChars) {
      await reader.cancel();
      return { text: text.slice(0, maxChars), truncated: true };
    }
  }
  text += dec.decode();
  return { text: text.slice(0, maxChars), truncated: text.length > maxChars };
}
