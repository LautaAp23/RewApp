/** Per-tab state shared by the header and inbox. PostgreSQL remains canonical across devices. */
export function createPersonalNoticeReads() {
  const accounts = new Map<string, { confirmed: Set<string>; pending: Set<string> }>();
  const state = (account: string) => {
    const key = account.toLowerCase();
    if (!accounts.has(key)) accounts.set(key, { confirmed: new Set(), pending: new Set() });
    return accounts.get(key)!;
  };
  return {
    ids: (account: string) => [...new Set([...state(account).confirmed, ...state(account).pending])],
    merge: (account: string, ids: string[]) => { for (const id of ids) state(account).confirmed.add(id); },
    begin: (account: string, id: string) => {
      const row = state(account);
      if (row.confirmed.has(id) || row.pending.has(id)) return false;
      row.pending.add(id); return true;
    },
    finish: (account: string, id: string, success: boolean) => {
      const row = state(account);
      if (success) row.confirmed.add(id);
      row.pending.delete(id);
    },
  };
}
export const personalNoticeReads = createPersonalNoticeReads();
