import type { Metadata } from "next";
import { EnsureWallet } from "@/components/wallet";
import { Wizard } from "@/components/wizard/wizard";

export const metadata: Metadata = { title: "Create Protected Job" };

export default async function NewProtectedJob({ searchParams }: { searchParams: Promise<{ from?: string }> }) {
  const { from } = await searchParams;
  return (
    <EnsureWallet>
      <Wizard from={from ?? null} />
    </EnsureWallet>
  );
}
