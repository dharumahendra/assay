/** Wizard state for /protected/new, kept in sessionStorage so a reload or wallet redirect keeps the draft. */
import type { CriteriaDoc } from "@/lib/criteria";

export type Format = "markdown" | "json" | "csv" | "url" | "other";
export const FORMATS: [Format, string][] = [
  ["markdown", "Markdown"],
  ["json", "JSON"],
  ["csv", "CSV"],
  ["url", "URL"],
  ["other", "Other text"],
];

export interface MarketMeta {
  id: string;
  title: string | null;
  url: string;
  budget: string | null;
  token: string | null;
  creator: string | null;
  created_at: string | null;
  tags: string[];
}

export interface Draft {
  step: 1 | 2 | 3 | 4;
  source: "market" | "text";
  marketInput: string;
  market: MarketMeta | null;
  title: string;
  description: string;
  format: Format;
  doc: CriteriaDoc | null;
  /** brief the doc was compiled from; a different brief means the criteria are stale */
  compiledFor: string | null;
  compileMs: number | null;
  amount: string;
  worker: string;
  /** datetime-local value, local time */
  deadline: string;
  agree: boolean;
}

const KEY = "assay:new-protected-job";

const inTwoDays = () => {
  const d = new Date(Date.now() + 2 * 86_400_000);
  d.setMinutes(0, 0, 0);
  return toLocalInput(d);
};

export const toLocalInput = (d: Date) => {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};

export const emptyDraft = (): Draft => ({
  step: 1,
  source: "market",
  marketInput: "",
  market: null,
  title: "",
  description: "",
  format: "markdown",
  doc: null,
  compiledFor: null,
  compileMs: null,
  amount: "",
  worker: "",
  deadline: inTwoDays(),
  agree: false,
});

export function loadDraft(): Draft | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    return raw ? { ...emptyDraft(), ...(JSON.parse(raw) as Partial<Draft>) } : null;
  } catch {
    return null;
  }
}

export function saveDraft(d: Draft) {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(d));
  } catch {
    /* private mode: the draft just isn't kept */
  }
}

export function clearDraft() {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}

export const briefKey = (d: Pick<Draft, "source" | "market" | "title" | "description">) =>
  `${d.source}|${d.market?.id ?? ""}|${d.title.trim()}|${d.description.trim()}`;

/** UUID from a market.near.ai job URL or a bare id. */
export function marketIdFrom(s: string): string | null {
  const m = s.trim().match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
  return m ? m[0].toLowerCase() : null;
}

export const deadlineSecs = (deadline: string) => Math.round((new Date(deadline).getTime() - Date.now()) / 1000);
