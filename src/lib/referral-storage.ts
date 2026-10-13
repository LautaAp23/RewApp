/** The invite seen before signing up. Lives only in this browser: a convenience, never the source of truth. */
export type SavedInvite = { code: string; alias: string | null; savedAt: number };

const KEY = "rewapp.referral";
export const INVITE_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export function saveInvite(code: string, alias: string | null, now = Date.now()) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify({ code, alias, savedAt: now }));
  } catch {}
}

export function readInvite(now = Date.now()): SavedInvite | null {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    const saved = JSON.parse(raw) as Partial<SavedInvite>;
    if (typeof saved.code !== "string" || typeof saved.savedAt !== "number" || now - saved.savedAt > INVITE_TTL_MS) {
      window.localStorage.removeItem(KEY);
      return null;
    }
    return { code: saved.code, alias: typeof saved.alias === "string" ? saved.alias : null, savedAt: saved.savedAt };
  } catch {
    return null;
  }
}

export function clearInvite() {
  try {
    window.localStorage.removeItem(KEY);
  } catch {}
}
