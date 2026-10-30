import { hrCredentialsInit } from '@/lib/hrAuthHeaders';

export let usersListInFlight: Promise<string> | null = null;

/** Concurrent callers share one request; each gets its own parsed copy. */
export const fetchUsersListJson = async () => {
  if (!usersListInFlight) {
    usersListInFlight = fetch('/api/users?listOnly=1&includeInactive=1', hrCredentialsInit())
      .then((r) => r.text())
      .finally(() => {
        usersListInFlight = null;
      });
  }
  return JSON.parse(await usersListInFlight);
};

export let XLSX: typeof import('xlsx');

export const loadXlsx = async () => (XLSX ??= await import('xlsx'));
