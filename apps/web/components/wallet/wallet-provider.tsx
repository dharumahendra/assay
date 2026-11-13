"use client";

/**
 * NEAR wallet connection (T6.1, FR-I1). Mount <WalletProvider> once in the root layout;
 * read it with useWallet(). Built on NEAR Wallet Selector, so any NEAR wallet works
 * (Meteor, MyNearWallet, Intear). Loaded in the browser only.
 */
import "@near-wallet-selector/modal-ui/styles.css";
import type { WalletSelector } from "@near-wallet-selector/core";
import type { WalletSelectorModal } from "@near-wallet-selector/modal-ui";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { CONTRACT_ID, GAS, NETWORK, type Outcome } from "@/lib/wallet/near";

export interface CallParams {
  method: string;
  args: object;
  /** yocto */
  deposit?: bigint;
  gas?: bigint;
}

interface WalletCtx {
  /** false until the selector has loaded in the browser */
  ready: boolean;
  accountId: string | null;
  walletId: string | null;
  connect(): void;
  disconnect(): Promise<void>;
  /** Signs and sends one function call on the Assay contract. Redirect wallets leave the page and return with ?transactionHashes. */
  call(p: CallParams): Promise<Outcome | null>;
}

const Ctx = createContext<WalletCtx | null>(null);

export function useWallet(): WalletCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error("useWallet needs <WalletProvider> in the layout");
  return c;
}

/** Provides a wallet only when no <WalletProvider> is mounted above (pages work before and after the layout mounts it). */
export function EnsureWallet({ children }: { children: ReactNode }) {
  return useContext(Ctx) ? <>{children}</> : <WalletProvider>{children}</WalletProvider>;
}

export function WalletProvider({ children }: { children: ReactNode }) {
  const selector = useRef<WalletSelector | null>(null);
  const modal = useRef<WalletSelectorModal | null>(null);
  const [ready, setReady] = useState(false);
  const [accountId, setAccountId] = useState<string | null>(null);
  const [walletId, setWalletId] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    let unsub: (() => void) | undefined;
    (async () => {
      const [{ setupWalletSelector }, { setupModal }, { setupMeteorWallet }, { setupMyNearWallet }, { setupIntearWallet }] = await Promise.all([
        import("@near-wallet-selector/core"),
        import("@near-wallet-selector/modal-ui"),
        import("@near-wallet-selector/meteor-wallet"),
        import("@near-wallet-selector/my-near-wallet"),
        import("@near-wallet-selector/intear-wallet"),
      ]);
      const s = await setupWalletSelector({
        network: NETWORK,
        modules: [setupMeteorWallet(), setupMyNearWallet(), setupIntearWallet()],
      });
      if (!alive) return;
      selector.current = s;
      modal.current = setupModal(s, { contractId: CONTRACT_ID, theme: "light", description: "Connect a NEAR account to fund or work on protected jobs." });
      const sync = () => {
        const st = s.store.getState();
        setAccountId(st.accounts.find((a) => a.active)?.accountId ?? st.accounts[0]?.accountId ?? null);
        setWalletId(st.selectedWalletId ?? null);
      };
      sync();
      const sub = s.store.observable.subscribe(sync);
      unsub = () => sub.unsubscribe();
      setReady(true);
    })().catch((e) => {
      console.error("[wallet] selector failed to load", e);
      if (alive) setReady(true);
    });
    return () => {
      alive = false;
      unsub?.();
    };
  }, []);

  const connect = useCallback(() => modal.current?.show(), []);

  const disconnect = useCallback(async () => {
    const s = selector.current;
    if (!s?.isSignedIn()) return;
    const w = await s.wallet();
    await w.signOut();
  }, []);

  const call = useCallback(
    async ({ method, args, deposit = 0n, gas = GAS.default }: CallParams): Promise<Outcome | null> => {
      const s = selector.current;
      if (!s?.isSignedIn()) throw new Error("No account: the wallet is not signed in");
      const [{ actionCreators }, w] = await Promise.all([import("@near-js/transactions"), s.wallet()]);
      const callbackUrl = typeof window !== "undefined" ? window.location.href.split("#")[0] : undefined;
      const outcome = await w.signAndSendTransaction({
        receiverId: CONTRACT_ID,
        actions: [actionCreators.functionCall(method, args, gas, deposit)],
        ...(w.type === "browser" ? { callbackUrl } : {}),
      } as Parameters<typeof w.signAndSendTransaction>[0]);
      return (outcome as Outcome | undefined) ?? null;
    },
    [],
  );

  const value = useMemo(() => ({ ready, accountId, walletId, connect, disconnect, call }), [ready, accountId, walletId, connect, disconnect, call]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
