"use client";

/** Step 4 · Fund & lock it in: exactly what create_job will store (07 §2.8 step 4, FR-D1). */
import type { ContractParams } from "@juri/shared";
import { Braces, Check, Eye, LinkIcon, User, Undo } from "@/components/icons";
import type { CriteriaDoc } from "@/lib/criteria";
import { formatNear, parseNear, STORAGE_RESERVE } from "@/lib/wallet/near";
import { FORMATS, type Draft } from "./draft";
import { kindsOf, ruleSummary } from "./step-criteria";
import { Card, Eyebrow, Num } from "./ui";

export function StepReview({
  d,
  doc,
  set,
  params,
  me,
  balance,
  hash,
  nextJobId,
  onConnect,
}: {
  d: Draft;
  doc: CriteriaDoc;
  set: (p: Partial<Draft>) => void;
  params: ContractParams | null;
  me: string | null;
  balance: bigint | null;
  hash: string | null;
  nextJobId: number | null;
  onConnect: () => void;
}) {
  const amount = parseNear(d.amount) ?? 0n;
  const total = amount + STORAGE_RESERVE;
  const short = balance !== null && balance < total + 50_000_000_000_000_000_000_000n /* 0.05 NEAR for gas */;
  const juryN = params?.jury_size ?? 3;
  const deadline = new Date(d.deadline);
  const section = "mt-4 rounded-2xl border border-rule bg-surface-2 p-5";
  const chip = "inline-flex items-center gap-1.5 rounded-lg border border-rule bg-surface px-3 py-1.5 text-sm";
  const edit = (step: Draft["step"]) => (
    <button type="button" onClick={() => set({ step })} className="text-sm font-semibold text-act hover:underline">
      ✎ Edit
    </button>
  );

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_26rem]">
      <Card>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="display text-[1.8rem]">Review</h2>
            <p className="text-sm text-muted">This is exactly what the contract will store{nextJobId ? ` as protected job #${nextJobId}` : ""}.</p>
          </div>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-rule px-3 py-1.5 text-sm">
            <Check size={13} /> All checks passed
          </span>
        </div>

        <section className={section}>
          <div className="flex items-center justify-between">
            <h3 className="flex items-center gap-2 text-lg font-semibold">
              <Num n={1} /> Job
            </h3>
            {edit(1)}
          </div>
          <p className="mt-3 text-lg font-medium">{d.title}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <span className={chip}>
              <Braces size={13} /> {FORMATS.find(([k]) => k === d.format)?.[1]}
            </span>
            {d.market && (
              <span className={chip}>
                <LinkIcon size={13} /> market job {d.market.id.slice(0, 8)}…
              </span>
            )}
            <span className={`${chip} font-mono`}>
              <User size={13} /> {d.worker}
            </span>
          </div>
        </section>

        <section className={section}>
          <div className="flex items-center justify-between">
            <h3 className="flex items-center gap-2 text-lg font-semibold">
              <Num n={2} /> Criteria · {doc.criteria.length}
            </h3>
            {edit(2)}
          </div>
          <ol className="mt-3 overflow-hidden rounded-xl border border-rule bg-surface">
            {doc.criteria.map((c) => {
              const c0 = c.id === "C0";
              return (
                <li key={c.id} className={`flex items-center gap-3 border-b border-rule px-4 py-3 last:border-0 ${c0 ? "bg-navy text-paper" : ""}`}>
                  <span className={`w-6 font-mono text-xs ${c0 ? "text-lime" : "text-faint"}`}>{c.id}</span>
                  <span className="min-w-0 flex-1">{c.text}</span>
                  <span className={`hidden font-mono text-xs sm:inline ${c0 ? "opacity-60" : "text-faint"}`}>{ruleSummary(c)?.split(" ·")[0] ?? "AI-judged"}</span>
                  <span
                    className={`w-[4.25rem] rounded-md py-1 text-center text-[0.6875rem] font-bold ${c0 ? "bg-lime text-ink" : c.kind === "MUST" ? "bg-ink text-white" : "border border-rule"}`}
                  >
                    {c.kind}
                  </span>
                </li>
              );
            })}
          </ol>
        </section>

        <section className={section}>
          <div className="flex items-center justify-between">
            <h3 className="flex items-center gap-2 text-lg font-semibold">
              <Num n={3} /> Terms
            </h3>
            {edit(3)}
          </div>
          <dl className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              ["Escrow", `${formatNear(amount)} Ⓝ`, true],
              ["Payout", "All-or-nothing", false],
              ["Submit by", deadline.toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }), false],
              ["Jury", `${juryN} · ${Math.floor(juryN / 2) + 1}/${juryN}`, false],
            ].map(([k, v, mono]) => (
              <div key={String(k)} className="rounded-xl border border-rule bg-surface px-4 py-3">
                <dt className="text-sm text-muted">{k}</dt>
                <dd className={`mt-0.5 text-lg font-semibold ${mono ? "font-mono" : ""}`}>{v}</dd>
              </div>
            ))}
          </dl>
        </section>

        <label className="mt-6 flex items-start gap-3">
          <input type="checkbox" checked={d.agree} onChange={(e) => set({ agree: e.target.checked })} className="mt-1 size-5 accent-[#0d0f14]" />
          <span>I understand criteria and terms can’t be changed after funding, and that the jury’s verdict settles the escrow.</span>
        </label>
      </Card>

      <div className="space-y-5">
        <Card tone="lime">
          <Eyebrow>You’re funding</Eyebrow>
          <p className="display mt-2 text-[4.5rem] leading-none">
            {formatNear(amount)} <span className="font-mono text-lg font-normal tracking-normal">NEAR</span>
          </p>
          <dl className="mt-5 divide-y divide-ink/15 border-t border-ink/15">
            <Line k="From" v={me ?? <button type="button" onClick={onConnect} className="font-sans font-semibold underline">Connect wallet</button>} />
            <Line k="Wallet balance" v={balance === null ? "–" : <span className={short ? "text-bad" : ""}>{formatNear(balance)} Ⓝ</span>} />
            <Line k="Network fee" v="≈ 0.001 Ⓝ" />
            <Line k="Storage reserve" v={`${formatNear(STORAGE_RESERVE)} Ⓝ`} />
            <Line k={<span className="font-semibold">You sign</span>} v={<span className="font-semibold">{formatNear(total, 4)} Ⓝ</span>} />
          </dl>
          <p className="mt-4 text-sm">
            One signature: create_job + deposit. Storage is paid from the reserve; whatever is left stays in the escrow.
            {short && <span className="mt-1 block font-semibold text-bad">The wallet balance looks too low for this amount plus gas.</span>}
          </p>
        </Card>

        <Card tone="navy">
          <Eyebrow>Written on-chain</Eyebrow>
          <dl className="mt-4 space-y-4 font-mono">
            <div>
              <dt className="text-sm opacity-60">criteria_hash</dt>
              <dd className="mt-0.5 break-all text-lime" title={hash ?? undefined}>
                {hash ? `${hash.slice(0, 12)}…${hash.slice(-9)}` : "…"}
              </dd>
            </div>
            <div>
              <dt className="text-sm opacity-60">criteria_kinds</dt>
              <dd className="mt-0.5 text-lime">[{kindsOf(doc).join(",")}]</dd>
            </div>
            <div>
              <dt className="text-sm opacity-60">submit_deadline_secs</dt>
              <dd className="mt-0.5 text-lime">≈ {Math.max(0, Math.round((deadline.getTime() - Date.now()) / 1000)).toLocaleString("en-US")}</dd>
            </div>
          </dl>
          <p className="mt-4 text-sm opacity-70">Anyone can recompute the hash from the criteria on the left. The job page works without a wallet.</p>
        </Card>

        <Card>
          <h3 className="display text-[1.5rem]">After you fund</h3>
          <ul className="mt-3 space-y-3 text-muted">
            <li className="flex gap-3">
              <User size={15} className="mt-1 shrink-0" /> The worker can start immediately and submits from their own wallet.
            </li>
            <li className="flex gap-3">
              <Eye size={15} className="mt-1 shrink-0" /> You can follow every commit and reveal live on the job page.
            </li>
            <li className="flex gap-3">
              <Undo size={15} className="mt-1 shrink-0" /> No submission by {deadline.toLocaleDateString(undefined, { month: "short", day: "numeric" })} → full refund, no fee.
            </li>
          </ul>
        </Card>
      </div>
    </div>
  );
}

function Line({ k, v }: { k: React.ReactNode; v: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-3">
      <dt>{k}</dt>
      <dd className="num truncate font-mono">{v}</dd>
    </div>
  );
}
