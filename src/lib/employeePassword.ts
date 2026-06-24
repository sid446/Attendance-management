import bcrypt from 'bcryptjs';

const BCRYPT_ROUNDS = 12;
const MIN_PASSWORD_LENGTH = 8;

export type EmployeePasswordValidation =
  | { ok: true }
  | { ok: false; error: string };

export function validateEmployeePassword(password: string): EmployeePasswordValidation {
  const value = String(password || '');
  if (value.length < MIN_PASSWORD_LENGTH) {
    return { ok: false, error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters` };
  }
  if (!/[a-zA-Z]/.test(value) || !/[0-9]/.test(value)) {
    return { ok: false, error: 'Password must include at least one letter and one number' };
  }
  return { ok: true };
}

export async function hashEmployeePassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}

export async function verifyEmployeePassword(
  password: string,
  hash: string | null | undefined
): Promise<boolean> {
  if (!hash) return false;
  try {
    return bcrypt.compare(String(password || ''), hash);
  } catch {
    return false;
  }
}

export function userHasEmployeePassword(user: {
  employeePasswordHash?: string | null;
}): boolean {
  return Boolean(user.employeePasswordHash?.trim());
}
