"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { secondaryButton } from "@/components/ui";
import { useAccount } from "@/lib/account/account-context";
import { nextDerivationIndex } from "@/lib/merchant-index";
import { useWorkspace } from "@/lib/use-workspace";

type Business = {
  address: string;
  name: string;
  city: string;
  derivationIndex: number | null;
};

/** The profile's "My businesses" list: open one, link the first, or register another. */
export function MyBusinesses({ busy = false, intro = true }: { busy?: boolean; intro?: boolean }) {
  const t = useTranslations("profile");
  const account = useAccount();
  const workspace = useWorkspace();
  const router = useRouter();
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [linking, setLinking] = useState(false);
  const [opening, setOpening] = useState<string>();
  const [failed, setFailed] = useState(false);
  const unlinked =
    account.roles?.merchant &&
    !businesses.some(
      (business) => business.address.toLowerCase() === account.roles?.merchant?.address.toLowerCase(),
    );

  useEffect(() => {
    if (!account.address) return;
    let active = true;
    void fetch(`/api/merchants?owner=${account.address}`, { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((value: { merchants?: Business[] } | null) => {
        if (active) setBusinesses(value?.merchants ?? []);
      })
      .catch(() => {
        if (active) setBusinesses([]);
      });
    return () => {
      active = false;
    };
  }, [account.address]);

  async function openBusiness(address: string) {
    if (opening || linking) return;
    setOpening(address);
    setFailed(false);
    const confirmed = await workspace.run("access");
    if (!confirmed) {
      setFailed(true);
      setOpening(undefined);
      return;
    }
    router.push(`/comercio/${address}`);
  }

  return (
    <section className="flex flex-col gap-3">
      {intro ? (
        <>
          <h2 className="text-lg font-semibold">{t("businesses")}</h2>
          <p className="text-sm text-muted">{t("businessesHint")}</p>
        </>
      ) : null}
      {businesses.length === 0 && !account.roles?.merchant ? (
        <p className="text-sm text-muted">{t("noBusinesses")}</p>
      ) : null}
      {businesses.map((business) => (
        <button
          key={business.address}
          type="button"
          className={secondaryButton}
          disabled={Boolean(opening) || linking}
          onClick={() => void openBusiness(business.address)}
        >
          {opening === business.address ? t("opening") : t("openBusiness", { name: business.name })}
        </button>
      ))}
      {unlinked ? (
        <button
          className={secondaryButton}
          disabled={linking || busy || Boolean(opening)}
          onClick={async () => {
            setLinking(true);
            setFailed(false);
            try {
              const signed = await account.signMerchantClaim(0);
              const response = await fetch("/api/merchants/claim", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(signed),
              });
              if (!response.ok) throw new Error();
              const linked = (await response.json()) as { address: string };
              router.push(`/comercio/${linked.address}`);
            } catch {
              setFailed(true);
            } finally {
              setLinking(false);
            }
          }}
        >
          {t(linking ? "linking" : "linkBusiness", { name: account.roles?.merchant?.name ?? "" })}
        </button>
      ) : null}
      {nextDerivationIndex([...businesses.map((business) => business.derivationIndex), unlinked ? 0 : null]) !== null ? (
        <Link href="/comercio/nueva" className={secondaryButton}>
          {t(businesses.length || account.roles?.merchant ? "registerAnother" : "registerMerchant")}
        </Link>
      ) : null}
      {failed ? (
        <p role="alert" className="text-sm text-error">
          {t("error")}
        </p>
      ) : null}
    </section>
  );
}
