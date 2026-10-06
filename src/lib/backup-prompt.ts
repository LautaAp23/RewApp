"use client";

// "Ahora no" lasts until the tab is closed; then the proposal comes back (docs/PLAN.md §3).
const DISMISSED_KEY = "rewapp:backup-dismissed";

async function hasBackup(address: string): Promise<boolean> {
  try {
    const response = await fetch(`/api/backup-vaults?account=${address}`, { cache: "no-store" });
    if (!response.ok) return false;
    const { count } = (await response.json()) as { count: number };
    return count > 0;
  } catch {
    return false;
  }
}

function backupDismissed(address: string): boolean {
  return sessionStorage.getItem(DISMISSED_KEY) === address;
}

function dismissBackup(address: string) {
  sessionStorage.setItem(DISMISSED_KEY, address);
}

export { backupDismissed, dismissBackup, hasBackup };
