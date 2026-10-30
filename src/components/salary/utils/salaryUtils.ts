import { type PayrollOverrides } from '@/lib/salaryCalculation';
import type { PayrollLine, InvalidDayIssue } from '../types';

export function uid(line: PayrollLine): string {
  return typeof line.userId === 'string' ? line.userId : String((line.userId as { _id?: string })?._id || line.userId);
}

export function overrideSigValue(v: unknown): string {
  if (v === null || v === undefined || v === '') return '';
  if (typeof v === 'number' && Number.isFinite(v)) return String(v);
  return String(v);
}

export function payrollOverridesSignature(o: PayrollOverrides | undefined): string {
  const src = o || {};
  const keys: Array<keyof PayrollOverrides> = [
    'overtimeDays',
    'netWorkingDays',
    'officeWorkingDays',
    'dueInTally',
    'additionInOffDue',
    'otherExtra',
    'esiEmployer',
    'esiEmployee',
    'tds',
    'advances',
    'off',
    'taReimbursement',
    'lcReimbursement',
    'laptopAdjustment',
    'remarks',
    'group',
  ];
  const parts = keys.map((k) => `${k}:${overrideSigValue(src[k])}`);
  const custom = Object.entries(src.customAmounts || {})
    .filter(([, v]) => v != null && v !== ('' as unknown))
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `c:${k}:${overrideSigValue(v)}`);
  return [...parts, ...custom].join('|');
}

export function formatIssueDate(ymd: string): string {
  const [y, m, d] = String(ymd).slice(0, 10).split('-').map(Number);
  if (!y || !m || !d) return ymd;
  return new Date(y, m - 1, d).toLocaleDateString('en-IN', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
}

export function invalidIssueLabel(issue: InvalidDayIssue['issue']): string {
  return issue === 'missing-checkin' ? 'Missing check-in' : 'Missing check-out';
}

/** Stored excess, or the hours implied by converted OT days when the stored field is missing. */
export function payrollExcessHours(line: PayrollLine): number {
  const stored = Number(line.excessHours);
  if (Number.isFinite(stored) && Math.abs(stored) > 0.0001) return stored;
  const suggested = Number(line.overtimeSuggested || 0);
  const dayLen = Number(line.weekdayHours || 8);
  if (suggested > 0 && dayLen > 0) return Number((suggested * dayLen).toFixed(2));
  return 0;
}
