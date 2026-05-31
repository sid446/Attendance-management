export function normalizeUploadText(value: unknown): string {
  if (value === null || value === undefined) return '';
  return String(value).trim();
}

export function nameLookupKeys(name: string): string[] {
  const key = normalizeUploadText(name).toLowerCase();
  if (!key) return [];
  return [key, key.replace(/\s+/g, '.'), key.replace(/\./g, ' ')];
}

export function buildUploadPresence(employees: unknown[]) {
  const codes = new Set<string>();
  const names = new Set<string>();
  for (const emp of employees) {
    if (!emp || typeof emp !== 'object') continue;
    const row = emp as Record<string, unknown>;
    const code = normalizeUploadText(row.employeeCode).toLowerCase();
    if (code) codes.add(code);
    const rowName = normalizeUploadText(row.name);
    for (const k of nameLookupKeys(rowName)) names.add(k);
  }
  return { codes, names };
}

export type UploadPresenceUser = {
  name?: unknown;
  employeeCode?: unknown;
  email?: unknown;
  isActive?: boolean;
};

export function isUserPresentInUpload(
  user: UploadPresenceUser,
  presence: { codes: Set<string>; names: Set<string> }
): boolean {
  const code = normalizeUploadText(user.employeeCode).toLowerCase();
  if (code && presence.codes.has(code)) return true;
  for (const k of nameLookupKeys(normalizeUploadText(user.name))) {
    if (presence.names.has(k)) return true;
  }
  return false;
}

function userDisplayLabel(user: UploadPresenceUser): string {
  return (
    normalizeUploadText(user.name) ||
    normalizeUploadText(user.employeeCode) ||
    normalizeUploadText(user.email)
  );
}

/** Active employees not matched by name/code in the upload file (same rules as basic-master-upload API). */
export function getActiveUsersMissingFromUpload(
  employees: unknown[],
  existingUsers: UploadPresenceUser[],
  maxNames = 50
): { count: number; names: string[] } {
  const presence = buildUploadPresence(employees);
  const names: string[] = [];
  let count = 0;

  for (const user of existingUsers) {
    if (user.isActive === false) continue;
    if (isUserPresentInUpload(user, presence)) continue;

    count++;
    if (names.length < maxNames) {
      const label = userDisplayLabel(user);
      if (label) names.push(label);
    }
  }

  return { count, names };
}
