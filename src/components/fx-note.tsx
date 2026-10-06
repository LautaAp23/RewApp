"use client";

import { useTranslations } from "next-intl";

/** Required next to converted amounts: the FX table is simulated (PLAN §9). */
export function FxNote() {
  const t = useTranslations("money");
  return <p className="text-xs text-muted">{t("simulatedFx")}</p>;
}
