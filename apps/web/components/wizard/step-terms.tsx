"use client";

/** Step 3 · Set the stakes: amount, worker, payout rule, deadline, jury (07 §2.8 step 3). */
import { useEffect, useState } from "react";
import type { ContractParams, VerifierView } from "@juri/shared";
import { accountExists, formatNear, isAccountId, mulBps, parseNear } from "@/lib/wallet/near";
import { deadlineSecs, toLocalInput, type Draft } from "./draft";
import { Card, Eyebrow, Hand, inputCls, Num, Row } from "./ui";

export function feeSplit(amount: bigint, p: ContractParams) {
  const fee = mulBps(amount, p.fee_bps);
  const pool = mulBps(fee, p.jury_share_bps);
  return { fee, pool, treasury: fee - pool, net: amount - fee };
}

export function termsError(d: Draft, p: ContractParams | null, me: string | null): string | null {
  const a = parseNear(d.amount);
  if (a === null || a <= 0n) return "Enter the escrow amount in NEAR.";
  if (p && a < BigInt(p.min_amount)) return `The minimum escrow is ${formatNear(p.min_amount)} NEAR.`;
  if (!isAccountId(d.worker.trim())) return "Enter the worker's NEAR account, e.g. worker.testnet.";
  if (me && d.worker.trim() === me) return "The worker can't be the account that funds the job.";
  const s = deadlineSecs(d.deadline);
  if (!Number.isFinite(s) || s < 60) return "The submit deadline must be at least a minute from now.";
  if (s > 30 * 86_400) return "The submit deadline can be at most 30 days from now.";
  return null;
}

export function StepTerms({ d, set, params, verifiers, me, criteriaHash }: { d: Draft; set: (p: Partial<Draft>) => void; params: ContractParams | null; verifiers: VerifierView[] | null; me: string | null; criteriaHash: string | null }) {
  const [workerOk, setWorkerOk] = useState<boolean | null>(null);
  const amount = parseNear(d.amount) ?? 0n;
  const split = params ? feeSplit(amount, params) : null;
  const active = verifiers?.filter((v) => v.active) ?? [];
  const juryN = params?.jury_size ?? 3;
  const majority = Math.floor(juryN / 2) + 1;
  const err = termsError(d, params, me);

  useEffect(() => {
    const w = d.worker.trim();
    if (!isAccountId(w)) return setWorkerOk(null);
    let live = true;
    const t = setTimeout(() => void accountExists(w).then((ok) => live && setWorkerOk(ok)), 400);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [d.worker]);

  const presets: [string, string][] = d.market?.budget && d.market.token?.toUpperCase() === "NEAR" ? [[`Market budget · ${d.market.budget}`, d.market.budget]] : [];

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_22rem]">
      <Card>
        <h2 className="text-xl font-semibold tracking-tight">Terms</h2>
        <p className="text-sm text-muted">Money, deadlines and who judges. All of it is written into the escrow when you fund.</p>

        <div className="mt-6 grid gap-5 sm:grid-cols-2">
          <div>
            <label htmlFor="amt" className="flex items-center gap-2 text-sm font-medium">
              <Num n={1} /> Escrow amount
            </label>
            <div className="mt-1.5 flex items-baseline gap-2 rounded-xl border border-rule px-3 py-2 focus-within:border-ink">
              <input id="amt" inputMode="decimal" value={d.amount} onChange={(e) => set({ amount: e.target.value.replace(",", ".") })} placeholder="5.00" className="min-w-0 flex-1 bg-transparent text-3xl font-semibold tracking-tight outline-none" />
              <span className="font-mono text-sm text-muted">NEAR</span>
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {presets.map(([label, v]) => (
                <button key={label} type="button" onClick={() => set({ amount: v })} className={`rounded-full border px-2.5 py-0.5 text-xs ${d.amount === v ? "border-ink bg-[#C8F24A]" : "border-rule"}`}>
                  {label}
                </button>
              ))}
              {params && <span className="px-1 py-0.5 text-xs text-muted">min {formatNear(params.min_amount)} NEAR</span>}
            </div>
          </div>
          <div>
            <label htmlFor="wkr" className="flex items-center gap-2 text-sm font-medium">
              <Num n={2} /> Worker
            </label>
            <input id="wkr" value={d.worker} onChange={(e) => set({ worker: e.target.value.trim().toLowerCase() })} placeholder="worker.testnet" spellCheck={false} className={`mt-1.5 font-mono text-sm ${inputCls}`} />
            <p className={`mt-1.5 text-xs ${workerOk === false ? "text-bad" : "text-muted"}`}>
              {workerOk === false ? "No such account on this network." : workerOk ? "✓ Account exists. Only this account can submit; funds can never go to anyone else." : "Only this account can submit. Funds can never go to anyone else."}
            </p>
          </div>
        </div>

        <fieldset className="mt-6">
          <legend className="flex items-center gap-2 text-sm font-medium">
            <Num n={3} /> Payout rule
          </legend>
          <div className="mt-2 grid gap-3 sm:grid-cols-2">
            <div className="rounded-2xl border-2 border-ink p-4">
              <p className="font-semibold">◉ All-or-nothing</p>
              <p className="mt-1 text-sm text-muted">Release the full escrow only if every MUST criterion passes. Otherwise refund, minus the jury fee.</p>
            </div>
            <div className="rounded-2xl border border-rule p-4 opacity-60" aria-disabled>
              <p className="font-semibold">
                ○ Graded payout <span className="ml-1 rounded-full bg-[#F2BC75] px-1.5 py-0.5 text-[0.625rem] font-bold text-[#0D0F14]">SOON</span>
              </p>
              <p className="mt-1 text-sm text-muted">Release a share per passed SHOULD criterion. Partial work, partial pay.</p>
            </div>
          </div>
        </fieldset>

        <fieldset className="mt-6">
          <legend className="flex items-center gap-2 text-sm font-medium">
            <Num n={4} /> Deadlines
          </legend>
          <div className="mt-2 grid gap-3 sm:grid-cols-3">
            <label className="rounded-2xl border border-rule p-3 text-xs text-muted focus-within:border-ink">
              Submit by
              <input type="datetime-local" value={d.deadline} min={toLocalInput(new Date(Date.now() + 120_000))} onChange={(e) => set({ deadline: e.target.value })} className="mt-1 block w-full bg-transparent font-mono text-sm text-ink outline-none" />
            </label>
            <div className="rounded-2xl border border-rule bg-paper p-3 text-xs text-muted">
              Commit window
              <p className="mt-1 font-mono text-sm text-ink">{params ? `${params.commit_secs} s` : "–"}</p>
            </div>
            <div className="rounded-2xl border border-rule bg-paper p-3 text-xs text-muted">
              Reveal window
              <p className="mt-1 font-mono text-sm text-ink">{params ? `${params.reveal_secs} s` : "–"}</p>
            </div>
          </div>
          <p className="mt-2 text-xs text-muted">No submission by the deadline → the escrow refunds in full, no fee.</p>
        </fieldset>

        <fieldset className="mt-6">
          <legend className="flex items-center gap-2 text-sm font-medium">
            <Num n={5} /> AI jury
          </legend>
          <p className="mt-2 text-sm">
            <span className="font-semibold">{juryN} jurors</span> <span className="text-muted">· majority {majority} / {juryN}</span>
          </p>
          <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {(verifiers ?? []).map((v) => (
              <div key={v.account_id} className={`rounded-xl border p-2.5 text-xs ${v.active ? "border-rule" : "border-dashed border-rule opacity-50"}`}>
                <p className="truncate font-mono">{v.account_id.split(".")[0]}</p>
                <p className="mt-0.5 truncate font-medium" title={v.model}>
                  {v.model.split("/").pop()}
                </p>
                {v.attested && <p className="mt-0.5 text-[0.625rem] text-[#3d6b0a]">TEE attested</p>}
              </div>
            ))}
            {verifiers === null && <p className="text-sm text-muted">Loading verifiers…</p>}
          </div>
          <p className="mt-2 text-xs text-muted">
            {juryN} of {active.length || "the"} active verifiers are drawn at random when the work is submitted. You can’t pick individual jurors; that’s the point.
          </p>
        </fieldset>

        {err && (d.amount || d.worker) && (
          <p role="alert" className="mt-5 text-sm text-bad">
            {err}
          </p>
        )}
      </Card>

      <div className="space-y-5">
        <Card tone="navy">
          <Eyebrow>Where {formatNear(amount)} Ⓝ goes</Eyebrow>
          {split && params ? (
            <div className="mt-3 divide-y divide-white/10">
              <Row k="Escrow" v={`${formatNear(amount, 4)} Ⓝ`} />
              <Row k={`Jury fee · ${params.fee_bps / 100}%`} v={`− ${formatNear(split.fee, 4)} Ⓝ`} />
              <Row k={<span className="pl-3">Jury pool · {params.jury_share_bps / 100}%</span>} v={`${formatNear(split.pool, 4)} Ⓝ`} />
              <Row k={<span className="pl-3">Treasury</span>} v={`${formatNear(split.treasury, 4)} Ⓝ`} />
              <Row k={<span className="text-[#C8F24A]">To worker · if released</span>} v={<span className="text-[#C8F24A]">{formatNear(split.net, 4)} Ⓝ</span>} strong />
              <Row k={<span className="text-[#F98F68]">Back to you · if refunded</span>} v={<span className="text-[#F98F68]">{formatNear(split.net, 4)} Ⓝ</span>} strong />
            </div>
          ) : (
            <p className="mt-3 text-sm opacity-70">Loading contract parameters…</p>
          )}
        </Card>

        <Card>
          <h3 className="font-semibold">How this job will run</h3>
          <ol className="mt-3 space-y-3 border-l border-rule pl-4 text-sm">
            {[
              ["Funded", "On step 4 · today"],
              ["Submitted", `by ${new Date(d.deadline).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}`],
              ["Judging", params ? `~${Math.ceil((params.commit_secs + params.reveal_secs) / 60) + 1} min · commit, then reveal` : "commit, then reveal"],
              ["Settled", "Released or refunded · pull payment"],
            ].map(([a, b]) => (
              <li key={a} className="relative">
                <span aria-hidden className="absolute -left-[1.3rem] top-1.5 size-2 rounded-full bg-ink" />
                <p className="font-medium">{a}</p>
                <p className="text-xs text-muted">{b}</p>
              </li>
            ))}
          </ol>
        </Card>

        <Card tone="peach">
          <Hand>the fee only pays for judging</Hand>
          <p className="mt-2 text-sm">Jurors are paid by how closely their votes match the final verdict, so agreeing blindly doesn’t pay.</p>
        </Card>
        {criteriaHash && <p className="px-2 font-mono text-xs text-muted">Criteria locked · {criteriaHash.slice(0, 12)}…{criteriaHash.slice(-8)}</p>}
      </div>
    </div>
  );
}
