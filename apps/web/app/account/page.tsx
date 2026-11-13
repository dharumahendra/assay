import type { Metadata } from "next";
import { AccountView } from "@/components/account/account-view";
import { EnsureWallet } from "@/components/wallet";

export const metadata: Metadata = { title: "My account" };

export default function AccountPage() {
  return (
    <EnsureWallet>
      <AccountView />
    </EnsureWallet>
  );
}
