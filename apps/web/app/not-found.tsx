import Link from "next/link";
import { EmptyState } from "@/components/states";

export default function NotFound() {
  return (
    <EmptyState
      title="Nothing here"
      action={
        <Link href="/" className="link">
          Go to the start page
        </Link>
      }
    >
      Assay has no record at this address. Market jobs only appear here when Assay has synced them; since market API v2 that
      means Assay&apos;s own jobs.
    </EmptyState>
  );
}
