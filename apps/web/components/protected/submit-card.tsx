"use client";

/**
 * Worker's submit form (#submit). Paste text or load a file → hash in the browser → upload the blob →
 * check the server's hash matches → sign submit_deliverable with the connected wallet.
 */
import { useEffect, useState } from "react";
import type { ContractJob } from "@juri/shared";
import { TxModal } from "@/components/tx-modal";
import { useWallet } from "@/components/wallet";
import { Card } from "@/components/wizard/ui";
import { GAS, sha256Hex } from "@/lib/wallet/near";
import { short, when, nsMs, relative } from "./lib";

const MAX = 50_000;

export function SubmitCard({ job, onDone }: { job: ContractJob; onDone: () => void }) {
  const { call } = useWallet();
  const [text, setText] = useState("");
  const [hash, setHash] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [blob, setBlob] = useState<{ sha256: string; uri: string } | null>(null);
  const deadline = nsMs(job.submit_deadline)!;

  useEffect(() => {
    let live = true;
    if (!text.trim()) return setHash(null);
    const t = setTimeout(() => void sha256Hex(text).then((h) => live && setHash(h)), 250);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [text]);

  async function loadFile(f: File | undefined) {
    if (!f) return;
    if (f.size > MAX * 4) return setErr("That file is too large. Deliverables are limited to 50,000 characters.");
    setErr(null);
    setText(await f.text());
  }

  async function upload() {
    setErr(null);
    setUploading(true);
    try {
      const res = await fetch("/api/blobs", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ kind: "deliverable", content: text }) });
      if (!res.ok) throw new Error(`The Assay API refused the upload (${res.status}).`);
      const b = (await res.json()) as { sha256: string; uri: string };
      const mine = await sha256Hex(text);
      if (b.sha256 !== mine) throw new Error("The stored copy doesn’t hash to what you pasted. Nothing was signed.");
      setBlob(b);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Upload failed.");
    } finally {
      setUploading(false);
    }
  }

  const tooLong = text.length > MAX;
  return (
    <Card>
      <div id="submit" className="scroll-mt-28" />
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-xl font-semibold tracking-tight">Submit your deliverable</h2>
        <p className="text-sm text-muted">
          Due {when(deadline)} · {relative(deadline)}
        </p>
      </div>
      <p className="mt-1 text-sm text-muted">You’re the named worker. Its sha256 goes on chain, then 3 AI jurors judge it against the criteria below. You can submit once.</p>

      <textarea
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          setBlob(null);
        }}
        rows={10}
        placeholder="Paste the deliverable (Markdown, JSON, CSV or plain text)…"
        className="mt-4 w-full rounded-2xl border border-rule bg-surface p-3 font-mono text-sm leading-relaxed outline-none focus:border-ink"
      />
      <div className="mt-2 flex flex-wrap items-center justify-between gap-3 text-xs">
        <label className="cursor-pointer rounded-full border border-rule px-3 py-1 hover:border-ink">
          Load file…
          <input type="file" accept=".md,.markdown,.txt,.json,.csv,text/*,application/json" className="sr-only" onChange={(e) => void loadFile(e.target.files?.[0])} />
        </label>
        <span className={`font-mono ${tooLong ? "text-bad" : "text-muted"}`}>
          {text.length.toLocaleString()} / {MAX.toLocaleString()} chars{hash && ` · sha256 ${short(hash)}`}
        </span>
      </div>
      {err && (
        <p role="alert" className="mt-3 text-sm text-bad">
          {err}
        </p>
      )}
      <div className="mt-4 flex justify-end">
        <button type="button" disabled={!text.trim() || tooLong || uploading} onClick={() => void upload()} className="rounded-full bg-ink px-5 py-2 text-sm font-semibold text-paper disabled:opacity-40">
          {uploading ? "Uploading…" : "Review & sign"}
        </button>
      </div>

      {blob && (
        <TxModal
          open
          title={`Submit to job #${job.id}`}
          rows={[
            ["Contract call", "submit_deliverable"],
            ["Deliverable sha256", short(blob.sha256)],
            ["Size", `${text.length.toLocaleString()} chars`],
            ["Deposit", "none"],
          ]}
          note="Once on chain the deliverable can’t be changed. Judging starts automatically."
          confirmLabel="Sign & submit"
          run={() => call({ method: "submit_deliverable", args: { job_id: job.id, deliverable_hash: blob.sha256, deliverable_uri: blob.uri }, gas: GAS.default })}
          done={() => <p className="rounded-2xl bg-[#C8F24A] p-4 font-semibold text-[#0D0F14]">Submitted. The jury is being drawn; this page updates live.</p>}
          onClose={() => {
            setBlob(null);
            onDone();
          }}
        />
      )}
    </Card>
  );
}
