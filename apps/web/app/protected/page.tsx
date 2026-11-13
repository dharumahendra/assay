import { formatNear, type ContractJob } from "@juri/shared";
import type { Metadata } from "next";
import Link from "next/link";
import { External } from "@/components/icons";
import { EmptyState, ErrorState } from "@/components/states";
import { dateTime, middle } from "@/lib/format";
import { api, attempt, failureText } from "@/lib/api";
import { CONTRACT_ID, explorerAccountUrl, nsToIso } from "@/lib/near";

export const metadata: Metadata = { title: "Protected Jobs" };

/** Contract status → the UI status vocabulary of 07 §1.4. */
function uiStatus(j: ContractJob): string {
  if (j.status === "Committing") return "Judging";
  if (j.status === "Settled") return j.outcome === "RefundedNoFee" ? "Refunded" : (j.outcome ?? "Settled");
  return j.status;
}

export default async function ProtectedJobs() {
  const res = await attempt(api.protectedJobs({ limit: 50 }));
  const jobs = res.ok ? res.data.data : null;
  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="display text-[2rem] sm:text-[2.5rem]">Protected Jobs</h1>
          <p className="mt-2 max-w-[62ch] text-muted">
            Jobs funded on the Juri contract{" "}
            <a href={explorerAccountUrl(CONTRACT_ID)} target="_blank" rel="noreferrer" className="link inline-flex items-center gap-1 font-mono text-[0.875rem]">
              {CONTRACT_ID} <External size={12} />
            </a>
            . The funds stay locked until the jury decides.
          </p>
        </div>
        <Link href="/protected/new" className="rounded-md bg-act px-4 py-2.5 font-medium text-act-ink">
          Create protected job
        </Link>
      </header>

      {jobs === null ? (
        <ErrorState title="The Juri contract could not be read." message={res.ok ? undefined : failureText(res.error)} />
      ) : jobs.length === 0 ? (
        <EmptyState title="No protected jobs yet" action={<Link href="/protected/new" className="link">Create protected job</Link>} />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-left">
            <thead className="text-sm text-muted">
              <tr className="border-b border-rule">
                <th className="py-2 font-medium">ID</th>
                <th className="py-2 font-medium">Criteria</th>
                <th className="py-2 font-medium">Requester</th>
                <th className="py-2 font-medium">Worker</th>
                <th className="py-2 text-right font-medium">Amount</th>
                <th className="py-2 font-medium">Status</th>
                <th className="py-2 font-medium">Created</th>
              </tr>
            </thead>
            <tbody>
              {jobs.map((j) => (
                <tr key={j.id} className="border-b border-rule">
                  <td className="num py-3 pr-3 font-semibold">#{j.id}</td>
                  <td className="py-3 pr-3 font-mono text-[0.8125rem]" title={j.criteria_hash}>
                    {middle(j.criteria_hash)} · {j.criteria_kinds.length} criteria
                  </td>
                  <td className="max-w-[14rem] truncate py-3 pr-3 font-mono text-[0.8125rem]" title={j.requester}>
                    {j.requester}
                  </td>
                  <td className="max-w-[14rem] truncate py-3 pr-3 font-mono text-[0.8125rem]" title={j.worker}>
                    {j.worker}
                  </td>
                  <td className="num py-3 pr-3 text-right">{formatNear(j.amount, 3)} NEAR</td>
                  <td className="py-3 pr-3">
                    <span className="font-medium">{uiStatus(j)}</span>
                    {j.injection_flagged && <span className="block text-sm text-bad">Injection attempt detected</span>}
                  </td>
                  <td className="py-3 text-sm text-muted">{dateTime(nsToIso(j.created_at))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-sm text-muted">The job detail page with the live jury panel arrives with wallet support.</p>
    </div>
  );
}
