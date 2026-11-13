import type { Insight } from "@juri/shared";

/** Plain-language copy for each metric id (05 §4 / phase0-findings §Metrics). */
export const METRIC_COPY: Record<string, { title: string; sentence: string }> = {
  M1: { title: "Delivery rate", sentence: "of jobs ever posted on the market were delivered" },
  M2: { title: "Refunds per deposit", sentence: "refund legs for every deposit leg settled through escrow.ai.near" },
  M3: { title: "Top-10 concentration", sentence: "of delivered jobs went to the 10 busiest agents" },
  M4: { title: "Agents without a track record", sentence: "of listed agents have no delivered job a buyer can check" },
  M5: { title: "Agents with a dispute", sentence: "of rated agents had at least one dispute" },
  M6: { title: "Failed escrow transactions", sentence: "of transactions touching escrow.ai.near failed" },
};

export const metricCopy = (id: string) => METRIC_COPY[id] ?? { title: id, sentence: "" };

const nf = new Intl.NumberFormat("en-US");
export const count = (n: number | null | undefined) => (n === null || n === undefined ? "–" : nf.format(n));

export function formatValue(m: Pick<Insight, "value" | "unit">): string {
  if (m.value === null) return "–";
  if (m.unit === "ratio") {
    const pct = m.value * 100;
    return `${pct >= 99.5 && pct < 100 ? pct.toFixed(2) : pct < 10 && pct > 0 ? pct.toFixed(1) : Math.round(pct)}%`;
  }
  return nf.format(m.value);
}

export function shortDate(iso: string | null | undefined): string {
  if (!iso) return "–";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}

export function dateTime(iso: string | null | undefined): string {
  if (!iso) return "–";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return `${d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" })}, ${d
    .toISOString()
    .slice(11, 16)} UTC`;
}

export function duration(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined) return "–";
  if (seconds < 3600) return `${Math.round(seconds / 60)} min`;
  if (seconds < 86400 * 2) return `${Math.round(seconds / 3600)} h`;
  return `${Math.round(seconds / 86400)} days`;
}

/** First 6 + last 4 characters, for hashes and long account ids. */
export const middle = (s: string, head = 6, tail = 4) => (s.length <= head + tail + 1 ? s : `${s.slice(0, head)}…${s.slice(-tail)}`);

export const REPO_URL = "https://github.com/dharumahendra/assay";
export const repoFile = (path: string) => `${REPO_URL}/blob/main/${path}`;
export const reportIssueUrl = (subject: string) =>
  `${REPO_URL}/issues/new?title=${encodeURIComponent(`Data error: ${subject}`)}&body=${encodeURIComponent(
    `What looks wrong about ${subject}?\n\nWhat should it be, and where can we check it?\n`,
  )}`;
