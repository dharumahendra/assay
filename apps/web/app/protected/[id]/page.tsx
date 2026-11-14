import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { JobDetail } from "@/components/protected/job-detail";
import { EnsureWallet } from "@/components/wallet";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  return { title: `Protected job #${id}` };
}

export default async function ProtectedJobPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^\d{1,12}$/.test(id)) notFound();
  return (
    <EnsureWallet>
      <JobDetail id={Number(id)} />
    </EnsureWallet>
  );
}
