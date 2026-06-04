/** Login OTP lifetime (HR password step and employee email step). */
export const HR_OTP_TTL_MS = 5 * 60 * 1000;
export const HR_OTP_TTL_MINUTES = 5;

export function hrOtpExpiresAt(fromMs = Date.now()): Date {
  return new Date(fromMs + HR_OTP_TTL_MS);
}

export function hrOtpExpiresAtMs(fromMs = Date.now()): number {
  return fromMs + HR_OTP_TTL_MS;
}

export function formatOtpCountdown(secondsLeft: number): string {
  const m = Math.floor(secondsLeft / 60);
  const s = secondsLeft % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}
