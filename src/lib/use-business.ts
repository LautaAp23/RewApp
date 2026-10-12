"use client";

import { useCallback, useEffect, useState } from "react";
import { isAddress } from "viem";
import { useAccount } from "@/lib/account/account-context";
import type { Currency } from "@/lib/money";
import type { DayStat } from "@/lib/register-stats";
import { useWorkspace } from "@/lib/use-workspace";

type RegisterView = {
  id: string;
  number: number;
  name: string;
  days: DayStat[];
  weekCustomers: number;
  weekSales: string;
};

type BusinessDashboard = {
  address: string;
  name: string;
  city: string;
  currency: Currency;
  derivationIndex: number | null;
  weekCustomers: number;
  weekSales: string;
  registers: RegisterView[];
};

function useBusiness(address: string) {
  const account = useAccount();
  const workspace = useWorkspace();
  const [dashboard, setDashboard] = useState<BusinessDashboard>();
  const [error, setError] = useState<string>();

  const reload = useCallback(async () => {
    if (!account.address || !isAddress(address)) return;
    try {
      const response = await fetch(`/api/business/${address}`, { cache: "no-store" });
      if (response.status === 401) {
        setDashboard(undefined);
        return;
      }
      if (!response.ok) {
        setError(response.status === 403 ? "notMerchant" : "failed");
        return;
      }
      setError(undefined);
      setDashboard((await response.json()) as BusinessDashboard);
    } catch {
      setError("failed");
    }
  }, [account.address, address]);

  useEffect(() => {
    if (!workspace.data) return;
    void reload();
  }, [workspace.data, reload]);

  return { ...workspace, dashboard, error, reload };
}

export { useBusiness };
export type { BusinessDashboard, RegisterView };
