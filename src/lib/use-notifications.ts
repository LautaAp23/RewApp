"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { PLATFORM_EVENTS, type PlatformSlug } from "./platform-events";
import { useAccount } from "./account/account-context";
import type { PersonalView } from "./personal-types";
import { personalNoticeReads } from "./personal-notice-reads";
import { isServerNoticeId, noticeReadToken, type SplitNoticeView } from "./notification-inbox";

export type NoticeKind = "birthday" | "reward_new" | "merchant_event" | "platform_event" | "personal_request" | "split_request";

/** Every i18n key a system notice can resolve to under `notifications`. */
export type NoticeTextKey =
  | "personal.title"
  | "personal.body"
  | "shared.title"
  | "shared.body"
  | "reward.newTitle"
  | "reward.newBody"
  | "reward.reachableTitle"
  | "reward.reachableBody"
  | "birthday.title"
  | "birthday.body"
  | "platform.welcome.title"
  | "platform.welcome.body"
  | "platform.catalog.title"
  | "platform.catalog.body";

export type Notice = {
  id: string;
  kind: NoticeKind;
  href: string;
  /** Merchant-authored content: data, rendered as-is. */
  title?: string;
  description?: string;
  merchantName?: string;
  /** System content: resolved by the page through `useTranslations("notifications")`. */
  titleKey?: NoticeTextKey;
  bodyKey?: NoticeTextKey;
  params?: Record<string, string | number>;
};

export type RewardItem = {
  id: number;
  title: string;
  description: string;
  pointsCost: string;
  available: boolean;
};

export type EventItem = {
  id: string;
  title: string;
  description: string;
  startsAt: string;
  merchant: { name: string; city: string; country: string; address: string };
};

export type NoticeInput = {
  now: Date;
  points: bigint | null;
  /** Lowercased merchant addresses the user already paid in. */
  visited: string[];
  country: string | null;
  birthMonth: number | null;
  rewards: RewardItem[];
  events: EventItem[];
  seenRewardIds: number[];
  /** Birthday campaign ids already redeemed (e.g. `birthday-2026-3`). */
  birthdayRedeemedIds: string[];
};

export const BIRTHDAY_GRACE_DAYS = 7;

/** Stable campaign id for the birthday occurrence covering `now`, or null outside the window. */
export function birthdayCampaignId(now: Date, birthMonth: number): string | null {
  const month = now.getMonth() + 1;
  const year = now.getFullYear();
  if (month === birthMonth) return `birthday-${year}-${birthMonth}`;
  const next = birthMonth === 12 ? 1 : birthMonth + 1;
  if (month === next && now.getDate() <= BIRTHDAY_GRACE_DAYS) {
    const occurrenceYear = month === 1 ? year - 1 : year;
    return `birthday-${occurrenceYear}-${birthMonth}`;
  }
  return null;
}

/**
 * Pure derivation, tested in `use-notifications.test.ts`. Order is fixed by
 * kind (birthday, rewards, merchant events by start desc, platform), because
 * catalog rewards and platform events carry no timestamp to sort by.
 */
export function deriveNotices(input: NoticeInput): Notice[] {
  const notices: Notice[] = [];
  if (input.birthMonth !== null) {
    const campaign = birthdayCampaignId(input.now, input.birthMonth);
    if (campaign && !input.birthdayRedeemedIds.includes(campaign)) {
      notices.push({
        id: campaign,
        kind: "birthday",
        href: "/canjear",
        titleKey: "birthday.title",
        bodyKey: "birthday.body",
      });
    }
  }
  for (const reward of input.rewards) {
    if (!reward.available) continue;
    let cost: bigint;
    try {
      cost = BigInt(reward.pointsCost);
    } catch {
      continue;
    }
    const reachable = input.points !== null && input.points >= cost;
    const seen = input.seenRewardIds.includes(reward.id);
    if (!reachable && seen) continue;
    notices.push({
      id: reachable ? `reward-${reward.id}-reachable` : `reward-${reward.id}`,
      kind: "reward_new",
      href: "/canjear",
      titleKey: reachable ? "reward.reachableTitle" : "reward.newTitle",
      bodyKey: reachable ? "reward.reachableBody" : "reward.newBody",
      params: { title: reward.title, cost: reward.pointsCost },
    });
  }
  const visited = new Set(input.visited.map((a) => a.toLowerCase()));
  const country = input.country?.toUpperCase() ?? null;
  const merchantEvents = input.events
    .filter((event) => {
      const address = event.merchant.address.toLowerCase();
      if (visited.has(address)) return true;
      return !!country && event.merchant.country.toUpperCase() === country;
    })
    .sort((a, b) => (a.startsAt < b.startsAt ? 1 : -1));
  for (const event of merchantEvents) {
    notices.push({
      id: `event-${event.id}`,
      kind: "merchant_event",
      href: "/inicio",
      title: event.title,
      description: event.description,
      merchantName: event.merchant.name,
    });
  }
  const platformKeys: Record<PlatformSlug, { titleKey: NoticeTextKey; bodyKey: NoticeTextKey }> = {
    welcome: { titleKey: "platform.welcome.title", bodyKey: "platform.welcome.body" },
    catalog: { titleKey: "platform.catalog.title", bodyKey: "platform.catalog.body" },
  };
  for (const platform of PLATFORM_EVENTS) {
    notices.push({
      id: `platform-${platform.slug}`,
      kind: "platform_event",
      href: platform.href,
      ...platformKeys[platform.slug],
    });
  }
  return notices;
}

const readKey = (address: string) => `notif-read-${address.toLowerCase()}`;
const birthdayKey = (address: string) => `notif-birthday-${address.toLowerCase()}`;
const READ_EVENT = "rewapp:notifications-read";
const CHANGE_EVENT = "rewapp:notifications-changed";

function readStored(key: string): string[] {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === "string") : [];
  } catch {
    return [];
  }
}

/** Accept the previous checksummed keys while sharing one key per account going forward. */
function accountStored(prefix: string, address: string) {
  return [...new Set([...readStored(`${prefix}-${address}`), ...readStored(`${prefix}-${address.toLowerCase()}`)])]
    .filter(id => prefix !== "notif-read" || !isServerNoticeId(id));
}

export function markBirthdayRedeemed(address: string, campaignId: string) {
  try {
    const key = birthdayKey(address);
    const current = accountStored("notif-birthday", address);
    if (!current.includes(campaignId)) {
      window.localStorage.setItem(key, JSON.stringify([...current, campaignId]));
    }
  } catch {}
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

type NotificationsState = {
  notices: Notice[];
  unread: number;
  readIds: string[];
  failed: boolean;
  loading: boolean;
  reload: () => void;
  markRead: (id: string) => void;
};

/** Inbox source: merges activity, rewards, events and profile client-side. */
export function useNotifications(address: string | undefined): NotificationsState {
  const { status, signPersonalAccess } = useAccount();
  const [notices, setNotices] = useState<Notice[]>([]);
  const [read, setRead] = useState<string[]>([]);
  const [failed, setFailed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);
  const [loadedAddress, setLoadedAddress] = useState<string>();
  const loadedRef = useRef<string | undefined>(undefined);
  const readRef = useRef<{ account: string; ids: string[] }>({ account: "", ids: [] });
  const readSnapshot = useCallback((extra: string[] = []) => {
    if (!address) return [];
    const account = address.toLowerCase();
    const remembered = readRef.current.account === account ? readRef.current.ids : [];
    return [...new Set([...accountStored("notif-read", address), ...remembered.filter(id => !isServerNoticeId(id)),
      ...extra.filter(id => !isServerNoticeId(id)), ...personalNoticeReads.ids(account)])];
  }, [address]);

  useEffect(() => {
    if (!address) return;
    const account = address.toLowerCase();
    function syncRead(event?: Event) {
      const detail = event instanceof CustomEvent ? event.detail as { account: string; ids: string[] } : undefined;
      if (detail && detail.account !== account) return;
      const ids = readSnapshot(detail?.ids);
      readRef.current = { account, ids };
      setRead(ids);
    }
    function syncStorage(event: StorageEvent) {
      if (event.storageArea !== window.localStorage) return;
      if (event.key === null || event.key === readKey(address!) || event.key === `notif-read-${address}`) syncRead();
      if (event.key === birthdayKey(address!)) setTick((value) => value + 1);
    }
    function refresh() { setTick((value) => value + 1); }
    syncRead();
    window.addEventListener(READ_EVENT, syncRead);
    window.addEventListener("storage", syncStorage);
    window.addEventListener(CHANGE_EVENT, refresh);
    window.addEventListener("focus", refresh);
    const timer = window.setInterval(refresh, 15_000);
    return () => {
      window.removeEventListener(READ_EVENT, syncRead);
      window.removeEventListener("storage", syncStorage);
      window.removeEventListener(CHANGE_EVENT, refresh);
      window.removeEventListener("focus", refresh);
      window.clearInterval(timer);
    };
  }, [address, readSnapshot]);

  useEffect(() => {
    if (!address) {
      setNotices([]);
      setRead([]);
      setLoading(false);
      return;
    }
    if (status === "busy") return;
    let cancelled = false;
    if (loadedRef.current !== address.toLowerCase()) setLoading(true);
    const storedRead = readSnapshot();
    readRef.current = { account: address.toLowerCase(), ids: storedRead };
    setRead(storedRead);
    const load = async () => {
      try {
        const [activityRes, rewardsRes, eventsRes, profileRes] = await Promise.all([
          fetch(`/api/activity/${address}`, { cache: "no-store" }),
          fetch("/api/rewards", { cache: "no-store" }),
          fetch("/api/events", { cache: "no-store" }),
          fetch(`/api/profile/${address}`, { cache: "no-store" }),
        ]);
        if (!activityRes.ok || !rewardsRes.ok || !eventsRes.ok || !profileRes.ok) {
          throw new Error("notifications fetch failed");
        }
        const [activity, rewardsBody, eventsBody, profile] = await Promise.all([
          activityRes.json(),
          rewardsRes.json(),
          eventsRes.json(),
          profileRes.json(),
        ]);
        if (cancelled) return;
        // The old seen-rewards registry was written on fetch, even without opening the inbox.
        // Only actual read acknowledgements may suppress an announcement.
        const acknowledged = [...accountStored("notif-read", address),
          ...(readRef.current.account === address.toLowerCase() ? readRef.current.ids : [])];
        const seen = acknowledged.flatMap((id) => {
          const match = id.match(/^reward-(\d+)(?:-reachable)?$/);
          return match ? [Number(match[1])] : [];
        });
        const derived = deriveNotices({
          now: new Date(),
          points: activity.points ? BigInt(activity.points) : null,
          visited: (activity.merchants ?? []).map((m: { address: string }) =>
            String(m.address).toLowerCase(),
          ),
          country: profile.country ?? null,
          birthMonth: profile.birthMonth ?? null,
          rewards: rewardsBody.rewards ?? [],
          events: eventsBody.events ?? [],
          seenRewardIds: seen,
          birthdayRedeemedIds: accountStored("notif-birthday", address),
        });
        if (status === "signed-in") {
          const proof = await signPersonalAccess();
          if (proof.account.toLowerCase() !== address.toLowerCase()) throw new Error("account changed");
          const response = await fetch("/api/personal/inbox", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(proof), cache: "no-store" });
          if (!response.ok) throw new Error("requests unavailable");
          const inbox = await response.json() as { charges: PersonalView[]; splits?: SplitNoticeView[] };
          if (cancelled) return;
          const shared = inbox.splits ?? [];
          const serverRead = [...inbox.charges.filter(row => row.readAt).map(row => `personal-${row.id}`), ...shared.filter(row => row.readAt).map(row => `split-${row.id}`)];
          personalNoticeReads.merge(address, serverRead);
          const latestRead = readSnapshot();
          readRef.current = { account: address.toLowerCase(), ids: latestRead };
          setRead(latestRead);
          window.dispatchEvent(new CustomEvent(READ_EVENT, { detail: { account: address.toLowerCase(), ids: latestRead } }));
          derived.unshift(...inbox.charges.map(row => ({ id: `personal-${row.id}`, kind: "personal_request" as const,
            href: `/pagar/p2p_${row.id}`, titleKey: "personal.title" as const, bodyKey: "personal.body" as const,
            params: { name: row.recipientName, amount: `${row.localCurrency} ${row.localAmount}` } })));
          derived.unshift(...shared.map(row => ({ id: `split-${row.id}`, kind: "split_request" as const, href: `/pagar/${row.id}`,
            titleKey: "shared.title" as const, bodyKey: "shared.body" as const,
            params: { merchant: row.merchantName, amount: `${row.localCurrency} ${row.localAmount}` } })));
        }
        setNotices(derived);
        loadedRef.current = address.toLowerCase();
        setLoadedAddress(address.toLowerCase());
        setFailed(false);
        if (!cancelled) setLoading(false);
      } catch {
        if (!cancelled) {
          setNotices([]);
          loadedRef.current = address.toLowerCase();
          setLoadedAddress(address.toLowerCase());
          setFailed(true);
          setLoading(false);
        }
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [address, tick, status, signPersonalAccess, readSnapshot]);

  const markRead = useCallback(
    (id: string) => {
      if (!address || !notices.some(notice => notice.id === id) || readSnapshot().includes(id)) return;
      const account = address.toLowerCase();
      const personal = isServerNoticeId(id);
      if (personal && (status !== "signed-in" || !personalNoticeReads.begin(account, id))) return;
      const next = [...new Set([...readSnapshot(), id])];
      readRef.current = { account, ids: next };
      setRead(next);
      try {
        window.localStorage.setItem(readKey(address), JSON.stringify(next.filter(value => !isServerNoticeId(value))));
      } catch {}
      window.dispatchEvent(new CustomEvent(READ_EVENT, { detail: { account, ids: next } }));
      if (personal) {
        void signPersonalAccess([noticeReadToken(id)]).then(proof => {
          if (proof.account.toLowerCase() !== account) throw new Error("account changed");
          return fetch("/api/personal/inbox", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(proof) });
        }).then(response => {
          if (!response.ok) throw new Error("read acknowledgement failed");
          personalNoticeReads.finish(account, id, true);
        }).catch(() => personalNoticeReads.finish(account, id, false)).finally(() => {
          window.dispatchEvent(new CustomEvent(READ_EVENT, { detail: { account, ids: [] } }));
        });
      }
    },
    [address, status, signPersonalAccess, notices, readSnapshot],
  );

  const reload = useCallback(() => setTick((t) => t + 1), []);
  const readSet = new Set(read);
  const currentAccount = !!address && loadedAddress === address.toLowerCase();
  return {
    notices: currentAccount ? notices : [],
    unread: currentAccount && !loading && !failed
      ? notices.filter((n) => !readSet.has(n.id)).length : 0,
    readIds: currentAccount ? read : [],
    failed: currentAccount && failed,
    loading: !!address && (!currentAccount || loading),
    reload,
    markRead,
  };
}
