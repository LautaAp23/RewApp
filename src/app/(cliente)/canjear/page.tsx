"use client";

import { useTranslations } from "next-intl";

export default function Page() {
  const t = useTranslations("redeem");
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
      <h1 className="text-2xl font-bold">{t("title")}</h1>
      <p className="text-muted">{t("soon")}</p>
    </main>
  );
}
