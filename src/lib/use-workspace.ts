"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useAccount } from "@/lib/account/account-context";
import type { WorkspaceAction, WorkspaceView } from "@/lib/workspace-types";
export function useWorkspace(merchantAddress?: string | null) {
  const account = useAccount();
  const accountRef = useRef(account);
  accountRef.current = account;
  const [data, setData] = useState<WorkspaceView>();
  const [busy, setBusy] = useState(false),
    [error, setError] = useState<string>();
  const active = useRef(account.address);
  active.current = account.address;
  const accept = useCallback(
    (value: WorkspaceView, address: string | undefined) => {
      if (active.current === address) setData(value);
    },
    [],
  );
  const reload = useCallback(async () => {
    const address = account.address;
    if (!address) return;
    try {
      const focus =
        merchantAddress && /^0x[a-fA-F0-9]{40}$/.test(merchantAddress)
          ? `?merchant=${merchantAddress}`
          : "";
      let response = await fetch(`/api/workspace${focus}`, { cache: "no-store" });
      if (response.status === 401 && accountRef.current.status === "signed-in") {
        const proof = await accountRef.current.signPersonalAccess();
        if (active.current !== address || proof.account !== address) return;
        const connected = await fetch("/api/personal/inbox", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(proof) });
        if (connected.ok) response = await fetch(`/api/workspace${focus}`, { cache: "no-store" });
      }
      if (response.ok) {
        const value = await response.json();
        if (value.account === address) accept(value, address);
      } else if (response.status === 401) setData(undefined);
    } catch {
      setError("failed");
    }
  }, [account.address, accept, merchantAddress]);
  useEffect(() => {
    setData(undefined);
    void reload();
  }, [reload]);
  const run = useCallback(
    async (action: WorkspaceAction, payload: Record<string, unknown> = {}) => {
      if (busy) return false;
      const address = account.address;
      setBusy(true);
      setError(undefined);
      try {
        const signed = await account.signWorkspace(action, payload);
        const response = await fetch("/api/workspace", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(signed),
        });
        const result = await response.json();
        if (!response.ok) {
          setError(result.error ?? "failed");
          return false;
        }
        accept(result, address);
        return true;
      } catch {
        setError("failed");
        return false;
      } finally {
        setBusy(false);
      }
    },
    [account, busy, accept],
  );
  return { data, busy, error, run, reload };
}
