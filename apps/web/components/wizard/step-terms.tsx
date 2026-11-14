"use client";

/** Step 3 · Set the stakes: amount, worker, payout rule, deadline, jury (07 §2.8 step 3). */
import { useEffect, useState } from "react";
import type { ContractParams, VerifierView } from "@juri/shared";
import { Clock, Eye, Lock, Shield } from "@/components/icons";
import { accountExists, formatNear, isAccountId, mulBps, NETWORK, parseNear } from "@/lib/wallet/near";
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

const legend = "flex items-center gap-2 font-medium";
const tile = "rounded-2xl border border-rule bg-surface-2 px-4 py-3 text-sm text-muted";

export function StepTerms({ d, set, params, verifiers, me, criteriaHash }: { d: Draft; set: (p: Partial<Draft>) => void; params: ContractParams | null; verifiers: VerifierView[] | null; me: string | null; criteriaHash: string | null }) {
  const [workerOk, setWorkerOk] = useState<boolean | null>(null);
  const amount = parseNear(d.amount) ?? 0n;
  const split = params ? feeSplit(amount, params) : null;
  const active = verifiers?.filter((v) => v.active) ?? [];
  const juryN = params?.jury_size ?? 3;
  const majority = Math.floor(juryN / 2) + 1;
  const err = termsError(d, params, me);
  const pct = (x: bigint) => `${amount > 0n ? (Number(x) / Number(amount)) * 100 : 0}%`;

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
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_26rem]">
      <Card>
        <h2 className="display text-[1.8rem]">Terms</h2>
        <p className="text-sm text-muted">Money, deadlines and who judges. All of it is written into the escrow when you fund.</p>

        <div className="mt-6 grid gap-5 sm:grid-cols-2">
          <div>
            <label htmlFor="amt" className={legend}>
              <Num n={1} /> Escrow amount
            </label>
            <div className="mt-2 flex items-baseline gap-2 rounded-2xl border-2 border-rule bg-surface px-5 py-3 focus-within:border-act">
              <input
                id="amt"
                inputMode="decimal"
                value={d.amount}
                onChange={(e) => set({ amount: e.target.value.replace(",", ".") })}
                placeholder="5.00"
                className="display min-w-0 flex-1 bg-transparent text-[2.6rem] leading-none outline-none"
              />
              <span className="font-mono text-sm text-muted">NEAR</span>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {presets.map(([label, v]) => (
                <button
                  key={label}
                  type="button"
                  onClick={() => set({ amount: v })}
                  className={`rounded-full border px-3.5 py-1.5 text-sm font-medium ${d.amount === v ? "border-lime bg-lime" : "border-rule bg-surface hover:border-ink"}`}
                >
                  {label}
                </button>
              ))}
              {params && <span className="px-1 text-sm text-muted">min {formatNear(params.min_amount)} NEAR</span>}
            </div>
          </div>
          <div>
            <label htmlFor="wkr" className={legend}>
              <Num n={2} /> Worker
            </label>
            <input
              id="wkr"
              value={d.worker}
              onChange={(e) => set({ worker: e.target.value.trim().toLowerCase() })}
              placeholder="worker.testnet"
              spellCheck={false}
              className={`mt-2 font-mono text-[0.9375rem] ${inputCls} py-[1.1rem]`}
            />
            {NETWORK === "testnet" && !d.worker && (
              <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs">
                <span className="text-muted">Demo worker:</span>
                <button type="button" onClick={() => set({ worker: "demo-worker-honest.juri-assay-jdir.testnet" })} className="rounded-full border border-rule bg-surface px-3 py-1 font-mono hover:border-ink">
                  demo-worker-honest…
                </button>
              </div>
            )}
            <p className={`mt-2 text-sm ${workerOk === false ? "text-bad" : "text-muted"}`}>
              {workerOk === false
                ? "No such account on this network."
                : workerOk
                  ? "✓ Account exists. Only this account can submit; funds can never go to anyone else."
                  : "The NEAR account of the agent or person doing the work (not your own). Only it can submit; funds can never go to anyone else."}
            </p>
          </div>
        </div>

        <fieldset className="mt-7">
          <legend className={legend}>
            <Num n={3} /> Payout rule
          </legend>
          <div className="mt-2 grid gap-3 sm:grid-cols-2">
            <div className="rounded-2xl border-2 border-ink bg-surface p-5">
              <p className="display flex items-center gap-2 text-[1.3rem]">
                <span aria-hidden className="grid size-5 place-items-center rounded-full border-2 border-act">
                  <span className="size-2 rounded-full bg-act" />
                </span>
                All-or-nothing
              </p>
              <p className="mt-2 text-muted">Release the full escrow only if every MUST criterion passes. Otherwise refund, minus the jury fee.</p>
            </div>
            <div className="rounded-2xl border border-rule bg-surface-2 p-5 opacity-70" aria-disabled>
              <p className="display flex items-center gap-2 text-[1.3rem] text-muted">
                <span aria-hidden className="size-5 rounded-full border-2 border-faint" />
                Graded payout
                <span className="ml-auto rounded-full bg-peach px-2.5 py-1 font-mono text-[0.625rem] font-bold tracking-wider text-ink">SOON</span>
              </p>
              <p className="mt-2 text-muted">Release a share per passed SHOULD criterion. Partial work, partial pay.</p>
            </div>
          </div>
        </fieldset>

        <fieldset className="mt-7">
          <legend className={legend}>
            <Num n={4} /> Deadlines
          </legend>
          <div className="mt-2 grid gap-3 sm:grid-cols-3">
            <label className={`${tile} focus-within:border-act`}>
              <span className="flex items-center gap-1.5">
                <Clock size={13} /> Submit by
              </span>
              <input
                type="datetime-local"
                value={d.deadline}
                min={toLocalInput(new Date(Date.now() + 120_000))}
                onChange={(e) => set({ deadline: e.target.value })}
                className="mt-1 block w-full bg-transparent font-semibold text-ink outline-none"
              />
            </label>
            <div className={tile}>
              <span className="flex items-center gap-1.5">
                <Lock size={13} /> Commit window
              </span>
              <p className="mt-1 font-mono text-lg text-ink">{params ? `${params.commit_secs} s` : "–"}</p>
            </div>
            <div className={tile}>
              <span className="flex items-center gap-1.5">
                <Eye size={13} /> Reveal window
              </span>
              <p className="mt-1 font-mono text-lg text-ink">{params ? `${params.reveal_secs} s` : "–"}</p>
            </div>
          </div>
          <p className="mt-2 text-sm text-muted">No submission by the deadline → the escrow refunds in full, no fee.</p>
        </fieldset>

        <fieldset className="mt-7">
          <legend className={legend}>
            <Num n={5} /> AI jury
          </legend>
          <div className="mt-2 rounded-2xl border border-rule bg-surface-2 p-4 sm:p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="flex items-center gap-3">
                <span className="text-muted">Jurors</span>
                <span className="rounded-xl border border-rule bg-surface px-4 py-1.5 font-semibold" title="Set by the contract for every job">
                  {juryN}
                </span>
                <span className="font-mono text-sm text-faint">
                  majority {majority} / {juryN}
                </span>
              </p>
              {active.some((v) => v.attested) && (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-rule bg-surface px-3 py-1.5 text-sm">
                  <Shield size={13} /> TEE-attested
                </span>
              )}
            </div>
            <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              {(verifiers ?? []).map((v) => (
                <div key={v.account_id} className={`rounded-xl border bg-surface px-4 py-3 ${v.active ? "border-rule" : "border-dashed border-rule opacity-50"}`}>
                  <p className="truncate font-mono text-xs text-faint">{v.account_id.split(".")[0]}</p>
                  <p className="mt-0.5 truncate text-sm font-semibold" title={v.model}>
                    {v.model.split("/").pop()}
                  </p>
                  {v.attested && <p className="mt-0.5 text-[0.625rem] text-good">TEE attested</p>}
                </div>
              ))}
              {verifiers === null && <p className="text-sm text-muted">Loading verifiers…</p>}
            </div>
            <p className="mt-3 text-sm text-muted">
              {juryN} of {active.length || "the"} active verifiers are drawn at random when the work is submitted. You can’t pick individual jurors; that’s the point.
            </p>
          </div>
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
          {split && amount > 0n && (
            <div aria-hidden className="mt-4 flex h-2 overflow-hidden rounded-full bg-white/10">
              <span className="bg-lime" style={{ width: pct(split.net) }} />
              <span className="bg-sky" style={{ width: pct(split.pool) }} />
              <span className="bg-salmon" style={{ width: pct(split.treasury) }} />
            </div>
          )}
          {split && params ? (
            <div className="mt-4 divide-y divide-white/10">
              <Row k="Escrow" v={`${formatNear(amount, 4)} Ⓝ`} />
              <Row k={`Jury fee · ${params.fee_bps / 100}%`} v={`− ${formatNear(split.fee, 4)} Ⓝ`} />
              <Row k={<Dot c="bg-sky">Jury pool · {params.jury_share_bps / 100}%</Dot>} v={`${formatNear(split.pool, 4)} Ⓝ`} />
              <Row k={<Dot c="bg-salmon">Treasury</Dot>} v={`${formatNear(split.treasury, 4)} Ⓝ`} />
              <Row k={<Dot c="bg-lime text-lime">To worker · if released</Dot>} v={<span className="text-lime">{formatNear(split.net, 4)} Ⓝ</span>} strong />
              <Row k={<span className="text-lime">Back to you · if refunded</span>} v={<span className="text-lime">{formatNear(split.net, 4)} Ⓝ</span>} strong />
            </div>
          ) : (
            <p className="mt-3 text-sm opacity-70">Loading contract parameters…</p>
          )}
        </Card>

        <Card>
          <h3 className="display text-[1.5rem]">How this job will run</h3>
          <ol className="ml-2 mt-4 space-y-5 border-l border-rule pl-6">
            {[
              ["Funded", "On step 4 · today"],
              ["Submitted", `by ${new Date(d.deadline).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}`],
              ["Judging", params ? `~${Math.ceil((params.commit_secs + params.reveal_secs) / 60) + 1} min · commit, then reveal` : "commit, then reveal"],
              ["Settled", "Released or refunded · pull payment"],
            ].map(([a, b]) => (
              <li key={a} className="relative">
                <span aria-hidden className={`absolute -left-[2.05rem] top-0.5 size-4 rounded-full border-2 ${a === "Funded" ? "border-ink bg-lime" : "border-rule bg-surface"}`} />
                <p className="font-semibold">{a}</p>
                <p className="text-sm text-muted">{b}</p>
              </li>
            ))}
          </ol>
        </Card>

        <Card tone="peach">
          <Hand>the fee only pays for judging</Hand>
          <p className="mt-3 text-[0.9375rem]">Jurors are paid by how closely their votes match the final verdict, so agreeing blindly doesn’t pay.</p>
        </Card>
        {criteriaHash && (
          <p className="px-2 font-mono text-xs text-muted">
            Criteria locked · {criteriaHash.slice(0, 12)}…{criteriaHash.slice(-8)}
          </p>
        )}
      </div>
    </div>
  );
}

function Dot({ c, children }: { c: string; children: React.ReactNode }) {
  const [bg, ...rest] = c.split(" ");
  return (
    <span className={`flex items-center gap-2 pl-1 ${rest.join(" ")}`}>
      <span className={`size-1.5 rounded-full ${bg}`} />
      {children}
    </span>
  );
}
