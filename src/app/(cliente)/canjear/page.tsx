"use client";
import Link from "next/link";
import { useTranslations, useLocale } from "next-intl";
import { useCallback, useEffect, useRef, useState } from "react";
import { Skeleton } from "@/components/skeleton";
import {
  card,
  cardReward,
  primaryButton,
  secondaryButton,
} from "@/components/ui";
import { WorkspaceGate, WorkspaceError } from "@/components/workspace-gate";
import { useAccount } from "@/lib/account/account-context";
import { chainClient } from "@/lib/chain-client";
import { requireContractAddresses, rewAppPayAbi } from "@/lib/contracts";
import { birthdayCampaignId, markBirthdayRedeemed } from "@/lib/use-notifications";
import { useWorkspace } from "@/lib/use-workspace";
type Reward = {
  id: number;
  title: string;
  description: string;
  pointsCost: string;
  merchant: { name: string } | null;
  available: boolean;
};
export default function Page() {
  const t = useTranslations("rewards"),
    w = useTranslations("workspace"),
    locale = useLocale();
  const account = useAccount(),
    workspace = useWorkspace();
  const [rewards, setRewards] = useState<Reward[]>(),
    [points, setPoints] = useState<bigint>(),
    [chosen, setChosen] = useState<Reward>(),
    [busy, setBusy] = useState(false),
    [error, setError] = useState<"failed" | "insufficient">(),
    [result, setResult] = useState<"processing" | "failed" | "success">();
  const { data: workspaceData, reload: reloadWorkspace } = workspace;
  const lock = useRef(false);
  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/rewards", { cache: "no-store" });
      if (!r.ok) throw new Error();
      setRewards((await r.json()).rewards);
      const { rewAppPay } = requireContractAddresses();
      if (account.address)
        setPoints(
          await chainClient.readContract({
            address: rewAppPay,
            abi: rewAppPayAbi,
            functionName: "customerPoints",
            args: [account.address],
          }),
        );
      setError(undefined);
    } catch {
      setError("failed");
    }
  }, [account.address]);
  useEffect(() => {
    setPoints(undefined);
    void load();
  }, [load]);
  useEffect(() => {
    if (!workspaceData) return;
    const timer = setInterval(() => void reloadWorkspace(), 5000);
    return () => clearInterval(timer);
  }, [workspaceData, reloadWorkspace]);
  async function redeem() {
    if (!chosen || !account.address || lock.current) return;
    lock.current = true;
    setBusy(true);
    setError(undefined);
    setResult(undefined);
    try {
      const { rewAppPay } = requireContractAddresses();
      const nonce = await chainClient.readContract({
        address: rewAppPay,
        abi: rewAppPayAbi,
        functionName: "nonces",
        args: [account.address],
      });
      const signed = await account.signRedeem({
        account: account.address,
        rewardId: BigInt(chosen.id),
        nonce,
        deadline: BigInt(Math.floor(Date.now() / 1000) + 300),
      });
      const response = await fetch("/api/redeem", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          intent: {
            ...signed.intent,
            rewardId: signed.intent.rewardId.toString(),
            nonce: signed.intent.nonce.toString(),
            deadline: signed.intent.deadline.toString(),
          },
          signature: signed.signature,
        }),
      });
      const body = await response.json();
      if (!response.ok) {
        setError(
          body.error === "insufficient_points" ? "insufficient" : "failed",
        );
        return;
      }
      setResult(
        response.status === 202
          ? "processing"
          : body.redemption?.status === "FAILED"
            ? "failed"
            : "success",
      );
      if (chosen.id === 90 && account.address) {
        try {
          const profile = await fetch(`/api/profile/${account.address}`, {
            cache: "no-store",
          }).then((r) => (r.ok ? r.json() : null));
          const campaign =
            profile?.birthMonth != null
              ? birthdayCampaignId(new Date(), profile.birthMonth)
              : null;
          if (campaign) markBirthdayRedeemed(account.address, campaign);
        } catch {}
      }
      setChosen(undefined);
      await load();
      await workspace.reload();
    } catch {
      setError("failed");
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return (
    <main className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold">{t("title")}</h1>
        <p className="text-muted">{t("body")}</p>
        {points === undefined && !error ? (
          <Skeleton className="my-1.5 h-4 w-32" />
        ) : (
          <p className="text-lg font-semibold text-reward">
            {t("points", { count: points?.toLocaleString(locale) ?? "—" })}
          </p>
        )}
      </header>
      {error && (
        <div role="alert" className="flex flex-col gap-2">
          <p className="text-error">{t(error)}</p>
          <button className={secondaryButton} onClick={() => void load()}>
            {w("retry")}
          </button>
        </div>
      )}
      {result && (
        <p role="status" className={cardReward}>
          {t(result)}
        </p>
      )}
      {chosen ? (
        <section className={`${cardReward} flex flex-col gap-3`}>
          <h2 className="text-lg font-bold">{t("confirmTitle")}</h2>
          <p>{chosen.title}</p>
          <p className="text-sm text-muted">
            {t("confirmBody", { count: chosen.pointsCost })}
          </p>
          <button
            className={primaryButton}
            disabled={busy}
            onClick={() => void redeem()}
          >
            {t(busy ? "redeeming" : "confirm")}
          </button>
          <button
            className={secondaryButton}
            disabled={busy}
            onClick={() => setChosen(undefined)}
          >
            {w("cancel")}
          </button>
        </section>
      ) : null}
      {rewards === undefined ? (
        error ? null : (
          <div aria-busy="true" className="flex flex-col gap-4">
            <p role="status" className="sr-only">
              {w("loading")}
            </p>
            {[0, 1].map((i) => (
              <div key={i} aria-hidden className={`${card} flex flex-col gap-3`}>
                <Skeleton className="h-5 w-2/3" />
                <Skeleton className="h-4 w-1/3" />
                <Skeleton className="h-4 w-full" />
                <div className="flex items-center justify-between gap-3">
                  <Skeleton className="h-4 w-28" />
                  <Skeleton className="h-12 w-24" />
                </div>
              </div>
            ))}
          </div>
        )
      ) : !rewards.length ? (
        <p className="text-muted">{t("empty")}</p>
      ) : (
        <ul className="flex flex-col gap-4">
          {rewards.map((r) => (
            <li key={r.id} className={`${card} flex flex-col gap-3`}>
              <div>
                <h2 className="text-lg font-semibold">{r.title}</h2>
                {r.merchant && (
                  <p className="text-sm text-accent">{r.merchant.name}</p>
                )}
              </div>
              <p className="text-sm text-muted">{r.description}</p>
              <div className="flex items-center justify-between gap-3">
                <p className="font-semibold text-reward">
                  {t("points", {
                    count: BigInt(r.pointsCost).toLocaleString(locale),
                  })}
                </p>
                <button
                  className="pressable min-h-12 rounded-button bg-primary px-5 font-semibold text-on-primary disabled:opacity-50"
                  disabled={
                    busy ||
                    !!chosen ||
                    !r.available ||
                    points === undefined ||
                    points < BigInt(r.pointsCost)
                  }
                  onClick={() => {
                    setChosen(r);
                    setResult(undefined);
                  }}
                >
                  {t(
                    !r.available
                      ? "unavailable"
                      : points !== undefined && points < BigInt(r.pointsCost)
                        ? "notEnough"
                        : "redeem",
                  )}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-bold">{t("history")}</h2>
        <WorkspaceError code={workspace.error} />
        {!workspace.data ? (
          <WorkspaceGate
            busy={workspace.busy}
            onConnect={() => void workspace.run("access")}
          />
        ) : !workspace.data.redemptions.length ? (
          <p className="text-sm text-muted">{t("emptyHistory")}</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {workspace.data.redemptions.map((r) => (
              <li className={`${card} flex flex-col gap-2`} key={r.id}>
                <h3 className="font-semibold">{r.title}</h3>
                <p className="text-sm text-muted">
                  {t(
                    r.status === "READY"
                      ? "ready"
                      : r.status === "DELIVERED"
                        ? "delivered"
                        : r.status === "FAILED"
                          ? "failed"
                          : "processing",
                  )}
                </p>
                {r.status === "READY" && (
                  <>
                    <p className="text-sm">{t("pickupHint")}</p>
                    <p className="break-all select-all font-semibold text-reward">
                      {r.pickupCode}
                    </p>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
      <Link href="/inicio" className={secondaryButton}>
        {w("home")}
      </Link>
    </main>
  );
}
