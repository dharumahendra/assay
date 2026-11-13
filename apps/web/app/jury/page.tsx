import { formatNear } from "@juri/shared";
import type { Metadata } from "next";
import { External } from "@/components/icons";
import { ErrorState } from "@/components/states";
import { count } from "@/lib/format";
import { contractParams, contractTotals, contractTreasury, contractVerifiers, explorerAccountUrl } from "@/lib/near";

export const metadata: Metadata = { title: "Jury Console" };

const [provider, model] = [(l: string) => l.split(":")[0] ?? l, (l: string) => l.split(":").slice(1).join(":") || l];

export default async function Jury() {
  const [verifiers, params, totals, treasury] = await Promise.all([contractVerifiers(), contractParams(), contractTotals(), contractTreasury()]);
  return (
    <div className="space-y-10">
      <header>
        <h1 className="display text-[2rem] sm:text-[2.5rem]">Jury Console</h1>
        <p className="mt-2 max-w-[64ch] text-muted">
          The verifiers that judge protected jobs. Each is a sub-account of the Juri contract whose only key can call
          commit_vote, reveal_vote and withdraw, nothing else.
        </p>
      </header>

      <section aria-labelledby="v-h">
        <h2 id="v-h" className="mb-3 text-[1.3rem] font-semibold">
          Verifiers
        </h2>
        {verifiers === null ? (
          <ErrorState title="The verifier list could not be read." message="NEAR testnet RPC did not answer. Retry in a moment." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-left">
              <thead className="text-sm text-muted">
                <tr className="border-b border-rule">
                  <th className="py-2 font-medium">Verifier</th>
                  <th className="py-2 font-medium">Model</th>
                  <th className="py-2 font-medium">Provider</th>
                  <th className="py-2 text-right font-medium">Stake</th>
                  <th className="py-2 text-right font-medium">Votes</th>
                  <th className="py-2 text-right font-medium">With majority</th>
                  <th className="py-2 text-right font-medium">Missed reveals</th>
                  <th className="py-2 text-right font-medium">Earned</th>
                  <th className="py-2 font-medium">Status</th>
                  <th className="py-2" />
                </tr>
              </thead>
              <tbody>
                {verifiers.map((v) => (
                  <tr key={v.account_id} className="border-b border-rule">
                    <td className="py-3 pr-3 font-mono text-[0.8125rem]">{v.account_id}</td>
                    <td className="py-3 pr-3">{model(v.model_label)}</td>
                    <td className="py-3 pr-3 text-muted">{provider(v.model_label)}</td>
                    <td className="num py-3 pr-3 text-right">{formatNear(v.stake, 2)}</td>
                    <td className="num py-3 pr-3 text-right">{count(v.votes)}</td>
                    <td className="num py-3 pr-3 text-right">{v.votes ? `${Math.round((v.majority_agreements / v.votes) * 100)}%` : "–"}</td>
                    <td className="num py-3 pr-3 text-right">{count(v.missed_reveals)}</td>
                    <td className="num py-3 pr-3 text-right">{formatNear(v.earned, 4)}</td>
                    <td className="py-3 pr-3">{v.active ? "Active" : "Inactive"}</td>
                    <td className="py-3 text-right whitespace-nowrap">
                      <a href={explorerAccountUrl(v.account_id)} target="_blank" rel="noreferrer" className="link inline-flex items-center gap-1 text-sm">
                        View access keys <External size={12} />
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <div className="grid gap-8 md:grid-cols-2">
        <section aria-labelledby="t-h" className="rounded-lg border border-rule bg-surface p-5">
          <h2 id="t-h" className="text-[1.2rem] font-semibold">
            Treasury
          </h2>
          <dl className="mt-3 grid grid-cols-2 gap-4">
            <Stat label="Treasury balance" value={treasury ? `${formatNear(treasury, 4)} NEAR` : "–"} />
            <Stat label="Jobs settled" value={totals ? count(totals.settled_jobs) : "–"} />
            <Stat label="Total fees" value={totals ? `${formatNear(totals.total_fee, 4)} NEAR` : "–"} />
            <Stat label="Paid to verifiers" value={totals ? `${formatNear(totals.total_jury_pool, 4)} NEAR` : "–"} />
          </dl>
        </section>
        <section aria-labelledby="p-h" className="rounded-lg border border-rule bg-surface p-5">
          <h2 id="p-h" className="text-[1.2rem] font-semibold">
            Parameters
          </h2>
          {params ? (
            <dl className="mt-3 grid grid-cols-2 gap-4">
              <Stat label="Fee" value={`${params.fee_bps / 100}%`} />
              <Stat label="Verifiers' share of fee" value={`${params.jury_share_bps / 100}%`} />
              <Stat label="Jury size" value={String(params.jury_size)} />
              <Stat label="Commit / reveal window" value={`${params.commit_secs / 60} / ${params.reveal_secs / 60} min`} />
              <Stat label="Minimum stake" value={`${formatNear(params.min_stake, 2)} NEAR`} />
              <Stat label="Max criteria" value={String(params.max_criteria)} />
            </dl>
          ) : (
            <p className="mt-3 text-muted">Parameters could not be read from the contract.</p>
          )}
        </section>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-sm text-muted">{label}</dt>
      <dd className="num text-[1.15rem] font-semibold">{value}</dd>
    </div>
  );
}
