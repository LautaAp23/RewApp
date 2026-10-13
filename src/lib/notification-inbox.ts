export type SplitNoticeView = {
  id: string; merchantName: string; localCurrency: string; localAmount: string; readAt: string | null;
};

export function isServerNoticeId(id: string) { return id.startsWith("personal-") || id.startsWith("split-"); }
export function noticeReadToken(id: string) { return id.startsWith("split-") ? `split:${id.slice(6)}` : id.slice(9); }

/** Split identifiers are namespaced so they can never acknowledge a personal request. */
export function parseInboxReadIds(value: unknown): { personal: string[]; splits: string[] } | null {
  if (!Array.isArray(value) || value.length > 50) return null;
  const personal: string[] = [], splits: string[] = [];
  for (const id of value) {
    if (typeof id !== "string") return null;
    if (/^[a-f0-9-]{36}$/.test(id)) personal.push(id);
    else if (/^split:[A-Za-z0-9_-]{1,100}$/.test(id)) splits.push(id.slice(6));
    else return null;
  }
  return { personal, splits };
}
