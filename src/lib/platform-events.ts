/** Fixed demo platform events. Slugs map to messages in `notifications.platform.*`. */
export const PLATFORM_EVENTS = [
  { slug: "welcome", href: "/inicio" },
  { slug: "catalog", href: "/canjear" },
] as const;
export type PlatformSlug = (typeof PLATFORM_EVENTS)[number]["slug"];
export type PlatformEvent = { slug: PlatformSlug; href: string };
