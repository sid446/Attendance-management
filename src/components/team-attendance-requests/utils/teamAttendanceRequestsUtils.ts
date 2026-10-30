import { getDefaultValueForType, resolveApproveValueNumber, type ApproveValueContext } from '@/lib/attendanceRequestValues';
import type { TeamRequestRow } from '../types';

export function formatDateTime(value?: string | Date): string {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('en-IN');
}

export function getApproveContext(row: TeamRequestRow): ApproveValueContext {
  return {
    isArticle: row.isArticleEmployee,
    date: row.date,
    presenceCredit: row.presenceCredit,
    employee: {
      employmentType: row.employeeEmploymentType,
      designation: row.employeeDesignation,
      category: row.employeeCategory,
    },
  };
}

export function getDefaultApproveValue(row: TeamRequestRow): string {
  return getDefaultValueForType(row.requestedStatus, getApproveContext(row));
}

export function resolveApproveValue(row: TeamRequestRow, raw: string): number | undefined {
  return resolveApproveValueNumber(row.requestedStatus, raw, getApproveContext(row));
}
