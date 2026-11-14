import { formatNear, type ContractJob } from "@juri/shared";
import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, ChevronDown, Plus } from "@/components/icons";
import { RoleTabs } from "@/components/protected/role-tabs";
import { EmptyState, ErrorState } from "@/components/states";
import { ProtectedStatusPill, protectedLabel } from "@/components/status";
import { PageHead, PrimaryLink, th } from "@/components/ui";
import { api, attempt, failureText } from "@/lib/api";
import { middle } from "@/lib/format";
import { nsToIso } from "@/lib/near";

export const metadata: Metadata = { title: "Protected Jobs" };

type SP = { role?: string; account?: string; status?: string };
const STATUSES = ["Funded", "Submitted", "Judging", "Released", "Refunded", "Stalled", "Expired", "Cancelled"];

export default async function ProtectedJobs({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const role = sp.role === "requester" || sp.role === "worker" ? sp.role : null;
  const account = role ? sp.account : undefined;
  const res = await attempt(api.protectedJobs({ limit: 50, ...(role && account ? { role, account } : {}) }));
  const all = res.ok ? res.data.data : null;
  const status = sp.status && STATUSES.includes(sp.status) ? sp.status : null;
  const jobs = all && status ? all.filter((j) => protectedLabel(j).text === status) : all;

  return (
    <div>
      <PageHead
        eyebrow="protected jobs"
        title="Escrows judged on-chain"
        texture="hatch"
        aside={
          <PrimaryLink href="/protected/new" icon={<Plus size={16} />}>
            Create protected job
          </PrimaryLink>
        }
      >
        <div className="flex flex-wrap items-center gap-3">
          <RoleTabs role={role} status={status} />
          <form method="get" className="order-first sm:order-none">
            {role && account && (
              <>
                <input type="hidden" name="role" value={role} />
                <input type="hidden" name="account" value={account} />
              </>
            )}
            <label className="relative inline-flex items-center rounded-full border border-rule bg-surface text-sm font-semibold">
              <ChevronDown size={14} className="pointer-events-none absolute left-4" />
              <span className="sr-only">Status</span>
              <select name="status" defaultValue={status ?? ""} className="appearance-none rounded-full bg-transparent py-2.5 pl-10 pr-5 outline-none">
                <option value="">Status: Any</option>
                {STATUSES.map((s) => (
                  <option key={s} value={s}>
                    Status: {s}
                  </option>
                ))}
              </select>
            </label>
            <button type="submit" className="ml-2 rounded-full bg-ink px-4 py-2.5 text-sm font-semibold text-white">
              Apply
            </button>
          </form>
        </div>
      </PageHead>

      {jobs === null ? (
        <ErrorState title="The Assay contract could not be read." message={res.ok ? undefined : failureText(res.error)} />
      ) : jobs.length === 0 ? (
        <EmptyState
          title={role || status ? "No protected jobs match" : "No protected jobs yet"}
          action={
            <Link href="/protected/new" className="link">
              Create protected job
            </Link>
          }
        />
      ) : (
        <div className="overflow-x-auto rounded-[1.75rem] bg-surface px-4 py-3 shadow-[0_10px_30px_-20px_rgb(13_15_20/0.35)] sm:px-6">
          <table className="w-full min-w-[880px]">
            <thead>
              <tr className="border-b border-rule">
                <th className={`${th} pl-3`}>ID</th>
                <th className={th}>Job</th>
                <th className={th}>Requester</th>
                <th className={th}>Worker</th>
                <th className={th}>Amount</th>
                <th className={th}>Status</th>
                <th className={th}>Updated</th>
                <th className={th}>
                  <span className="sr-only">Open</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {jobs.map((j) => (
                <tr key={j.id} className="border-b border-rule last:border-0">
                  <td className="num py-4 pl-3 pr-4 font-semibold">#{j.id}</td>
                  <td className="py-4 pr-4">
                    <span className="font-medium">{j.market_job_id ? `Market job ${middle(j.market_job_id, 8, 4)}` : `${j.criteria_kinds.length} criteria`}</span>
                    <span className="block font-mono text-[0.6875rem] text-faint" title={j.criteria_hash}>
                      criteria {middle(j.criteria_hash, 4, 4)}
                      {j.injection_flagged && <span className="ml-2 font-sans font-semibold text-bad">Injection attempt detected</span>}
                    </span>
                  </td>
                  <td className="max-w-[13rem] truncate py-4 pr-4 font-mono text-[0.8125rem]" title={j.requester}>
                    {short(j.requester)}
                  </td>
                  <td className="max-w-[13rem] truncate py-4 pr-4 font-mono text-[0.8125rem]" title={j.worker}>
                    {short(j.worker)}
                  </td>
                  <td className="num whitespace-nowrap py-4 pr-4 font-mono text-[0.875rem]">{formatNear(j.amount, 2)} N</td>
                  <td className="py-4 pr-4">
                    <ProtectedStatusPill job={j} />
                  </td>
                  <td className="whitespace-nowrap py-4 pr-4 text-muted">{ago(updatedAt(j))}</td>
                  <td className="py-4 pr-3 text-right">
                    <Link href={`/protected/${j.id}`} className="inline-flex items-center gap-1 font-semibold text-act hover:underline">
                      View <ArrowRight size={13} />
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/** Collapse the shared ".juri-assay-jdir"-style parent of sub-accounts so the column stays readable; the title keeps the full id. */
function short(account: string) {
  const parts = account.split(".");
  return parts.length > 2 ? `${parts[0]}.….${parts.at(-1)}` : account;
}

function updatedAt(j: ContractJob): string {
  return nsToIso(j.submitted_at ?? j.created_at);
}

function ago(iso: string) {
  const s = Math.max(0, (Date.now() - Date.parse(iso)) / 1000);
  if (s < 90) return "just now";
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  return `${Math.round(s / 86400)}d ago`;
}
