import { formatNear } from "@juri/shared";
import type { Metadata } from "next";
import { External } from "@/components/icons";
import { ErrorState } from "@/components/states";
import { api, attempt, failureText } from "@/lib/api";
import { count, dateTime } from "@/lib/format";
import { explorerAccountUrl } from "@/lib/near";

export const metadata: Metadata = { title: "Jury Console" };

const pill = "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[0.8125rem] whitespace-nowrap";

export default async function Jury() {
  const [verifiers, treasury] = await Promise.all([attempt(api.verifiers()), attempt(api.treasury())]);
  const t = treasury.ok ? treasury.data : null;
  const params = t?.params ?? null;
  return (
    <div className="space-y-10">
      <header>
        <h1 className="display text-[2rem] sm:text-[2.5rem]">Jury Console</h1>
        <p className="mt-2 max-w-[64ch] text-muted">
          The verifiers that judge protected jobs. Each is a sub-account of the Assay contract whose only key can call
          commit_vote, reveal_vote and withdraw, nothing else.
        </p>
      </header>

      <section aria-labelledby="v-h">
        <h2 id="v-h" className="mb-3 text-[1.3rem] font-semibold">
          Verifiers
        </h2>
        {!verifiers.ok ? (
          <ErrorState title="The verifier list could not be read." message={failureText(verifiers.error)} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[920px] text-left">
              <thead className="text-sm text-muted">
                <tr className="border-b border-rule">
                  <th className="py-2 font-medium">Verifier</th>
                  <th className="py-2 font-medium">Model</th>
                  <th className="py-2 font-medium">Attestation</th>
                  <th className="py-2 text-right font-medium">Votes</th>
                  <th className="py-2 text-right font-medium">With majority</th>
                  <th className="py-2 text-right font-medium">Missed reveals</th>
                  <th className="py-2 text-right font-medium">Earned</th>
                  <th className="py-2 font-medium">Gas balance</th>
                  <th className="py-2" />
                </tr>
              </thead>
              <tbody>
                {verifiers.data.data.map((v) => (
                  <tr key={v.account_id} className="border-b border-rule align-top">
                    <td className="py-3">
                      <span className="font-mono text-[0.8125rem]">{v.account_id}</span>
                      <span className="block text-sm text-muted">
                        {v.active ? "Active" : "Inactive"} · stake {formatNear(v.stake, 2)} NEAR
                      </span>
                    </td>
                    <td className="py-3">
                      <span className="font-medium">{v.model}</span>
                      <span className="block text-sm text-muted">
                        {`${v.provider ?? "provider unknown"}, ${v.last_judged_at ? `last judged ${dateTime(v.last_judged_at)}` : "has not judged yet"}`}
                      </span>
                      {v.registered_label !== v.model && (
                        <span className="block text-xs text-muted">Registered on chain as {v.registered_label}</span>
                      )}
                    </td>
                    <td className="py-3">
                      {v.attested ? (
                        <span className={`${pill} border-good/40 bg-good-bg text-good`}>
                          <svg width="12" height="12" viewBox="0 0 16 16" aria-hidden fill="none" stroke="currentColor" strokeWidth="1.8">
                            <path d="M8 1.5 2.5 4v4c0 3.2 2.4 5.6 5.5 6.5 3.1-.9 5.5-3.3 5.5-6.5V4Z" />
                            <path d="m5.6 8.2 1.7 1.6 3.2-3.3" />
                          </svg>
                          TEE attested
                        </span>
                      ) : (
                        <span className={`${pill} border-rule text-muted`}>Not attested</span>
                      )}
                    </td>
                    <td className="num py-3 text-right">{count(v.stats.votes)}</td>
                    <td className="num py-3 text-right">
                      {v.stats.votes ? `${Math.round((v.stats.majority_agreements / v.stats.votes) * 100)}%` : "–"}
                    </td>
                    <td className="num py-3 text-right">{count(v.stats.missed_reveals)}</td>
                    <td className="num py-3 text-right">{formatNear(v.stats.earned, 4)}</td>
                    <td className="py-3">
                      <span className="num">{v.balance ? `${formatNear(v.balance, 3)} NEAR` : "–"}</span>
                      {v.allowance_status === "low" && <span className="block text-sm text-warn">Low: top up before the next vote</span>}
                    </td>
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
          {t ? (
            <dl className="mt-3 grid grid-cols-2 gap-4">
              <Stat label="Treasury balance" value={`${formatNear(t.treasury, 4)} NEAR`} />
              <Stat label="Jobs settled" value={count(t.settled_jobs)} />
              <Stat label="Total fees" value={`${formatNear(t.total_fee, 4)} NEAR`} />
              <Stat label="Paid to verifiers" value={`${formatNear(t.total_jury_pool, 4)} NEAR`} />
            </dl>
          ) : (
            <p className="mt-3 text-muted">{treasury.ok ? "" : failureText(treasury.error)}</p>
          )}
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
