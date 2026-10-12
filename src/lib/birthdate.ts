/** Birthday day/month handling, shared by the API route, /perfil and tests. */

export type Birthdate = { day: number; month: number };

const DAYS_IN_MONTH = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

/** Feb 29 is allowed (leap birthdays); Feb 30, Apr 31 and the like are not. */
export function isPossibleDate(day: number, month: number): boolean {
  if (!Number.isInteger(day) || !Number.isInteger(month)) return false;
  if (month < 1 || month > 12 || day < 1 || day > 31) return false;
  return day <= DAYS_IN_MONTH[month - 1];
}

type Parsed = { day: number; month: number } | null | "invalid";

/**
 * Body fields travel as strings (like the merchant profile): "" or missing
 * means "not provided". Both must come together; returns null when neither
 * is provided, "invalid" for any malformed or impossible combination.
 */
export function parseBirthdateFields(day: unknown, month: unknown): Parsed {
  const dayStr = typeof day === "string" ? day.trim() : day === undefined || day === null ? "" : null;
  const monthStr = typeof month === "string" ? month.trim() : month === undefined || month === null ? "" : null;
  if (dayStr === null || monthStr === null) return "invalid";
  if (dayStr === "" && monthStr === "") return null;
  if (dayStr === "" || monthStr === "") return "invalid";
  if (!/^\d{1,2}$/.test(dayStr) || !/^\d{1,2}$/.test(monthStr)) return "invalid";
  const parsed = { day: Number(dayStr), month: Number(monthStr) };
  return isPossibleDate(parsed.day, parsed.month) ? parsed : "invalid";
}

export type MergeResult =
  | { ok: true; day: number | null; month: number | null }
  | { ok: false; error: "invalid" | "locked" };

/**
 * Set-once semantics: a stored birthdate can never change. Sending the same
 * values back is allowed (idempotent retries); sending different ones locks.
 * Omitting both keeps whatever is stored.
 */
export function mergeBirthdate(
  stored: { birthDay: number | null; birthMonth: number | null } | null,
  day: unknown,
  month: unknown,
): MergeResult {
  const parsed = parseBirthdateFields(day, month);
  if (parsed === "invalid") return { ok: false, error: "invalid" };
  const current = { day: stored?.birthDay ?? null, month: stored?.birthMonth ?? null };
  if (parsed === null) return { ok: true, ...current };
  if (current.day !== null && current.month !== null) {
    return parsed.day === current.day && parsed.month === current.month
      ? { ok: true, ...current }
      : { ok: false, error: "locked" };
  }
  return { ok: true, ...parsed };
}
