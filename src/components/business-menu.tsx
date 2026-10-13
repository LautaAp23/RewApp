"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";

type Item = "panel" | "charge" | "rewards" | "redeem";

/** The business's own menu. The customer tab bar stays underneath. */
export function BusinessMenu({
  address,
  index,
  current,
}: {
  address: string;
  index: number;
  current: Item;
}) {
  const t = useTranslations("business");
  const items: { key: Item; href: string }[] = [
    { key: "panel", href: `/comercio/${address}` },
    { key: "charge", href: `/comercio/${address}/cobrar` },
    { key: "rewards", href: `/comercio/recompensas?merchant=${address}&index=${index}` },
    { key: "redeem", href: `/comercio/canjear?merchant=${address}&index=${index}` },
  ];
  return (
    <nav aria-label={t("menu")} className="flex gap-2">
      {items.map((item) => (
        <Link
          key={item.key}
          href={item.href}
          aria-current={item.key === current ? "page" : undefined}
          className={`pressable flex min-h-12 flex-1 items-center justify-center rounded-button px-2 text-center text-sm font-semibold ${
            item.key === current ? "gradient-primary text-on-primary" : "border border-elevated text-text"
          }`}
        >
          {t(item.key)}
        </Link>
      ))}
    </nav>
  );
}
