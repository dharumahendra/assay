"use client";

/** Step 4 · Fund & lock it in: exactly what create_job will store (07 §2.8 step 4, FR-D1). */
import type { ContractParams } from "@juri/shared";
import type { CriteriaDoc } from "@/lib/criteria";
import { formatNear, parseNear, STORAGE_RESERVE } from "@/lib/wallet/near";
import { FORMATS, type Draft } from "./draft";
import { kindsOf, ruleSummary } from "./step-criteria";
import { Card, Eyebrow, Num, Row } from "./ui";

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
  const edit = (step: Draft["step"]) => (
    <button type="button" onClick={() => set({ step })} className="link text-sm">
      Edit
    </button>
  );

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_22rem]">
      <Card>
        <h2 className="text-xl font-semibold tracking-tight">Review</h2>
        <p className="text-sm text-muted">This is exactly what the contract will store{nextJobId ? ` as protected job #${nextJobId}` : ""}.</p>

        <section className="mt-5 rounded-2xl border border-rule p-4">
          <div className="flex items-center justify-between">
            <h3 className="flex items-center gap-2 font-semibold">
              <Num n={1} /> Job
            </h3>
            {edit(1)}
          </div>
          <p className="mt-2 font-medium">{d.title}</p>
          <div className="mt-2 flex flex-wrap gap-1.5 text-xs">
            <span className="rounded-full bg-paper px-2 py-0.5">{FORMATS.find(([k]) => k === d.format)?.[1]}</span>
            {d.market && <span className="rounded-full bg-paper px-2 py-0.5 font-mono">market job {d.market.id.slice(0, 8)}…</span>}
            <span className="rounded-full bg-paper px-2 py-0.5 font-mono">{d.worker}</span>
          </div>
        </section>

        <section className="mt-3 rounded-2xl border border-rule p-4">
          <div className="flex items-center justify-between">
            <h3 className="flex items-center gap-2 font-semibold">
              <Num n={2} /> Criteria · {doc.criteria.length}
            </h3>
            {edit(2)}
          </div>
          <ol className="mt-2 divide-y divide-rule">
            {doc.criteria.map((c) => (
              <li key={c.id} className="flex items-center gap-3 py-2 text-sm">
                <span className="w-6 font-mono text-xs text-muted">{c.id}</span>
                <span className="min-w-0 flex-1">{c.text}</span>
                <span className="hidden font-mono text-[0.6875rem] text-muted sm:inline">{ruleSummary(c)?.split(" ·")[0] ?? "AI-judged"}</span>
                <span className={`rounded-full px-2 py-0.5 text-[0.6875rem] font-semibold ${c.kind === "MUST" ? "bg-ink text-paper" : "border border-rule text-muted"}`}>{c.kind}</span>
              </li>
            ))}
          </ol>
        </section>

        <section className="mt-3 rounded-2xl border border-rule p-4">
          <div className="flex items-center justify-between">
            <h3 className="flex items-center gap-2 font-semibold">
              <Num n={3} /> Terms
            </h3>
            {edit(3)}
          </div>
          <dl className="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
            {[
              ["Escrow", `${formatNear(amount)} Ⓝ`],
              ["Payout", "All-or-nothing"],
              ["Submit by", deadline.toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })],
              ["Jury", `${juryN} · ${Math.floor(juryN / 2) + 1}/${juryN}`],
            ].map(([k, v]) => (
              <div key={k} className="rounded-xl bg-paper p-3">
                <dt className="text-xs text-muted">{k}</dt>
                <dd className="mt-0.5 font-mono">{v}</dd>
              </div>
            ))}
          </dl>
        </section>

        <label className="mt-5 flex items-start gap-3 text-sm">
          <input type="checkbox" checked={d.agree} onChange={(e) => set({ agree: e.target.checked })} className="mt-0.5 size-4 accent-[#0D0F14]" />
          <span>I understand criteria and terms can’t be changed after funding, and that the jury’s verdict settles the escrow.</span>
        </label>
      </Card>

      <div className="space-y-5">
        <Card tone="lime">
          <Eyebrow>You’re funding</Eyebrow>
          <p className="mt-1 text-5xl font-semibold tracking-tight">
            {formatNear(amount)} <span className="font-mono text-base">NEAR</span>
          </p>
          <div className="mt-4 divide-y divide-black/10">
            {me ? <Row k="From" v={me} /> : <Row k="From" v={<button type="button" onClick={onConnect} className="underline">Connect wallet</button>} />}
            <Row k="Wallet balance" v={balance === null ? "–" : <span className={short ? "text-bad" : ""}>{formatNear(balance)} Ⓝ</span>} />
            <Row k="Storage reserve" v={`${formatNear(STORAGE_RESERVE)} Ⓝ`} />
            <Row k="Network fee" v="≈ 0.001 Ⓝ" />
            <Row k="You sign" v={`${formatNear(total, 4)} Ⓝ`} strong />
          </div>
          <p className="mt-3 text-xs">
            One signature: create_job + deposit. Storage is paid from the reserve; whatever is left stays in the escrow.
            {short && <span className="mt-1 block font-semibold text-bad">The wallet balance looks too low for this amount plus gas.</span>}
          </p>
        </Card>

        <Card tone="navy">
          <Eyebrow>Written on-chain</Eyebrow>
          <dl className="mt-3 space-y-3 font-mono text-xs">
            <div>
              <dt className="opacity-60">criteria_hash</dt>
              <dd className="mt-0.5 break-all text-[#C8F24A]">{hash ?? "…"}</dd>
            </div>
            <div>
              <dt className="opacity-60">criteria_kinds</dt>
              <dd className="mt-0.5 text-[#C8F24A]">[{kindsOf(doc).join(",")}]</dd>
            </div>
            <div>
              <dt className="opacity-60">submit_deadline_secs</dt>
              <dd className="mt-0.5 text-[#C8F24A]">≈ {Math.max(0, Math.round((deadline.getTime() - Date.now()) / 1000)).toLocaleString("en-US")}</dd>
            </div>
          </dl>
          <p className="mt-3 text-xs opacity-70">Anyone can recompute the hash from the criteria on the left. The job page works without a wallet.</p>
        </Card>

        <Card>
          <h3 className="font-semibold">After you fund</h3>
          <ul className="mt-2 space-y-2 text-sm text-muted">
            <li>The worker can start immediately and submits from their own wallet.</li>
            <li>You can follow every commit and reveal live on the job page.</li>
            <li>No submission by {deadline.toLocaleDateString(undefined, { month: "short", day: "numeric" })} → full refund, no fee.</li>
          </ul>
        </Card>
      </div>
    </div>
  );
}
