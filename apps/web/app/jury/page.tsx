import { formatNear, type VerifierView } from "@juri/shared";
import type { Metadata } from "next";
import { ArrowUpRight, Check, Close, Spark } from "@/components/icons";
import { ErrorState } from "@/components/states";
import { Card, CardHead, PageHead, Tile, th } from "@/components/ui";
import { api, attempt, failureText } from "@/lib/api";
import { count, dateTime } from "@/lib/format";
import { CONTRACT_ID, explorerAccountUrl } from "@/lib/near";

export const metadata: Metadata = { title: "Jury Console" };

const WORDS = ["No", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten"];
const BADGE = ["bg-lime", "bg-sky", "bg-steel", "bg-peach", "bg-sage", "bg-salmon"];
/** What a verifier's FunctionCall key may call on the Assay contract, and what it may not. */
const ALLOWED = ["commit_vote", "reveal_vote", "withdraw"];
const DENIED = ["create_job", "withdraw_treasury", "set_params", "full access"];

export default async function Jury() {
  const [verifiers, treasury] = await Promise.all([attempt(api.verifiers()), attempt(api.treasury())]);
  const t = treasury.ok ? treasury.data : null;
  const params = t?.params ?? null;
  const list = verifiers.ok ? verifiers.data.data : [];
  const active = list.filter((v) => v.active).length;
  const first = list[0];

  return (
    <div className="space-y-6">
      <PageHead
        eyebrow="jury console"
        texture="checker"
        title={
          <>
            {WORDS[list.length] ?? list.length} verifier{list.length === 1 ? "" : "s"}.
            <br />
            <span className="xl:whitespace-nowrap">One key each. No full access.</span>
          </>
        }
        aside={
          <nav aria-label="Sections" className="inline-flex rounded-full bg-surface p-1.5 font-medium shadow-sm">
            {[
              ["#verifiers", "Verifiers"],
              ["#treasury", "Treasury"],
              ["#parameters", "Parameters"],
            ].map(([href, label], i) => (
              <a key={href} href={href} className={`rounded-full px-5 py-2.5 ${i === 0 ? "bg-ink text-white" : "text-muted hover:text-ink"}`}>
                {label}
              </a>
            ))}
          </nav>
        }
      />

      <section aria-label="Totals" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <BigTile tone="bg-lime" label="Active verifiers" value={verifiers.ok ? `${active} / ${list.length}` : "–"} />
        <BigTile tone="bg-sky" label="Treasury" value={t ? `${formatNear(t.treasury, 4)} NEAR` : "–"} />
        <BigTile tone="bg-peach" label="Jury pool paid" value={t ? `${formatNear(t.total_jury_pool, 4)} NEAR` : "–"} />
        <BigTile tone="bg-sage" label="Settled jobs" value={t ? count(t.settled_jobs) : "–"} />
      </section>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_24rem]">
        <Card className="min-w-0">
          <CardHead id="verifiers" title="Verifiers" note="read-only · owner actions run from the CLI" />
          {!verifiers.ok ? (
            <ErrorState title="The verifier list could not be read." message={failureText(verifiers.error)} />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[700px] border-separate border-spacing-y-2">
                <thead>
                  <tr>
                    <th className={`${th} pl-4`}>Verifier</th>
                    <th className={th}>Stake</th>
                    <th className={th}>Votes</th>
                    <th className={th}>Agree</th>
                    <th className={th}>Missed</th>
                    <th className={th}>Earned</th>
                    <th className={th}>Runner</th>
                  </tr>
                </thead>
                <tbody>
                  {list.map((v, i) => (
                    <VerifierRow key={v.account_id} v={v} badge={BADGE[i % BADGE.length]!} />
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="mt-3 text-sm text-muted">All verifiers are run by one operator in this MVP. Jury selection uses env::random_seed, which validators can influence.</p>
        </Card>

        <section aria-labelledby="keys-h" className="rounded-[1.75rem] bg-navy p-6 text-paper sm:p-8">
          <p className="eyebrow opacity-60">Access keys · every verifier</p>
          <h2 id="keys-h" className="display mt-3 text-[2rem]">
            FunctionCall key only
          </h2>
          <div className="mt-5 rounded-2xl bg-white/[0.06] p-5 font-mono text-sm">
            <div className="flex items-baseline justify-between gap-4">
              <span className="font-sans opacity-60">receiver</span>
              <span className="truncate">{CONTRACT_ID}</span>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              {ALLOWED.map((m) => (
                <span key={m} className="rounded-md bg-lime px-2.5 py-1 text-xs font-semibold text-ink">
                  {m}
                </span>
              ))}
            </div>
          </div>
          <ul className="mt-5 space-y-2.5 font-mono text-sm">
            {DENIED.map((m) => (
              <li key={m} className="flex items-center gap-3">
                <Close size={11} className="text-salmon" /> {m}
              </li>
            ))}
          </ul>
          {first && (
            <a
              href={explorerAccountUrl(first.account_id)}
              target="_blank"
              rel="noreferrer"
              className="mt-6 flex items-center justify-center gap-2 rounded-full bg-surface px-5 py-3.5 font-semibold text-ink hover:bg-surface-2"
            >
              View access keys on explorer <ArrowUpRight size={14} />
            </a>
          )}
        </section>
      </div>

      <div className="grid gap-5 md:grid-cols-2">
        <Card>
          <CardHead id="treasury" title="Treasury" />
          {t ? (
            <div className="grid grid-cols-2 gap-3">
              <Tile value={`${formatNear(t.treasury, 4)}`} label="Treasury balance · NEAR" tone="sky" />
              <Tile value={count(t.settled_jobs)} label="Jobs settled" />
              <Tile value={`${formatNear(t.total_fee, 4)}`} label="Total fees · NEAR" />
              <Tile value={`${formatNear(t.total_jury_pool, 4)}`} label="Paid to verifiers · NEAR" tone="peach" />
            </div>
          ) : (
            <p className="text-muted">{treasury.ok ? "" : failureText(treasury.error)}</p>
          )}
        </Card>
        <Card>
          <CardHead id="parameters" title="Parameters" />
          {params ? (
            <dl className="grid grid-cols-2 gap-x-6">
              <Param k="Fee" v={`${params.fee_bps / 100}%`} />
              <Param k="Verifiers' share of fee" v={`${params.jury_share_bps / 100}%`} />
              <Param k="Jury size" v={String(params.jury_size)} />
              <Param k="Commit / reveal" v={`${params.commit_secs} s / ${params.reveal_secs} s`} />
              <Param k="Minimum stake" v={`${formatNear(params.min_stake, 2)} NEAR`} />
              <Param k="Max criteria" v={String(params.max_criteria)} />
            </dl>
          ) : (
            <p className="text-muted">Parameters could not be read from the contract.</p>
          )}
        </Card>
      </div>
    </div>
  );
}

function BigTile({ tone, label, value }: { tone: string; label: string; value: string }) {
  return (
    <div className={`rounded-[1.75rem] p-6 ${tone}`}>
      <p className="text-muted">{label}</p>
      <p className="display mt-3 text-[2.6rem] leading-none sm:text-[3.2rem]">{value}</p>
    </div>
  );
}

function VerifierRow({ v, badge }: { v: VerifierView; badge: string }) {
  const name = v.account_id.split(".")[0] ?? v.account_id;
  const cell = "border-y border-rule bg-surface py-3 pr-4";
  return (
    <tr className={v.active ? "" : "opacity-50"}>
      <td className={`${cell} rounded-l-2xl border-l pl-4`}>
        <div className="flex items-center gap-3">
          <span className={`grid size-11 shrink-0 place-items-center rounded-xl font-mono text-sm font-bold ${badge}`}>{name.slice(0, 3)}</span>
          <div className="min-w-0">
            <p className="truncate font-mono text-[0.875rem]" title={v.account_id}>
              {v.account_id}
            </p>
            <p className="truncate text-sm text-muted" title={v.last_judged_at ? `last judged ${dateTime(v.last_judged_at)}` : "has not judged yet"}>
              {v.model.split("/").pop()} · {v.provider ?? "provider unknown"}
              {v.attested && (
                <span className="ml-1">
                  · Attested <Check size={11} className="inline" />
                </span>
              )}
              {!v.active && " · inactive"}
            </p>
          </div>
        </div>
      </td>
      <td className={`${cell} num whitespace-nowrap font-mono text-sm`}>{formatNear(v.stake, 2)} Ⓝ</td>
      <td className={`${cell} num font-mono text-sm`}>{count(v.stats.votes)}</td>
      <td className={`${cell} num font-mono text-sm`}>{v.stats.votes ? `${Math.round((v.stats.majority_agreements / v.stats.votes) * 100)}%` : "–"}</td>
      <td className={`${cell} num font-mono text-sm`}>{count(v.stats.missed_reveals)}</td>
      <td className={`${cell} num whitespace-nowrap font-mono text-sm`}>{formatNear(v.stats.earned, 4)} Ⓝ</td>
      <td className={`${cell} rounded-r-2xl border-r pr-4`}>
        {v.allowance_status === "low" ? (
          <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full bg-peach px-2.5 py-1 text-[0.8125rem] font-semibold" title={v.balance ? `${formatNear(v.balance, 3)} NEAR for gas` : undefined}>
            Low allowance
          </span>
        ) : v.allowance_status === "ok" ? (
          <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full bg-lime px-2.5 py-1 text-[0.8125rem] font-semibold" title={v.balance ? `${formatNear(v.balance, 3)} NEAR for gas` : undefined}>
            <Spark size={12} /> Healthy
          </span>
        ) : (
          <span className="text-sm text-faint">unknown</span>
        )}
      </td>
    </tr>
  );
}

function Param({ k, v }: { k: string; v: string }) {
  return (
    <div className="border-b border-rule py-3">
      <dt className="text-sm text-muted">{k}</dt>
      <dd className="num mt-0.5 text-lg font-semibold">{v}</dd>
    </div>
  );
}
