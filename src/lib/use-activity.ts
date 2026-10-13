"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Activity } from "./api/activity";
import { useAccount } from "./account/account-context";

/** Home data for the account; `reload` after a top-up or a payment. */
function useActivity(address: string | undefined) {
  const account = useAccount(), current = useRef(account);
  current.current = account;
  const [activity, setActivity] = useState<Activity>();
  const [failed, setFailed] = useState(false);

  const reload = useCallback(async () => {
    if (!address) return;
    setFailed(false);
    try {
      if (current.current.status === "signed-in") {
        const proof = await current.current.signPersonalAccess();
        if (proof.account !== address || current.current.address !== address) return;
        const session = await fetch("/api/personal/inbox", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(proof) });
        if (!session.ok) throw new Error("private history unavailable");
      }
      const response = await fetch(`/api/activity/${address}`, { cache: "no-store" });
      if (!response.ok) throw new Error(`activity ${response.status}`);
      if (current.current.address !== address) return;
      setActivity((await response.json()) as Activity);
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }, [address]);

  useEffect(() => {
    setActivity(undefined);
    setFailed(false);
  }, [address]);
  useEffect(() => {
    if (account.status === "busy") return;
    void reload();
  }, [reload, account.status]);

  return { activity, failed, reload };
}

export { useActivity };
