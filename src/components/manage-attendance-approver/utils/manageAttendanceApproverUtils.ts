import type { ApproverOption } from '../types';

export function loginEmailKey(option: ApproverOption): string {
  return String(option.email || "").trim().toLowerCase();
}

export function findOptionByLoginEmail(
  options: ApproverOption[],
  attendanceEmail: string
): ApproverOption | undefined {
  const key = attendanceEmail.trim().toLowerCase();
  if (!key) return undefined;
  return options.find((option) => loginEmailKey(option) === key);
}

export function displayLoginEmail(option: ApproverOption): string {
  return String(option.email || "").trim();
}
