"use client";

/**
 * Evidence + attestation drawer for one juror (FR-I3). The evidence blob is fetched from the Assay API;
 * "Verify" re-hashes the raw blob bytes and the attestation fields in this browser and compares both
 * with the hashes this juror revealed on chain.
 */
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { ContractJob, Criterion, Evidence, JurorView } from "@juri/shared";
import { attestationHashOf, chainJob, hashBlob, modelName, short, verifierName } from "./lib";

type Check = { label: string; ok: boolean; detail: string };

const VERDICT: Record<string, string> = { PASS: "bg-[#C8F24A]", FAIL: "bg-[#F98F68]", UNSURE: "bg-[#F2BC75]" };

export function EvidenceDrawer({ job, juror, criteria, evidence, onClose }: { job: ContractJob; juror: JurorView; criteria: Criterion[] | null; evidence: Evidence | null | undefined; onClose: () => void }) {
  const [checks, setChecks] = useState<Check[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    panel.current?.focus();
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", esc);
    return () => document.removeEventListener("keydown", esc);
  }, [onClose]);

  async function verify() {
    setBusy(true);
    setErr(null);
    try {
      const j = await chainJob(job.id);
      const reveal = j?.reveals.find((r) => r.verifier === juror.verifier);
      if (!reveal) {
        setErr("This juror hasn’t revealed on chain yet, so there is nothing to compare against.");
        return;
      }
      const out: Check[] = [];
      const got = await hashBlob(reveal.evidence_hash);
      out.push({ label: "Evidence blob", ok: got === reveal.evidence_hash, detail: `sha256 ${short(got)} vs on-chain ${short(reveal.evidence_hash)}` });
      if (evidence?.attestation) {
        const ah = await attestationHashOf(evidence.attestation);
        out.push({ label: "Attestation fields", ok: !!reveal.attestation_hash && ah === reveal.attestation_hash, detail: reveal.attestation_hash ? `hash ${short(ah)} vs on-chain ${short(reveal.attestation_hash)}` : "no attestation hash was revealed" });
      }
      out.push({ label: "Same deliverable", ok: evidence?.deliverable_hash === j!.deliverable_hash, detail: `judged ${short(evidence?.deliverable_hash ?? "–")}` });
      out.push({ label: "Same criteria", ok: evidence?.criteria_hash === j!.criteria_hash, detail: `judged ${short(evidence?.criteria_hash ?? "–")}` });
      setChecks(out);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Verification failed.");
    } finally {
      setBusy(false);
    }
  }

  const textOf = (id: string) => criteria?.find((c) => c.id === id)?.text;
  const a = evidence?.attestation;

  return createPortal(
    <div className="fixed inset-0 z-[60] flex justify-end bg-[#0D0F14]/45" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={panel} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="ev-title" className="drawer-in h-full w-full max-w-xl overflow-y-auto bg-surface p-6 shadow-2xl outline-none">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="font-mono text-xs uppercase tracking-[0.12em] text-muted">Evidence · juror {verifierName(juror.verifier)}</p>
            <h2 id="ev-title" className="mt-1 text-xl font-semibold tracking-tight">
              {modelName(juror.model)}
            </h2>
            <p className="break-all font-mono text-xs text-muted">{juror.verifier}</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-full px-2 text-2xl leading-none text-muted hover:text-ink" aria-label="Close">
            ×
          </button>
        </div>

        {evidence === undefined && <div className="skeleton mt-6 h-40 rounded-2xl" />}
        {evidence === null && <p className="mt-6 rounded-2xl bg-paper p-4 text-sm text-muted">This juror’s evidence isn’t stored on this Assay server (not judged yet, or judged by another runner).</p>}

        {evidence && (
          <div className="mt-5 space-y-5">
            <div className="grid grid-cols-3 gap-2 text-xs">
              <Fact k="Provider" v={evidence.provider} />
              <Fact k="Latency" v={`${(evidence.latency_ms / 1000).toFixed(1)} s`} />
              <Fact k="Tokens" v={evidence.usage ? `${evidence.usage.prompt_tokens}+${evidence.usage.completion_tokens}` : "–"} />
            </div>

            <section>
              <h3 className="text-sm font-semibold">Verdicts</h3>
              <ul className="mt-2 space-y-2">
                {evidence.verdicts.map((v) => (
                  <li key={v.id} className="rounded-2xl border border-rule p-3">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-semibold">{v.id}</span>
                      <span className={`rounded-full px-2 py-0.5 text-[0.6875rem] font-bold text-[#0D0F14] ${VERDICT[v.verdict]}`}>{v.verdict}</span>
                      <span className="text-[0.6875rem] text-muted">
                        {v.source === "rule" ? "deterministic rule" : v.source === "fallback" ? "fallback" : "model"}
                        {v.confidence !== null && ` · confidence ${Math.round(v.confidence * 100)}%`}
                      </span>
                    </div>
                    {textOf(v.id) && <p className="mt-1 text-xs text-muted">{textOf(v.id)}</p>}
                    {v.reason && <p className="mt-1.5 text-sm">{v.reason}</p>}
                    {v.evidence && <blockquote className="mt-1.5 border-l-2 border-rule pl-2 font-mono text-xs text-muted">{v.evidence}</blockquote>}
                  </li>
                ))}
              </ul>
            </section>

            {Object.keys(evidence.facts).length > 0 && (
              <section>
                <h3 className="text-sm font-semibold">Measured facts</h3>
                <ul className="mt-2 divide-y divide-rule rounded-2xl border border-rule text-xs">
                  {Object.entries(evidence.facts).map(([k, f]) => (
                    <li key={k} className="flex items-baseline justify-between gap-3 px-3 py-2">
                      <span className="font-mono">
                        {k} · {f.rule}
                      </span>
                      <span className={f.pass ? "text-[#3d6b0a]" : "text-bad"}>
                        {typeof f.value === "object" ? JSON.stringify(f.value).slice(0, 60) : String(f.value)} {f.pass ? "✓" : "✗"}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            <section>
              <h3 className="text-sm font-semibold">Injection check</h3>
              <p className="mt-1 text-sm">
                {evidence.injection_flag ? <span className="font-semibold text-bad">Flagged: hidden instructions to evaluators found.</span> : "Not flagged."}{" "}
                <span className="text-muted">
                  Pre-scan: {evidence.prescan.hits.length} hit{evidence.prescan.hits.length === 1 ? "" : "s"}.
                </span>
              </p>
              {evidence.injection_evidence && <blockquote className="mt-1.5 border-l-2 border-[#F98F68] pl-2 font-mono text-xs">{evidence.injection_evidence}</blockquote>}
            </section>

            <section className="rounded-2xl bg-[#12151F] p-4 text-[#EEF0F4]">
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-sm font-semibold">TEE attestation</h3>
                {a ? (
                  <span className={`rounded-full px-2 py-0.5 text-[0.6875rem] font-bold text-[#0D0F14] ${a.signature_valid ? "bg-[#C8F24A]" : "bg-[#F98F68]"}`}>{a.signature_valid ? "Signature valid" : "Signature invalid"}</span>
                ) : (
                  <span className="text-xs opacity-60">none</span>
                )}
              </div>
              {a ? (
                <dl className="mt-3 space-y-1.5 font-mono text-[0.6875rem]">
                  <Kv k="signing address" v={a.signing_address} />
                  <Kv k="algorithm" v={a.signing_algo} />
                  <Kv k="chat id" v={a.chat_id} />
                  <Kv k="report sha256" v={a.report_sha256} />
                  <Kv k="nonce" v={a.nonce} />
                </dl>
              ) : (
                <p className="mt-2 text-xs opacity-70">This juror’s provider returned no attestation, so only the evidence hash can be checked.</p>
              )}
              <p className="mt-3 text-[0.6875rem] opacity-60">The runner checked the signature against NEAR AI Cloud when judging. Below, this browser checks that the evidence and attestation are exactly what the juror committed to on chain.</p>
              <button type="button" onClick={verify} disabled={busy || !juror.revealed} className="mt-3 rounded-full bg-[#C8F24A] px-4 py-1.5 text-sm font-semibold text-[#0D0F14] disabled:opacity-50">
                {busy ? "Verifying…" : juror.revealed ? "Verify against chain" : "Available after reveal"}
              </button>
              {err && <p className="mt-2 text-xs text-[#F98F68]">{err}</p>}
              {checks && (
                <ul className="mt-3 space-y-1 text-xs" aria-live="polite">
                  {checks.map((c) => (
                    <li key={c.label} className="flex items-baseline gap-2">
                      <span className={c.ok ? "text-[#C8F24A]" : "text-[#F98F68]"}>{c.ok ? "✓" : "✗"}</span>
                      <span className="font-semibold">{c.label}</span>
                      <span className="truncate font-mono opacity-60">{c.detail}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <p className="font-mono text-[0.6875rem] text-muted">
              {evidence.algo} · judged {new Date(evidence.created_at).toLocaleString()} · evidence {juror.evidence_sha ? short(juror.evidence_sha) : "–"}
            </p>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}

function Fact({ k, v }: { k: string; v: string }) {
  return (
    <div className="rounded-xl border border-rule p-2">
      <p className="text-muted">{k}</p>
      <p className="mt-0.5 truncate font-mono">{v}</p>
    </div>
  );
}

function Kv({ k, v }: { k: string; v: string }) {
  return (
    <div className="grid grid-cols-[7.5rem_minmax(0,1fr)] gap-2">
      <dt className="opacity-60">{k}</dt>
      <dd className="break-all">{v}</dd>
    </div>
  );
}
