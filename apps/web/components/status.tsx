/** Status pills for market jobs and protected (contract) jobs, coloured as in the Assay.pen frames. */
import type { ContractJob } from "@juri/shared";
import { BandNone, BandSome, BandStrong, BandWeak, Check, Gavel } from "./icons";
import { Pill, type Tone } from "./ui";

const JOB: Record<string, { tone: Tone; text: string }> = {
  open: { tone: "lime", text: "Open" },
  in_progress: { tone: "sky", text: "In progress" },
  completed: { tone: "sage", text: "Completed" },
  disputed: { tone: "salmon", text: "Disputed" },
  closed: { tone: "neutral", text: "Closed" },
  expired: { tone: "neutral", text: "Expired" },
};

export function JobStatusPill({ status }: { status: string | null }) {
  if (!status) return <span className="text-faint">–</span>;
  const s = JOB[status] ?? { tone: "neutral" as Tone, text: status.replace("_", " ") };
  const icon = status === "completed" ? <Check size={12} /> : status === "open" ? <BandWeak size={12} /> : status === "in_progress" ? <BandSome size={12} /> : <BandNone size={12} />;
  return (
    <Pill tone={s.tone} icon={icon}>
      {s.text}
    </Pill>
  );
}

/** What a protected job shows: its outcome once settled, otherwise its contract status. */
export function protectedLabel(job: Pick<ContractJob, "status" | "outcome">): { text: string; tone: Tone } {
  if (job.outcome === "Released") return { text: "Released", tone: "lime" };
  if (job.outcome === "Split") return { text: "Split", tone: "peach" };
  if (job.outcome === "Refunded" || job.outcome === "RefundedNoFee") return { text: "Refunded", tone: "salmon" };
  switch (job.status) {
    case "Funded":
      return { text: "Funded", tone: "sky" };
    case "Submitted":
      return { text: "Submitted", tone: "peach" };
    case "Committing":
      return { text: "Judging", tone: "act" };
    case "Stalled":
      return { text: "Stalled", tone: "peach" };
    case "Cancelled":
      return { text: "Cancelled", tone: "neutral" };
    case "Expired":
      return { text: "Expired", tone: "neutral" };
    default:
      return { text: job.status, tone: "neutral" };
  }
}

export function ProtectedStatusPill({ job }: { job: Pick<ContractJob, "status" | "outcome"> }) {
  const l = protectedLabel(job);
  const icon = l.tone === "lime" ? <BandStrong size={12} /> : l.tone === "act" ? <Gavel size={12} /> : l.tone === "neutral" ? <BandNone size={12} /> : <BandSome size={12} />;
  return (
    <Pill tone={l.tone} icon={icon}>
      {l.text}
    </Pill>
  );
}
