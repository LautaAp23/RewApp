"use client";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useTranslations, useLocale } from "next-intl";
import { useCallback, useEffect, useRef, useState } from "react";
import { BusinessMenu } from "@/components/business-menu";
import { Skeleton } from "@/components/skeleton";
import { RewardThumbnail } from "@/components/reward-thumbnail";
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
import { isDerivationIndex } from "@/lib/merchant-index";
import { useWorkspace } from "@/lib/use-workspace";
type Reward = {
  id: number;
  title: string;
  description: string;
  imageUrl: string | null;
  pointsCost: string;
  merchant: { name: string } | null;
  available: boolean;
};
export default function Page() {
  const t = useTranslations("commerceRedeem"),
    w = useTranslations("workspace"),
    locale = useLocale();
  const search = useSearchParams();
  const merchantParam = search.get("merchant");
  const indexParam = Number(search.get("index") ?? "0");
  const derivationIndex = isDerivationIndex(indexParam) ? indexParam : 0;
  const account = useAccount(),
    workspace = useWorkspace(merchantParam);
  const { data, run, busy, reload } = workspace;
  const merchantId = data?.merchant?.id;
  const merchantAddress = data?.merchant?.address ?? merchantParam;
  const ruleIndex = data?.merchant?.derivationIndex ?? derivationIndex;
  const [rewards, setRewards] = useState<Reward[]>(),
    [points, setPoints] = useState<bigint>(),
    [chosen, setChosen] = useState<Reward>(),
    [redeeming, setRedeeming] = useState(false),
    [error, setError] = useState<"failed" | "insufficient">(),
    [result, setResult] = useState<"processing" | "failed" | "success">();
  const lock = useRef(false);
  const load = useCallback(async () => {
    if (!merchantAddress) return;
    try {
      const r = await fetch("/api/rewards?audience=COMMERCE", {
        cache: "no-store",
      });
      if (!r.ok) throw new Error();
      setRewards((await r.json()).rewards);
      const { rewAppPay } = requireContractAddresses();
      setPoints(
        await chainClient.readContract({
          address: rewAppPay,
          abi: rewAppPayAbi,
          functionName: "commercePoints",
          args: [merchantAddress as `0x${string}`],
        }),
      );
      setError(undefined);
    } catch {
      setError("failed");
    }
  }, [merchantAddress]);
  useEffect(() => {
    setPoints(undefined);
    setRewards(undefined);
    if (merchantId) void load();
  }, [merchantId, load]);
  useEffect(() => {
    if (!data) return;
    const timer = setInterval(() => void reload(), 5000);
    return () => clearInterval(timer);
  }, [data, reload]);
  async function redeem() {
    if (
      !chosen ||
      !merchantAddress ||
      !isDerivationIndex(ruleIndex) ||
      lock.current
    )
      return;
    lock.current = true;
    setRedeeming(true);
    setError(undefined);
    setResult(undefined);
    try {
      const { rewAppPay } = requireContractAddresses();
      const nonce = await chainClient.readContract({
        address: rewAppPay,
        abi: rewAppPayAbi,
        functionName: "nonces",
        args: [merchantAddress as `0x${string}`],
      });
      const signed = await account.signMerchantRedeem(
        {
          account: merchantAddress as `0x${string}`,
          rewardId: BigInt(chosen.id),
          nonce,
          deadline: BigInt(Math.floor(Date.now() / 1000) + 300),
        },
        ruleIndex,
      );
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
      setChosen(undefined);
      await load();
      await reload();
    } catch {
      setError("failed");
    } finally {
      lock.current = false;
      setRedeeming(false);
    }
  }
  return (
    <main className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold">{t("title")}</h1>
        <p className="text-muted">{t("body")}</p>
        {merchantId && data?.merchant ? (
          <BusinessMenu
            address={merchantParam as string}
            index={ruleIndex}
            current="redeem"
          />
        ) : null}
        {points === undefined && !error ? (
          <Skeleton className="my-1.5 h-4 w-32" />
        ) : (
          <p className="text-lg font-semibold text-reward">
            {t("points", { count: points?.toLocaleString(locale) ?? "—" })}
          </p>
        )}
      </header>
      <WorkspaceError code={workspace.error} />
      {!data ? (
        <WorkspaceGate busy={busy} onConnect={() => void run("access")} />
      ) : !merchantParam ? (
        <div className={`${card} flex flex-col gap-3`}>
          <p>{t("notMerchant")}</p>
          <p className="text-sm text-muted">{t("pickBusiness")}</p>
          <Link href="/perfil" className={secondaryButton}>
            {t("backToProfile")}
          </Link>
        </div>
      ) : !data.merchant ? (
        <div className={`${card} flex flex-col gap-3`}>
          <p>{t("unlinked")}</p>
          <button
            className={primaryButton}
            disabled={busy || !isDerivationIndex(derivationIndex)}
            onClick={async () => {
              const signed = await account.signMerchantClaim(derivationIndex);
              const response = await fetch("/api/merchants/claim", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(signed),
              });
              if (response.ok) await reload();
            }}
          >
            {t("link")}
          </button>
          <Link href="/perfil" className={secondaryButton}>
            {t("backToProfile")}
          </Link>
        </div>
      ) : (
        <>
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
                disabled={redeeming}
                onClick={() => void redeem()}
              >
                {t(redeeming ? "redeeming" : "confirm")}
              </button>
              <button
                className={secondaryButton}
                disabled={redeeming}
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
                  <div
                    key={i}
                    aria-hidden
                    className={`${card} flex flex-col gap-3`}
                  >
                    <div className="flex items-center gap-4">
                      <Skeleton className="h-18 w-18 shrink-0 rounded-card" />
                      <div className="flex flex-1 flex-col gap-3">
                        <Skeleton className="h-5 w-2/3" />
                        <Skeleton className="h-4 w-1/2" />
                      </div>
                    </div>
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
                  <div className="flex items-center gap-4">
                    <RewardThumbnail src={r.imageUrl} title={r.title} />
                    <div className="min-w-0 flex-1">
                      <h2 className="text-lg font-semibold">{r.title}</h2>
                    </div>
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
                        redeeming ||
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
            {!data.commerceRedemptions.length ? (
              <p className="text-sm text-muted">{t("emptyHistory")}</p>
            ) : (
              <ul className="flex flex-col gap-3">
                {data.commerceRedemptions.map((r) => (
                  <li className={`${card} flex flex-col gap-2`} key={r.id}>
                    <h3 className="font-semibold">{r.title}</h3>
                    <p className="text-sm text-muted">
                      {new Intl.DateTimeFormat(locale, {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      }).format(new Date(r.createdAt))}
                    </p>
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
        </>
      )}
      <Link href="/inicio" className={secondaryButton}>
        {w("home")}
      </Link>
    </main>
  );
}
