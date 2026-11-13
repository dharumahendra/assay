import type { Metadata } from "next";
import Link from "next/link";
import { EmptyState } from "@/components/states";

export const metadata: Metadata = { title: "Create Protected Job" };

export default async function NewProtectedJob({ searchParams }: { searchParams: Promise<{ from?: string }> }) {
  const { from } = await searchParams;
  return (
    <div className="space-y-6">
      <h1 className="display text-[2rem] sm:text-[2.5rem]">Create protected job</h1>
      <EmptyState
        title="Funding a job needs a NEAR wallet, which this build does not connect yet"
        action={
          <div className="flex flex-wrap gap-x-5">
            {from && (
              <Link href={`/jobs/${encodeURIComponent(from)}`} className="link">
                Back to the job
              </Link>
            )}
            <Link href="/protected" className="link">
              See existing protected jobs
            </Link>
          </div>
        }
      >
        The four-step wizard (job, criteria, terms, review and fund) ships with wallet support. Meanwhile you can draft
        and copy acceptance criteria on any job page.
      </EmptyState>
    </div>
  );
}
