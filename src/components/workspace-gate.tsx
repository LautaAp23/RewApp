"use client";
import { useTranslations } from "next-intl";
import { card, primaryButton } from "@/components/ui";
export function WorkspaceGate({
  busy,
  onConnect,
}: {
  busy: boolean;
  onConnect(): void;
}) {
  const t = useTranslations("workspace");
  return (
    <section className={`${card} flex flex-col gap-3`}>
      <h2 className="text-lg font-semibold">{t("connectTitle")}</h2>
      <p className="text-sm text-muted">{t("connectBody")}</p>
      <button className={primaryButton} disabled={busy} onClick={onConnect}>
        {t(busy ? "working" : "connect")}
      </button>
    </section>
  );
}
export function WorkspaceError({ code }: { code?: string }) {
  const t = useTranslations("workspace");
  if (!code) return null;
  return (
    <p role="alert" className="text-sm text-error">
      {t(
        code === "charge_unavailable"
          ? "chargeUnavailable"
          : code === "unknown_contact"
            ? "unknownContact"
            : code === "not_ready"
              ? "notReady"
              : "failed",
      )}
    </p>
  );
}
