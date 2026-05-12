/** Built-in HR console OTP login allowlist (always allowed). */
export const BUILTIN_HR_ADMIN_EMAILS = ['it@asija.in', 'hr@asija.in', 'service@asija.in'] as const;

export type BuiltinHrAdminEmail = (typeof BUILTIN_HR_ADMIN_EMAILS)[number];

/** @deprecated Use BUILTIN_HR_ADMIN_EMAILS; kept for existing imports. */
export const ALLOWED_HR_ADMIN_EMAILS = BUILTIN_HR_ADMIN_EMAILS;

export function normalizeHrEmail(email: string): string {
  return String(email || '').trim().toLowerCase();
}

function parseCommaSeparatedEmails(raw: string | undefined): string[] {
  if (!raw || typeof raw !== 'string') return [];
  return raw
    .split(/[,;\s]+/)
    .map((s) => normalizeHrEmail(s))
    .filter(Boolean);
}

/**
 * Extra allowlist from server env (comma-separated). Not available on the client bundle
 * unless NEXT_PUBLIC_* (we intentionally use server-only HR_ALLOWED_ADMIN_EMAILS).
 */
export function getEnvExtraHrAdminEmails(): string[] {
  if (typeof process === 'undefined') return [];
  return parseCommaSeparatedEmails(process.env.HR_ALLOWED_ADMIN_EMAILS);
}

/** Built-in plus env extras, sorted, de-duplicated. */
export function mergeBuiltinAndEnvEmails(): string[] {
  const set = new Set<string>([...BUILTIN_HR_ADMIN_EMAILS, ...getEnvExtraHrAdminEmails()]);
  return Array.from(set).sort();
}

export function isAsijaHrEmail(email: string): boolean {
  return normalizeHrEmail(email).endsWith('@asija.in');
}
