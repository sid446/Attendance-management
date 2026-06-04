/** HR admin login OTP lifetime (password step → verify step). */
export const HR_OTP_TTL_MS = 5 * 60 * 1000;
export const HR_OTP_TTL_MINUTES = 5;

export function hrOtpExpiresAt(fromMs = Date.now()): Date {
  return new Date(fromMs + HR_OTP_TTL_MS);
}
