"use client";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Skeleton } from "@/components/skeleton";
import { card, cardReward, secondaryButton } from "@/components/ui";
import { useAccount } from "@/lib/account/account-context";
import { useNotifications, type Notice } from "@/lib/use-notifications";

function NoticeCard({
  notice,
  unread,
  onOpen,
}: {
  notice: Notice;
  unread: boolean;
  onOpen: (notice: Notice) => void;
}) {
  const t = useTranslations("notifications");
  const celebratory = notice.kind === "birthday" || notice.kind === "reward_new";
  const params = (notice.params ?? {}) as Record<string, string>;
  const title = notice.titleKey ? t(notice.titleKey, params) : (notice.title ?? "");
  const body = notice.bodyKey ? t(notice.bodyKey, params) : (notice.description ?? "");
  return (
    <li>
      <Link
        href={notice.href}
        onClick={() => onOpen(notice)}
        aria-label={t("openNotice")}
        className={`${celebratory ? cardReward : card} pressable flex items-start gap-3 p-4`}
      >
        <span
          aria-hidden
          className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${unread ? "bg-reward" : "bg-elevated"}`}
        />
        <span className="flex min-w-0 flex-col gap-1">
          <span className="font-semibold">{title}</span>
          {notice.merchantName ? (
            <span className="text-xs text-muted">
              {t("atMerchant", { merchant: notice.merchantName })}
            </span>
          ) : null}
          <span className="text-sm text-muted">{body}</span>
        </span>
      </Link>
    </li>
  );
}

export default function Page() {
  const t = useTranslations("notifications");
  const account = useAccount();
  const { notices, readIds, failed, loading, reload, markRead } = useNotifications(
    account.address,
  );
  const read = new Set(readIds);
  return (
    <main className="flex flex-col gap-6">
      <header>
        <h1 className="text-2xl font-bold">{t("title")}</h1>
      </header>
      {loading ? (
        <div aria-busy="true" className="flex flex-col gap-3">
          <p role="status" className="sr-only">
            {t("title")}
          </p>
          <div aria-hidden className="flex flex-col gap-3">
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-20 w-full" />
          </div>
        </div>
      ) : failed ? (
        <div role="alert" className={`${card} flex flex-col gap-3 p-4`}>
          <p className="text-sm text-error">{t("loadError")}</p>
          <button className={secondaryButton} onClick={() => reload()}>
            {t("retry")}
          </button>
        </div>
      ) : notices.length === 0 ? (
        <p className="text-sm text-muted">{t("empty")}</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {notices.map((notice) => (
            <NoticeCard
              key={notice.id}
              notice={notice}
              unread={!read.has(notice.id)}
              onOpen={(n) => markRead(n.id)}
            />
          ))}
        </ul>
      )}
    </main>
  );
}
