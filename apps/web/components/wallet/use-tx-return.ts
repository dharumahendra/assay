"use client";

/**
 * Redirect wallets (MyNearWallet) leave the page to sign and come back with
 * ?transactionHashes=… or ?errorCode=…. This reads that once, looks the transaction up,
 * and strips the params from the URL.
 */
import { useEffect, useState } from "react";
import { txOutcome, type Outcome } from "@/lib/wallet/near";

export type TxReturn = { kind: "ok"; hash: string; outcome: Outcome | null } | { kind: "error"; code: string; message: string } | null;

export function useTxReturn(accountId: string | null): TxReturn {
  const [r, setR] = useState<TxReturn>(null);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const u = new URL(window.location.href);
    const hashes = u.searchParams.get("transactionHashes");
    const err = u.searchParams.get("errorCode");
    if (!hashes && !err) return;
    if (err) {
      setR({ kind: "error", code: err, message: decodeURIComponent(u.searchParams.get("errorMessage") ?? err) });
    } else if (hashes && accountId) {
      const hash = hashes.split(",").pop()!;
      txOutcome(hash, accountId)
        .then((o) => setR({ kind: "ok", hash, outcome: o }))
        .catch(() => setR({ kind: "ok", hash, outcome: null }));
    } else return; // wait for the account to load
    for (const k of ["transactionHashes", "errorCode", "errorMessage"]) u.searchParams.delete(k);
    window.history.replaceState(null, "", u.toString());
  }, [accountId]);
  return r;
}
