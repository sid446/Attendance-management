import type { ManagedFieldKey, User } from '../types';

export const getDefaultManagedEffectiveDates = (): Record<ManagedFieldKey, string> => {
  return {
    designation: '',
    registeredUnderPartner: '',
    workingUnderPartner: '',
    basicSalary: '',
    laptopAllowance: '',
    totalSalaryPerMonth: '',
    totalSalaryPerAnnum: '',
  };
};

/** Stable MongoDB document id for URLs and comparisons (handles string, $oid, ObjectId-like). */
export function isUserMarkedInactive(user: Pick<User, 'isActive'>): boolean {
  if (user.isActive === false) return true;
  const raw: unknown = user.isActive;
  return typeof raw === 'string' && raw.toLowerCase() === 'false';
}

export function formatInactiveSinceDate(value: unknown): string {
  const ymd = toDateInputValue(value);
  if (!ymd) return '';
  const d = new Date(ymd);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function normalizeEmployeeSearchText(value: unknown): string {
  return String(value ?? '').trim().toLowerCase();
}

/** Searchable text for an employee row (name, codes, all mail fields, team, etc.). */
export function buildEmployeeSearchHaystack(user: User): string {
  return [
    user.name,
    user.email,
    user.attendanceEmail,
    user.alternateEmail,
    user.odId,
    user.employeeCode,
    user.registrationNo,
    user.designation,
    user.team,
    user.workingUnderPartner,
    user.registeredUnderPartner,
    user.tallyName,
    user.mobileNumber,
    user.alternateMobileNumber,
  ]
    .map(normalizeEmployeeSearchText)
    .filter(Boolean)
    .join(' ');
}

export function employeeMatchesSearchTerm(user: User, rawTerm: string): boolean {
  const term = normalizeEmployeeSearchText(rawTerm);
  if (!term) return true;

  const haystack = buildEmployeeSearchHaystack(user);
  const tokens = term.split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return true;

  const emails = [user.email, user.attendanceEmail, user.alternateEmail]
    .map(normalizeEmployeeSearchText)
    .filter(Boolean);

  return tokens.every((token) => {
    if (haystack.includes(token)) return true;
    // Match email local-part only (e.g. "rahul" → rahul@asija.in)
    if (emails.some((email) => email.split('@')[0]?.includes(token))) return true;
    // Match without dots in names (e.g. "a kumar" vs stored "A.Kumar")
    const compactHaystack = haystack.replace(/\./g, '');
    const compactToken = token.replace(/\./g, '');
    return compactHaystack.includes(compactToken);
  });
}

export function normalizeMongoId(raw: unknown): string {
  if (raw == null) return '';
  if (typeof raw === 'string') {
    const s = raw.trim();
    return s && s !== 'undefined' ? s : '';
  }
  if (typeof raw === 'object' && raw !== null && '$oid' in (raw as Record<string, unknown>)) {
    const oid = (raw as { $oid: unknown }).$oid;
    return typeof oid === 'string' ? oid.trim() : '';
  }
  const s = String(raw);
  return s === '[object Object]' ? '' : s;
}

/** yyyy-mm-dd for <input type="date"> — local calendar day; empty if invalid */
export function toDateInputValue(value: unknown): string {
  if (value == null || value === '') return '';
  if (typeof value === 'string') {
    const t = value.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t;
    const lead = t.match(/^(\d{4}-\d{2}-\d{2})/);
    if (lead) return lead[1];
  }
  const d = value instanceof Date ? value : new Date(value as string);
  if (Number.isNaN(d.getTime())) return '';
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${mo}-${day}`;
}

export const getManagedEffectiveDatesFromUser = (user?: Partial<User>): Record<ManagedFieldKey, string> => {
  const defaults = getDefaultManagedEffectiveDates();
  const fieldHistories = (user as any)?.fieldHistories || {};

  const fields: ManagedFieldKey[] = [
    'designation',
    'registeredUnderPartner',
    'workingUnderPartner',
    'basicSalary',
    'laptopAllowance',
    'totalSalaryPerMonth',
    'totalSalaryPerAnnum',
  ];

  for (const field of fields) {
    const history = Array.isArray(fieldHistories[field]) ? fieldHistories[field] : [];
    if (history.length === 0) continue;

    const active = history.find((h: any) => h && (h.effectiveTo === null || h.effectiveTo === undefined));
    const selected = active || history[history.length - 1];
    defaults[field] = toDateInputValue(selected?.effectiveFrom);
  }

  return defaults;
};

export function sortSalaryHistoryDesc(fieldHistory: unknown): Array<{
  value?: string;
  effectiveFrom?: unknown;
  effectiveTo?: unknown;
}> {
  const arr = Array.isArray(fieldHistory) ? [...fieldHistory] : [];
  return arr.sort(
    (a, b) =>
      new Date((b as { effectiveFrom?: string }).effectiveFrom as string).getTime() -
      new Date((a as { effectiveFrom?: string }).effectiveFrom as string).getTime()
  );
}

export function formatSalaryHistoryRowDate(value: unknown): string {
  if (value == null || value === '') return '—';
  const d = value instanceof Date ? value : new Date(value as string);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-GB');
}
