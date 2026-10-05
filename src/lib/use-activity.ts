"use client";

import { useCallback, useEffect, useState } from "react";
import type { Activity } from "./api/activity";

/** Home data for the account; `reload` after a top-up or a payment. */
function useActivity(address: string | undefined) {
  const [activity, setActivity] = useState<Activity>();
  const [failed, setFailed] = useState(false);

  const reload = useCallback(async () => {
    if (!address) return;
    try {
      const response = await fetch(`/api/activity/${address}`, { cache: "no-store" });
      if (!response.ok) throw new Error(`activity ${response.status}`);
      setActivity((await response.json()) as Activity);
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }, [address]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { activity, failed, reload };
}

export { useActivity };
