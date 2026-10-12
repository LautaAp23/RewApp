"use client";
import { useCallback, useEffect, useState } from "react";
import { PLATFORM_EVENTS, type PlatformSlug } from "./platform-events";

export type NoticeKind = "birthday" | "reward_new" | "merchant_event" | "platform_event";

/** Every i18n key a system notice can resolve to under `notifications`. */
export type NoticeTextKey =
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
      id: `reward-${reward.id}`,
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

const readKey = (address: string) => `notif-read-${address}`;
const seenKey = (address: string) => `notif-seen-rewards-${address}`;
const birthdayKey = (address: string) => `notif-birthday-${address}`;

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

export function markBirthdayRedeemed(address: string, campaignId: string) {
  try {
    const key = birthdayKey(address);
    const current = readStored(key);
    if (!current.includes(campaignId)) {
      window.localStorage.setItem(key, JSON.stringify([...current, campaignId]));
    }
  } catch {}
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
  const [notices, setNotices] = useState<Notice[]>([]);
  const [read, setRead] = useState<string[]>([]);
  const [failed, setFailed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!address) {
      setNotices([]);
      setRead([]);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setRead(readStored(readKey(address)));
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
        const seenKeyName = seenKey(address);
        const seen = readStored(seenKeyName)
          .map((v) => Number(v))
          .filter((v) => Number.isInteger(v));
        const seenSet = new Set(seen);
        const availableIds: number[] = (rewardsBody.rewards ?? [])
          .filter((r: RewardItem) => r.available)
          .map((r: RewardItem) => r.id);
        for (const id of availableIds) seenSet.add(id);
        try {
          window.localStorage.setItem(seenKeyName, JSON.stringify([...seenSet].map(String)));
        } catch {}
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
          birthdayRedeemedIds: readStored(birthdayKey(address)),
        });
        setNotices(derived);
        setFailed(false);
        if (!cancelled) setLoading(false);
      } catch {
        if (!cancelled) {
          setFailed(true);
          setLoading(false);
        }
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [address, tick]);

  const markRead = useCallback(
    (id: string) => {
      if (!address) return;
      setRead((current) => {
        if (current.includes(id)) return current;
        const next = [...current, id];
        try {
          window.localStorage.setItem(readKey(address), JSON.stringify(next));
        } catch {}
        return next;
      });
    },
    [address],
  );

  const reload = useCallback(() => setTick((t) => t + 1), []);
  const readSet = new Set(read);
  return {
    notices,
    unread: notices.filter((n) => !readSet.has(n.id)).length,
    readIds: read,
    failed,
    loading,
    reload,
    markRead,
  };
}
