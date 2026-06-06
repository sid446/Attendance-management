/** Login OTP lifetime (HR password step). */
export const HR_OTP_TTL_MS = 5 * 60 * 1000;
export const HR_OTP_TTL_MINUTES = 5;

/** Employee email OTP — longer TTL because Yahoo delivery can be slow. */
export const EMPLOYEE_OTP_TTL_MINUTES = 10;
export const EMPLOYEE_OTP_TTL_MS = EMPLOYEE_OTP_TTL_MINUTES * 60 * 1000;

export function hrOtpExpiresAt(fromMs = Date.now()): Date {
  return new Date(fromMs + HR_OTP_TTL_MS);
}

export function hrOtpExpiresAtMs(fromMs = Date.now()): number {
  return fromMs + HR_OTP_TTL_MS;
}

export function employeeOtpExpiresAt(fromMs = Date.now()): Date {
  return new Date(fromMs + EMPLOYEE_OTP_TTL_MS);
}

export function formatOtpCountdown(secondsLeft: number): string {
  const m = Math.floor(secondsLeft / 60);
  const s = secondsLeft % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}
