/** Unambiguous alphabet: no 0/o and no 1/i/l, so a code can be read aloud or typed. */
export const REFERRAL_ALPHABET = "23456789abcdefghjkmnpqrstuvwxyz";
const SHAPE = /^(?:[a-z0-9]{1,10}-[2-9a-hjkmnp-z]{4}|[2-9a-hjkmnp-z]{6})$/;

/** Lowercased, trimmed code, or null when it cannot be one of ours (checked before any lookup). */
export function normalizeReferralCode(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const code = value.trim().toLowerCase();
  return SHAPE.test(code) ? code : null;
}

/**
 * `ana-7k2q` from the alias, or 6 random characters when the alias has nothing ASCII.
 * `randomIndex(max)` returns 0..max-1 (`randomInt` from node:crypto on the server).
 */
export function makeReferralCode(alias: string | null, randomIndex: (max: number) => number): string {
  const slug = (alias ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
    .slice(0, 10);
  const pick = (length: number) =>
    Array.from({ length }, () => REFERRAL_ALPHABET[randomIndex(REFERRAL_ALPHABET.length)]).join("");
  return slug ? `${slug}-${pick(4)}` : pick(6);
}
