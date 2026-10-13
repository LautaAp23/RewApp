"use client";

import { useTranslations } from "next-intl";
import { MyBusinesses } from "@/components/my-businesses";

export default function Page() {
  const t = useTranslations("profile");
  return (
    <main className="flex flex-col gap-6">
      <header>
        <h1 className="text-2xl font-bold">{t("businesses")}</h1>
        <p className="mt-1 text-muted">{t("businessesHint")}</p>
      </header>
      <MyBusinesses intro={false} />
    </main>
  );
}
