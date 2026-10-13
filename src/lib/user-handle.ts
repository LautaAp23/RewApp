/** Canonical handles are distinct from the non-unique display name. */
export function normalizeHandle(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const handle = value.trim().replace(/^@/, "").toLowerCase();
  return /^(?!rw-)[a-z0-9][a-z0-9._-]{1,22}[a-z0-9]$/.test(handle) ? handle : null;
}
