"use client";

/** /account: claimable balance + withdraw, settlement record, and the connected account's jobs (T6.4, FR-D10, FR-I4). */
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { AgentStats, ContractJob } from "@juri/shared";
import { TxModal, type TxPhase } from "@/components/tx-modal";
import { useTxReturn, useWallet } from "@/components/wallet";
import { Card, Eyebrow } from "@/components/wizard/ui";
import { accountUrl, formatNear, GAS, NETWORK, view, type Outcome } from "@/lib/wallet/near";

type Role = "worker" | "requester";
type Action = { kind: "withdraw" } | { kind: "cancel" | "reclaim"; job: ContractJob };

const STATUS_TONE: Record<string, string> = {
  Funded: "bg-[#BDE5F7] text-[#0D0F14]",
  Submitted: "bg-[#F2BC75] text-[#0D0F14]",
  Committing: "bg-[#F2BC75] text-[#0D0F14]",
  Stalled: "bg-[#F98F68] text-[#0D0F14]",
  Released: "bg-[#C8F24A] text-[#0D0F14]",
  Refunded: "bg-[#F98F68] text-[#0D0F14]",
  RefundedNoFee: "bg-[#F98F68] text-[#0D0F14]",
  Split: "bg-[#A9C3A9] text-[#0D0F14]",
  Cancelled: "bg-paper text-muted",
  Expired: "bg-paper text-muted",
};

const label = (j: ContractJob) => (j.status === "Settled" && j.outcome ? (j.outcome === "RefundedNoFee" ? "Refunded" : j.outcome) : j.status);
const nowNs = () => BigInt(Date.now()) * 1_000_000n;

export function AccountView() {
  const { ready, accountId, connect, disconnect, call } = useWallet();
  const [claimable, setClaimable] = useState<string | null>(null);
  const [stats, setStats] = useState<AgentStats | null>(null);
  const [jobs, setJobs] = useState<Record<Role, ContractJob[]> | null>(null);
  const [titles, setTitles] = useState<Record<number, string>>({});
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [tab, setTab] = useState<Role>("worker");
  const [action, setAction] = useState<Action | null>(null);
  const [initial, setInitial] = useState<TxPhase | undefined>(undefined);
  const returned = useTxReturn(accountId);

  const load = useCallback(async () => {
    if (!accountId) return;
    setLoadErr(null);
    try {
      const [c, s, w, r] = await Promise.all([
        view<string>("get_claimable", { account_id: accountId }),
        view<AgentStats>("get_agent_stats", { account_id: accountId }),
        fetch(`/api/protected?account=${encodeURIComponent(accountId)}&role=worker&limit=50`).then((x) => (x.ok ? (x.json() as Promise<{ data: ContractJob[] }>) : { data: [] })),
        fetch(`/api/protected?account=${encodeURIComponent(accountId)}&role=requester&limit=50`).then((x) => (x.ok ? (x.json() as Promise<{ data: ContractJob[] }>) : { data: [] })),
      ]);
      setClaimable(c);
      setStats(s);
      setJobs({ worker: w.data, requester: r.data });
      if (w.data.length === 0 && r.data.length > 0) setTab("requester");
    } catch {
      setLoadErr("The NEAR network or the Assay API could not be reached.");
    }
  }, [accountId]);

  useEffect(() => {
    void load();
  }, [load]);

  // titles come from each job's stored criteria (the contract keeps only hashes)
  useEffect(() => {
    if (!jobs) return;
    const ids = [...jobs.worker, ...jobs.requester].map((j) => j.id).filter((id, i, a) => a.indexOf(id) === i && !titles[id]).slice(0, 30);
    if (!ids.length) return;
    void Promise.all(
      ids.map((id) =>
        fetch(`/api/protected/${id}`)
          .then((r) => (r.ok ? (r.json() as Promise<{ criteria: { source: { title: string } } | null }>) : null))
          .then((b) => [id, b?.criteria?.source.title ?? ""] as const)
          .catch(() => [id, ""] as const),
      ),
    ).then((pairs) => setTitles((t) => ({ ...t, ...Object.fromEntries(pairs) })));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobs]);

  useEffect(() => {
    if (!returned) return;
    setAction({ kind: "withdraw" });
    setInitial(returned.kind === "ok" ? { s: "done", hash: returned.hash, outcome: returned.outcome } : { s: "failed", hash: null, error: { code: returned.code, title: "The wallet returned an error.", detail: returned.message } });
  }, [returned]);

  const list = jobs?.[tab] ?? [];
  const claim = claimable ? BigInt(claimable) : 0n;

  const tx = useMemo(() => {
    if (!action) return null;
    if (action.kind === "withdraw")
      return {
        title: "Withdraw",
        rows: [
          ["Contract call", "withdraw"],
          ["Amount", `${formatNear(claim, 4)} Ⓝ`],
          ["To", accountId ?? "–"],
        ] as [string, string][],
        confirm: `Withdraw ${formatNear(claim)} NEAR`,
        run: () => call({ method: "withdraw", args: {}, gas: GAS.withdraw }),
        done: () => <p className="rounded-2xl bg-[#C8F24A] p-4 font-semibold text-[#0D0F14]">The withdrawal was sent to your wallet.</p>,
      };
    const j = action.job;
    return {
      title: action.kind === "cancel" ? `Cancel job #${j.id}` : `Reclaim job #${j.id}`,
      rows: [
        ["Contract call", action.kind === "cancel" ? "cancel_job" : "reclaim_expired"],
        ["Escrow", `${formatNear(j.amount, 4)} Ⓝ`],
        ["Refund goes to", `${j.requester} (claimable)`],
      ] as [string, string][],
      confirm: action.kind === "cancel" ? "Cancel job" : "Reclaim escrow",
      run: () => call({ method: action.kind === "cancel" ? "cancel_job" : "reclaim_expired", args: { job_id: j.id } }),
      done: () => <p className="rounded-2xl bg-[#C8F24A] p-4 font-semibold text-[#0D0F14]">The escrow is back in the requester’s claimable balance. Withdraw it from this page.</p>,
    };
  }, [action, claim, accountId, call]);

  if (!ready) return <div className="skeleton h-72 rounded-3xl" />;

  if (!accountId)
    return (
      <Card className="mx-auto max-w-xl text-center">
        <h1 className="text-2xl font-semibold tracking-tight">Connect a wallet to see your account</h1>
        <p className="mt-2 text-muted">Your claimable balance, settlement record and protected jobs live on the Assay contract. Connecting only reads them; nothing is signed until you withdraw.</p>
        <button type="button" onClick={connect} className="mt-5 rounded-full bg-ink px-5 py-2 font-semibold text-paper">
          Connect wallet
        </button>
      </Card>
    );

  const settled = stats?.worker_settled ?? 0;
  return (
    <div className="space-y-5">
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_26rem]">
        <section className="relative overflow-hidden rounded-3xl bg-[#12151F] p-6 text-[#EEF0F4] sm:p-8">
          <div aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(90%_110%_at_50%_55%,#1D3BFF66_0%,#1D3BFF00_100%)]" />
          <div className="relative flex flex-wrap items-start justify-between gap-4">
            <div className="flex items-center gap-3">
              <span aria-hidden className="grid size-9 place-items-center rounded-xl bg-[#C8F24A] font-mono text-sm font-bold text-[#0D0F14]">
                {accountId[0]?.toUpperCase()}
              </span>
              <div>
                <a href={accountUrl(accountId)} target="_blank" rel="noreferrer" className="break-all font-mono text-sm hover:underline">
                  {accountId}
                </a>
                <p className="text-xs opacity-60">Connected · NEAR {NETWORK}</p>
              </div>
            </div>
            <button type="button" onClick={() => void disconnect()} className="rounded-full border border-white/20 px-3 py-1 text-xs hover:border-white/60">
              Disconnect
            </button>
          </div>
          <Eyebrow className="relative mt-10">Claimable in Assay contract</Eyebrow>
          <div className="relative mt-1 flex flex-wrap items-end justify-between gap-4">
            <p className="text-[4.5rem] font-semibold leading-none tracking-[-0.04em] sm:text-[6rem]">
              {claimable === null ? "…" : formatNear(claim)}
              <span className="ml-2 font-mono text-base tracking-normal opacity-70">NEAR</span>
            </p>
            <button
              type="button"
              disabled={claim === 0n}
              onClick={() => {
                setInitial(undefined);
                setAction({ kind: "withdraw" });
              }}
              className="inline-flex items-center gap-2 rounded-full bg-[#C8F24A] px-5 py-3 font-semibold text-[#0D0F14] disabled:opacity-40"
            >
              ↓ {claim === 0n ? "Nothing to withdraw" : `Withdraw ${formatNear(claim)} NEAR`}
            </button>
          </div>
          <p className="relative mt-3 text-xs opacity-60">Payouts, refunds and juror rewards collect here. Withdraw sends the whole balance to this account.</p>
        </section>

        <Card>
          <div className="flex items-baseline justify-between">
            <h2 className="font-semibold">Your Assay record</h2>
            <span className="font-mono text-xs text-muted">get_agent_stats</span>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <Stat n={settled} label="As worker · settled" />
            <Stat n={stats?.worker_passed ?? 0} label="Passed" tone="lime" />
            <Stat n={stats?.worker_failed ?? 0} label="Failed" tone={stats?.worker_failed ? "salmon" : undefined} />
            <Stat n={`${formatNear(stats?.worker_earned ?? "0")} Ⓝ`} label="Earned" tone="sky" />
          </div>
          <p className="mt-3 text-xs text-muted">As requester · {stats?.requester_jobs ?? 0} jobs funded. Only settled jobs count, so this record can’t be faked with reviews.</p>
        </Card>
      </div>

      {loadErr && (
        <div role="alert" className="flex items-center justify-between rounded-2xl border border-bad/40 bg-bad-bg px-4 py-3 text-sm">
          {loadErr}
          <button type="button" onClick={() => void load()} className="underline">
            Retry
          </button>
        </div>
      )}

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="inline-flex rounded-full border border-rule p-1 text-sm" role="tablist">
            {(["worker", "requester"] as const).map((r) => (
              <button key={r} type="button" role="tab" aria-selected={tab === r} onClick={() => setTab(r)} className={`rounded-full px-3 py-1 ${tab === r ? "bg-ink text-paper" : "text-muted"}`}>
                As {r} · {jobs?.[r].length ?? "…"}
              </button>
            ))}
          </div>
          <Link href="/protected/new" className="rounded-full border border-rule px-4 py-1.5 text-sm hover:border-ink">
            Create protected job
          </Link>
        </div>

        {jobs === null ? (
          <div className="mt-4 space-y-2">
            {[0, 1, 2].map((i) => (
              <div key={i} className="skeleton h-12" />
            ))}
          </div>
        ) : list.length === 0 ? (
          <p className="mt-6 text-sm text-muted">{tab === "worker" ? "No protected jobs name this account as the worker yet." : "This account hasn’t funded a protected job yet."}</p>
        ) : (
          <ul className="mt-4 divide-y divide-rule">
            {list.map((j) => {
              const st = label(j);
              const past = BigInt(j.submit_deadline) < nowNs();
              const amount =
                j.settlement && tab === "worker" ? (BigInt(j.settlement.to_worker) > 0n ? `+${formatNear(j.settlement.to_worker)} Ⓝ` : "0 Ⓝ") : j.settlement && tab === "requester" && BigInt(j.settlement.to_requester) > 0n ? `+${formatNear(j.settlement.to_requester)} Ⓝ back` : `${formatNear(j.amount)} Ⓝ`;
              return (
                <li key={j.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3">
                  <span className="w-10 font-mono text-sm text-muted">#{j.id}</span>
                  <Link href={`/protected/${j.id}`} className="min-w-0 flex-1 truncate font-medium hover:underline">
                    {titles[j.id] || <span className="font-mono text-sm text-muted">{j.criteria_hash.slice(0, 12)}…</span>}
                  </Link>
                  <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS_TONE[st] ?? "bg-paper"}`}>{st}</span>
                  <span className="w-28 text-right font-mono text-sm">{amount}</span>
                  <span className="flex w-40 justify-end">
                    {j.status === "Funded" && !past && tab === "worker" ? (
                      <Link href={`/protected/${j.id}#submit`} className="rounded-full bg-ink px-3 py-1 text-xs font-semibold text-paper">
                        Submit deliverable
                      </Link>
                    ) : j.status === "Funded" && !past && tab === "requester" ? (
                      <button type="button" onClick={() => (setInitial(undefined), setAction({ kind: "cancel", job: j }))} className="rounded-full border border-rule px-3 py-1 text-xs hover:border-ink">
                        Cancel & refund
                      </button>
                    ) : j.status === "Funded" && past ? (
                      <button type="button" onClick={() => (setInitial(undefined), setAction({ kind: "reclaim", job: j }))} className="rounded-full border border-rule px-3 py-1 text-xs hover:border-ink">
                        Reclaim (expired)
                      </button>
                    ) : (
                      <Link href={`/protected/${j.id}`} className="rounded-full border border-rule px-3 py-1 text-xs hover:border-ink">
                        View
                      </Link>
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      {tx && (
        <TxModal
          open
          title={tx.title}
          rows={tx.rows}
          confirmLabel={tx.confirm}
          initial={initial}
          run={tx.run as () => Promise<Outcome | null>}
          done={tx.done}
          onClose={() => {
            setAction(null);
            setInitial(undefined);
            void load();
          }}
        />
      )}
    </div>
  );
}

function Stat({ n, label, tone }: { n: number | string; label: string; tone?: "lime" | "salmon" | "sky" }) {
  const t = tone === "lime" ? "bg-[#C8F24A] border-transparent" : tone === "salmon" ? "bg-[#F98F68] border-transparent" : tone === "sky" ? "bg-[#BDE5F7] border-transparent" : "border-rule";
  return (
    <div className={`rounded-2xl border p-3 ${t} ${tone ? "text-[#0D0F14]" : ""}`}>
      <p className="text-3xl font-semibold tracking-tight">{n}</p>
      <p className="mt-1 text-xs opacity-70">{label}</p>
    </div>
  );
}
