import type { User } from '@/types/ui';
import type { SummaryExportContext } from '@/components/summary/exports/exportTypes';
import type { EnrichedSummary } from '@/components/summary/types';
import { getDesignationForDate, getWorkingUnderPartnerForDate } from '@/lib/userFieldHistory';

export function yieldToBrowser(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

export function monthOptions(): string[] {
  const out: string[] = [];
  const now = new Date();
  for (let i = 0; i < 36; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }
  return out;
}

export function formatMonthLabel(my: string): string {
  const [y, m] = my.split('-').map(Number);
  if (!y || !m) return my;
  return new Date(y, m - 1, 1).toLocaleString('en-IN', { month: 'long', year: 'numeric' });
}

export async function fetchPortalSummariesForMonth(
  monthYear: string,
  users: User[]
): Promise<EnrichedSummary[]> {
  const response = await fetch(`/api/attendance?monthYear=${encodeURIComponent(monthYear)}`);
  const result = await response.json();
  if (!response.ok || !result.success) {
    throw new Error(result.error || 'Failed to load portal attendance');
  }
  const items = Array.isArray(result.data) ? result.data : [];
  const userById = new Map(users.map((u) => [String(u._id), u]));

  return items.map((item: any) => {
    const userId = item.userId?._id ? String(item.userId._id) : String(item.userId || '');
    const user = userById.get(userId) || item.userId;
    const asOf = `${monthYear}-28`;
    let recordDetails: Record<string, unknown> = {};
    if (item.records instanceof Map) {
      for (const [k, v] of item.records.entries()) recordDetails[k] = v;
    } else {
      recordDetails = item.records || item.recordDetails || {};
    }
    return {
      id: String(item._id || `${userId}-${monthYear}`),
      userId,
      userName: user?.name || item.userId?.name || 'Unknown',
      odId: user?.odId || item.userId?.odId || '',
      employeeCode: user?.employeeCode || item.userId?.employeeCode || '',
      team: getWorkingUnderPartnerForDate(user, asOf) || user?.team || '',
      designation: getDesignationForDate(user, asOf) || user?.designation || '',
      monthYear,
      summary: {
        scheduledHours: '',
        shortHours: '',
        excessHours: '',
        totalHour: item.summary?.totalHour ?? 0,
        totalLateArrival: item.summary?.totalLateArrival ?? 0,
        excessHour: item.summary?.excessHour ?? 0,
        totalHalfDay: item.summary?.totalHalfDay ?? 0,
        totalPresent: item.summary?.totalPresent ?? 0,
        totalAbsent: item.summary?.totalAbsent ?? 0,
        totalLeave: item.summary?.totalLeave ?? 0,
      },
      recordDetails,
      calcExcessDeficit: item.summary?.excessHour ?? 0,
    } as EnrichedSummary;
  });
}

export function buildExportContext(
  summaries: EnrichedSummary[],
  users: User[],
  holidays: { date: string; name: string }[],
  monthYear: string
): SummaryExportContext {
  const [y, m] = monthYear.split('-').map(Number);
  return {
    filteredSummaries: summaries,
    allUsers: users,
    holidays,
    filterType: 'month',
    selectedYear: y,
    selectedMonth: m,
    currentWeekStart: '',
    rangeStart: '',
    rangeEnd: '',
    selectedEmployeeIds: new Set(),
    summaryPeriodBase: {
      filterType: 'month',
      selectedYear: y,
      selectedMonth: m,
      currentWeekStart: '',
      rangeEnd: '',
    },
    resolveWorkPartner: (user, my) =>
      getWorkingUnderPartnerForDate(user, my ? `${my}-28` : `${monthYear}-28`) ||
      user?.team ||
      '',
    resolveDesignation: (user, my) =>
      getDesignationForDate(user, my ? `${my}-28` : `${monthYear}-28`) ||
      user?.designation ||
      '',
    countTotalSundaysInPeriod: () => 0,
  };
}
