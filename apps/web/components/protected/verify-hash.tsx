"use client";

/**
 * "Verify hash": reads the expected hash from the contract over NEAR RPC, downloads the blob,
 * and hashes its bytes with crypto.subtle in this browser. Nothing here trusts Assay's own check.
 */
import { useState } from "react";
import { chainJob, hashBlob, short } from "./lib";

type State = { s: "idle" } | { s: "busy" } | { s: "ok"; hash: string } | { s: "bad"; expected: string; got: string } | { s: "err"; msg: string };

export function VerifyHash({ jobId, field, dark }: { jobId: number; field: "criteria_hash" | "deliverable_hash"; dark?: boolean }) {
  const [st, setSt] = useState<State>({ s: "idle" });

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

  const btn = dark ? "border-white/25 hover:border-white/70" : "border-rule hover:border-ink";
  return (
    <span className="inline-flex flex-wrap items-center gap-2 text-xs">
      <button type="button" onClick={run} disabled={st.s === "busy"} className={`rounded-full border px-2.5 py-0.5 font-medium ${btn} disabled:opacity-60`}>
        {st.s === "busy" ? "Hashing…" : "Verify hash"}
      </button>
      <span aria-live="polite">
        {st.s === "ok" && (
          <span className="rounded-full bg-[#C8F24A] px-2 py-0.5 font-semibold text-[#0D0F14]" title={st.hash}>
            ✓ sha256 matches on-chain {short(st.hash, 6, 4)}
          </span>
        )}
        {st.s === "bad" && (
          <span className="rounded-full bg-[#F98F68] px-2 py-0.5 font-semibold text-[#0D0F14]" title={`expected ${st.expected}\ngot ${st.got}`}>
            ✗ Mismatch: the stored bytes don’t hash to the on-chain value
          </span>
        )}
        {st.s === "err" && <span className="text-bad">{st.msg}</span>}
      </span>
    </span>
  );
}
