/** Helpers for the protected-job detail page (T6.3). Browser-only hashing; no server trust needed for "Verify". */
import type { ContractJob, Evidence, ProtectedDetail } from "@juri/shared";
import { canonicalJson, sha256Hex, view } from "@/lib/wallet/near";

export type Detail = ProtectedDetail;

/** Contract status → UI label (07 §1.4). */
export function uiStatus(j: ContractJob): string {
  if (j.status === "Committing") return "Judging";
  if (j.status === "Settled") return j.outcome === "RefundedNoFee" ? "Refunded" : (j.outcome ?? "Settled");
  return j.status;
}

export const TONE: Record<string, string> = {
  Funded: "bg-[#BDE5F7]",
  Submitted: "bg-[#F2BC75]",
  Judging: "bg-[#F2BC75]",
  Stalled: "bg-[#F98F68]",
  Released: "bg-[#C8F24A]",
  Refunded: "bg-[#F98F68]",
  Split: "bg-[#A9C3A9]",
  Cancelled: "bg-[#D9DCE3]",
  Expired: "bg-[#D9DCE3]",
};

export const FINAL = new Set(["Settled", "Cancelled", "Expired"]);

export const nsMs = (ns: string | null | undefined) => (ns ? Number(BigInt(ns) / 1_000_000n) : null);

export function when(ms: number | null): string {
  if (ms === null) return "–";
  return new Date(ms).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function relative(ms: number): string {
  const s = Math.round((ms - Date.now()) / 1000);
  const a = Math.abs(s);
  const t = a < 90 ? `${a}s` : a < 5400 ? `${Math.round(a / 60)} min` : a < 172_800 ? `${Math.round(a / 3600)} h` : `${Math.round(a / 86_400)} days`;
  return s >= 0 ? `in ${t}` : `${t} ago`;
}

const hex = (buf: ArrayBuffer) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
export const sha256Bytes = async (buf: ArrayBuffer) => hex(await crypto.subtle.digest("SHA-256", buf));

/** Downloads a blob from the Assay API and hashes its bytes in this browser. */
export async function hashBlob(sha: string): Promise<string> {
  const r = await fetch(`/api/blobs/${sha}`);
  if (!r.ok) throw new Error(r.status === 404 ? "The blob is not stored on this Assay server." : `The Assay API answered ${r.status}.`);
  return sha256Bytes(await r.arrayBuffer());
}

/** Reads the job straight from the contract over NEAR RPC, so the expected hash doesn't come from Assay's API. */
export const chainJob = (id: number) => view<ContractJob | null>("get_job", { job_id: id });

/** Attestation hash as sent with reveal_vote (shared/criteria.ts attestationHash). */
export async function attestationHashOf(a: NonNullable<Evidence["attestation"]>): Promise<string> {
  return sha256Hex(canonicalJson({ report_sha256: a.report_sha256, chat_id: a.chat_id, signing_address: a.signing_address, signature: a.signature }));
}

export const short = (s: string, head = 8, tail = 6) => (s.length <= head + tail + 1 ? s : `${s.slice(0, head)}…${s.slice(-tail)}`);
export const verifierName = (v: string) => v.split(".")[0];
export const modelName = (m: string | null) => (m ? m.split("/").pop()! : "–");
