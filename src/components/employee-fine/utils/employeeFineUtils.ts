import { employeeCredentialsInit } from '@/lib/employeeCredentialsInit';
import type { FineRecord, EmployeeFineDoc } from '../types';

export function formatRecordDate(dateStr: string): string {
  const d = new Date(`${dateStr}T12:00:00`);
  if (Number.isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString('en-IN', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export function statusClass(status: FineRecord['status']): string {
  if (status === 'paid') return 'bg-emerald-100 text-emerald-900';
  if (status === 'waived') return 'bg-blue-100 text-blue-900';
  return 'bg-slate-100 text-slate-800';
}

export function paymentModeLabel(mode?: string): string {
  if (!mode) return '';
  return mode.replace(/_/g, ' ');
}

export async function fetchOwnFine(monthYear: string): Promise<EmployeeFineDoc | null> {
  const response = await fetch(
    `/api/employee/fines?monthYear=${encodeURIComponent(monthYear)}`,
    employeeCredentialsInit({ cache: 'no-store' })
  );
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.success) {
    throw new Error(data.error || `Failed to fetch fines (${response.status})`);
  }
  return data.fine ?? null;
}

export function recordTotals(fine: EmployeeFineDoc | null) {
  const records = fine?.fineRecords ?? [];
  const pendingAmount = records
    .filter((r) => !r.isWarning && r.status === 'pending')
    .reduce((s, r) => s + (r.fineAmount || 0), 0);
  const paidAmount = records
    .filter((r) => !r.isWarning && r.status === 'paid')
    .reduce((s, r) => s + (r.fineAmount || 0), 0);
  const waivedAmount = records
    .filter((r) => !r.isWarning && r.status === 'waived')
    .reduce((s, r) => s + (r.fineAmount || 0), 0);
  return {
    totalFine: fine?.totalFine ?? 0,
    totalWarnings: fine?.totalWarnings ?? 0,
    recordCount: records.length,
    pendingAmount,
    paidAmount,
    waivedAmount,
  };
}
