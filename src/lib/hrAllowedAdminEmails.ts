/**
 * Client-safe HR allowlist helpers (no Mongo).
 * Full merged list (built-in + env + database extras) comes from GET /api/hr-console-permissions.
 */
export {
  BUILTIN_HR_ADMIN_EMAILS,
  ALLOWED_HR_ADMIN_EMAILS,
  normalizeHrEmail,
  mergeBuiltinAndEnvEmails,
  getEnvExtraHrAdminEmails,
  isAsijaHrEmail,
} from '@/lib/hrAdminAllowlistCore';

export type { BuiltinHrAdminEmail } from '@/lib/hrAdminAllowlistCore';
