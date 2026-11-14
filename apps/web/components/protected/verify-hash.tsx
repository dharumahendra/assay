"use client";

/**
 * "Verify": reads the expected hash from the contract over NEAR RPC, downloads the blob,
 * and hashes its bytes with crypto.subtle in this browser. Nothing here trusts Assay's own check.
 * Drawn as the frame's hash pill: "criteria · 9f2c…a71e  [copy] [Verify]".
 */
import { useState } from "react";
import { Copy, Shield } from "@/components/icons";
import { chainJob, hashBlob, short } from "./lib";

type State = { s: "idle" } | { s: "busy" } | { s: "ok"; hash: string } | { s: "bad"; expected: string; got: string } | { s: "err"; msg: string };

export function VerifyHash({ jobId, field, hash, dark }: { jobId: number; field: "criteria_hash" | "deliverable_hash"; hash?: string | null; dark?: boolean }) {
  const [st, setSt] = useState<State>({ s: "idle" });
  const [copied, setCopied] = useState(false);

  async function run() {
    setSt({ s: "busy" });
    try {
      const j = await chainJob(jobId);
      const expected = j?.[field];
      if (!expected) return setSt({ s: "err", msg: "The contract has no hash for this yet." });
      const got = await hashBlob(expected);
      setSt(got === expected ? { s: "ok", hash: got } : { s: "bad", expected, got });
    } catch (e) {
      setSt({ s: "err", msg: e instanceof Error ? e.message : "Verification failed." });
    }
  }

  const label = field === "criteria_hash" ? "criteria" : "deliverable";
  return (
    <span className="inline-flex flex-col items-end gap-1.5 text-xs">
      <span className={`inline-flex items-center gap-2 rounded-full border py-1 pl-3 pr-1 font-mono ${dark ? "border-white/20" : "border-rule bg-surface"}`}>
        <span className="text-muted">
          {label}
          {hash && ` · ${short(hash, 4, 4)}`}
        </span>
        {hash && (
          <button
            type="button"
            title={copied ? "Copied" : "Copy full hash"}
            aria-label="Copy full hash"
            className="text-faint hover:text-ink"
            onClick={() => {
              navigator.clipboard
                .writeText(hash)
                .then(() => {
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1400);
                })
                .catch(() => {});
            }}
          >
            <Copy size={13} />
          </button>
        )}
        <button
          type="button"
          onClick={run}
          disabled={st.s === "busy"}
          className="inline-flex items-center gap-1 rounded-full bg-ink px-2.5 py-1 font-sans font-semibold text-white disabled:opacity-60"
        >
          <Shield size={12} className="text-lime" />
          {st.s === "busy" ? "Hashing…" : "Verify"}
        </button>
      </span>
      <span aria-live="polite">
        {st.s === "ok" && (
          <span className="rounded-full bg-lime px-2 py-0.5 font-semibold text-ink" title={st.hash}>
            ✓ sha256 matches on-chain {short(st.hash, 6, 4)}
          </span>
        )}
        {st.s === "bad" && (
          <span className="rounded-full bg-salmon px-2 py-0.5 font-semibold text-ink" title={`expected ${st.expected}\ngot ${st.got}`}>
            ✗ Mismatch: the stored bytes don’t hash to the on-chain value
          </span>
        )}
        {st.s === "err" && <span className="text-bad">{st.msg}</span>}
      </span>
    </span>
  );
}
