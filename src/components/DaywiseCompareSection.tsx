'use client';

import React, { startTransition, useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  Download,
  FileSpreadsheet,
  Loader2,
  Search,
  Upload,
} from 'lucide-react';
import type { User } from '@/types/ui';
import { buildDaywiseWorkbook } from '@/components/summary/exports/daywiseExport';
import { downloadWorkbook } from '@/components/summary/exports/downloadWorkbook';
import type { SummaryExportContext } from '@/components/summary/exports/exportTypes';
import type { EnrichedSummary } from '@/components/summary/types';
import {
  compareDaywiseRows,
  parseDaywiseSheetBuffer,
  plainRowsFromDaywiseWorkbook,
  type DaywiseCompareResult,
  type DaywiseRowDiff,
} from '@/lib/daywiseSheetCompare';
import { getDesignationForDate, getWorkingUnderPartnerForDate } from '@/lib/userFieldHistory';

type Props = {
  allUsers?: User[];
  holidays?: { date: string; name: string }[];
};

type KindFilter = 'all' | DaywiseRowDiff['kind'];

type EmployeeGroup = {
  key: string;
  name: string;
  code: string;
  diffs: DaywiseRowDiff[];
  mismatch: number;
  missing: number;
  extra: number;
  total: number;
};

const DATES_PAGE_SIZE = 25;

function yieldToBrowser(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function monthOptions(): string[] {
  const out: string[] = [];
  const now = new Date();
  for (let i = 0; i < 36; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }
  return out;
}

function formatMonthLabel(my: string): string {
  const [y, m] = my.split('-').map(Number);
  if (!y || !m) return my;
  return new Date(y, m - 1, 1).toLocaleString('en-IN', { month: 'long', year: 'numeric' });
}

async function fetchPortalSummariesForMonth(
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

function buildExportContext(
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

export const DaywiseCompareSection: React.FC<Props> = ({ allUsers = [], holidays = [] }) => {
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });
  const [humanFile, setHumanFile] = useState<File | null>(null);
  const [comparing, setComparing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<DaywiseCompareResult | null>(null);
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const [kindFilter, setKindFilter] = useState<KindFilter>('all');
  const [fieldFilter, setFieldFilter] = useState<string | null>(null);
  const [employeeQuery, setEmployeeQuery] = useState('');
  const [selectedEmployeeKey, setSelectedEmployeeKey] = useState<string | null>(null);
  const [visibleDateCount, setVisibleDateCount] = useState(DATES_PAGE_SIZE);

  const months = useMemo(() => monthOptions(), []);

  /** All differences grouped per employee — keeps the DOM small and mirrors how HR reviews. */
  const employeeGroups = useMemo<EmployeeGroup[]>(() => {
    if (!result) return [];
    const map = new Map<string, EmployeeGroup>();
    for (const diff of result.diffs) {
      const key = (diff.employeeCode || diff.employeeName || 'unknown').toLowerCase();
      let group = map.get(key);
      if (!group) {
        group = {
          key,
          name: diff.employeeName || diff.employeeCode || 'Unknown',
          code: diff.employeeCode || '',
          diffs: [],
          mismatch: 0,
          missing: 0,
          extra: 0,
          total: 0,
        };
        map.set(key, group);
      }
      group.diffs.push(diff);
      group.total += 1;
      if (diff.kind === 'mismatch') group.mismatch += 1;
      else if (diff.kind === 'missingInHuman') group.missing += 1;
      else group.extra += 1;
    }
    return [...map.values()].sort(
      (a, b) => b.total - a.total || a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
    );
  }, [result]);

  /** Which columns disagree most often — answers "why do the sheets differ?" at a glance. */
  const topFields = useMemo(() => {
    if (!result) return [];
    const counts = new Map<string, { key: string; label: string; count: number }>();
    for (const diff of result.diffs) {
      for (const field of diff.fields) {
        const entry = counts.get(field.key) || { key: field.key, label: field.label, count: 0 };
        entry.count += 1;
        counts.set(field.key, entry);
      }
    }
    return [...counts.values()].sort((a, b) => b.count - a.count).slice(0, 8);
  }, [result]);

  const matchesFilters = useCallback(
    (diff: DaywiseRowDiff) => {
      if (kindFilter !== 'all' && diff.kind !== kindFilter) return false;
      if (fieldFilter && !diff.fields.some((f) => f.key === fieldFilter)) return false;
      return true;
    },
    [kindFilter, fieldFilter]
  );

  const visibleEmployees = useMemo(() => {
    const q = employeeQuery.trim().toLowerCase();
    return employeeGroups
      .map((group) => ({ group, count: group.diffs.filter(matchesFilters).length }))
      .filter(({ group, count }) => {
        if (count === 0) return false;
        if (!q) return true;
        return group.name.toLowerCase().includes(q) || group.code.toLowerCase().includes(q);
      });
  }, [employeeGroups, employeeQuery, matchesFilters]);

  const activeEmployee = useMemo(() => {
    if (!visibleEmployees.length) return null;
    const found = visibleEmployees.find(({ group }) => group.key === selectedEmployeeKey);
    return (found || visibleEmployees[0]).group;
  }, [visibleEmployees, selectedEmployeeKey]);

  const activeDiffs = useMemo(() => {
    if (!activeEmployee) return [];
    return activeEmployee.diffs.filter(matchesFilters);
  }, [activeEmployee, matchesFilters]);

  useEffect(() => {
    setVisibleDateCount(DATES_PAGE_SIZE);
    setExpandedKey(null);
  }, [activeEmployee?.key, kindFilter, fieldFilter]);

  const totalComparedRows = result
    ? result.matchedRowCount +
      result.mismatchCount +
      result.missingInHumanCount +
      result.extraInHumanCount
    : 0;
  const matchPercent = totalComparedRows
    ? Math.round((result!.matchedRowCount / totalComparedRows) * 100)
    : 0;

  const handleCompare = useCallback(async () => {
    if (!humanFile) {
      setError('Upload the human-maintained daywise Excel file first.');
      return;
    }
    setComparing(true);
    setError(null);
    setResult(null);
    setExpandedKey(null);
    setKindFilter('all');
    setFieldFilter(null);
    setEmployeeQuery('');
    setSelectedEmployeeKey(null);
    setVisibleDateCount(DATES_PAGE_SIZE);
    await yieldToBrowser();
    try {
      let users = allUsers;
      if (!users.length) {
        const usersRes = await fetch('/api/users?listOnly=1&includeInactive=1');
        const usersJson = await usersRes.json();
        if (!usersRes.ok || !usersJson.success) {
          throw new Error(usersJson.error || 'Failed to load employees');
        }
        users = usersJson.data || [];
      }

      const [y] = selectedMonth.split('-').map(Number);
      let holidayList = holidays;
      if (!holidayList.length) {
        try {
          const hRes = await fetch(`/api/holidays?year=${y}&activeOnly=true`);
          const hJson = await hRes.json();
          if (hRes.ok && hJson.data) {
            holidayList = hJson.data.map((h: { date: string; name: string }) => ({
              date: h.date,
              name: h.name,
            }));
          }
        } catch {
          holidayList = [];
        }
      }

      await yieldToBrowser();
      const summaries = await fetchPortalSummariesForMonth(selectedMonth, users);
      if (!summaries.length) {
        throw new Error(`No portal attendance found for ${formatMonthLabel(selectedMonth)}`);
      }

      const ctx = buildExportContext(summaries, users, holidayList, selectedMonth);
      await yieldToBrowser();
      const workbook = await buildDaywiseWorkbook(ctx, { skipFormatting: true });
      if (!workbook) {
        throw new Error('Could not build portal daywise sheet for this month');
      }

      await yieldToBrowser();
      const humanBuf = await humanFile.arrayBuffer();
      await yieldToBrowser();
      const [portalRows, humanRows] = await Promise.all([
        plainRowsFromDaywiseWorkbook(workbook),
        parseDaywiseSheetBuffer(humanBuf),
      ]);

      if (!humanRows.length) {
        throw new Error('No data rows found in the uploaded human sheet');
      }

      await yieldToBrowser();
      const compared = compareDaywiseRows(portalRows, humanRows);
      startTransition(() => {
        setResult(compared);
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Compare failed');
    } finally {
      setComparing(false);
    }
  }, [allUsers, holidays, humanFile, selectedMonth]);

  const kindBadge = (kind: DaywiseRowDiff['kind']) => {
    if (kind === 'mismatch') {
      return 'border-amber-200 bg-amber-50 text-amber-900';
    }
    if (kind === 'missingInHuman') {
      return 'border-rose-200 bg-rose-50 text-rose-900';
    }
    return 'border-sky-200 bg-sky-50 text-sky-900';
  };

  const kindLabel = (kind: DaywiseRowDiff['kind']) => {
    if (kind === 'mismatch') return 'Field mismatch';
    if (kind === 'missingInHuman') return 'Missing in human';
    return 'Extra in human';
  };

  const handleDownloadDifferences = useCallback(async () => {
    if (!result) return;
    const ExcelJS = (await import('exceljs')).default;
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Differences', {
      views: [{ state: 'frozen', ySplit: 1 }],
    });
    sheet.columns = [
      { header: 'Employee', key: 'employee', width: 26 },
      { header: 'Employee code', key: 'code', width: 14 },
      { header: 'Date', key: 'date', width: 12 },
      { header: 'Issue type', key: 'kind', width: 18 },
      { header: 'Column', key: 'field', width: 22 },
      { header: 'Portal value', key: 'portal', width: 18 },
      { header: 'Human value', key: 'human', width: 18 },
      { header: 'Why it differs', key: 'reason', width: 70 },
    ];
    sheet.getRow(1).font = { bold: true };

    for (const diff of result.diffs) {
      if (diff.fields.length === 0) {
        sheet.addRow({
          employee: diff.employeeName || diff.employeeCode,
          code: diff.employeeCode,
          date: diff.date,
          kind: kindLabel(diff.kind),
          field: '',
          portal: '',
          human: '',
          reason: diff.summary,
        });
        continue;
      }
      for (const field of diff.fields) {
        sheet.addRow({
          employee: diff.employeeName || diff.employeeCode,
          code: diff.employeeCode,
          date: diff.date,
          kind: kindLabel(diff.kind),
          field: field.label,
          portal: field.portal,
          human: field.human,
          reason: field.reason,
        });
      }
    }

    const buffer = await workbook.xlsx.writeBuffer();
    await downloadWorkbook(buffer as ArrayBuffer, `daywise_differences_${selectedMonth}.xlsx`);
  }, [result, selectedMonth]);

  return (
    <section className="space-y-6">
      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-4 flex items-start gap-3">
          <div className="rounded-lg bg-blue-50 p-2 text-blue-700">
            <FileSpreadsheet className="h-5 w-5" aria-hidden />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Daywise sheet compare</h2>
            <p className="mt-1 text-sm text-slate-600">
              Pick a month, upload the human-maintained daywise Excel, and compare it with a freshly
              generated portal sheet. Portal export format works best; older sheets with{' '}
              <strong>Employee Name + Date</strong> (even without Employee Code) are also accepted.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Month</label>
            <select
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            >
              {months.map((my) => (
                <option key={my} value={my}>
                  {formatMonthLabel(my)}
                </option>
              ))}
            </select>
          </div>

          <div className="md:col-span-2">
            <label className="mb-1 block text-xs font-medium text-slate-600">
              Human daywise Excel
            </label>
            <label className="flex cursor-pointer items-center gap-3 rounded-md border border-dashed border-slate-300 bg-slate-50 px-3 py-2 text-sm text-slate-700 transition hover:border-blue-400 hover:bg-blue-50/40">
              <Upload className="h-4 w-4 text-slate-500" aria-hidden />
              <span className="truncate">
                {humanFile ? humanFile.name : 'Choose .xlsx file…'}
              </span>
              <input
                type="file"
                accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0] || null;
                  setHumanFile(f);
                  setResult(null);
                  setError(null);
                }}
              />
            </label>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => void handleCompare()}
            disabled={comparing || !humanFile}
            className="inline-flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {comparing ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                Comparing…
              </>
            ) : (
              <>
                <AlertTriangle className="h-4 w-4" aria-hidden />
                Compare with portal
              </>
            )}
          </button>
          {humanFile && (
            <button
              type="button"
              onClick={() => {
                setHumanFile(null);
                setResult(null);
                setError(null);
              }}
              className="rounded-md px-3 py-2 text-sm text-slate-600 hover:bg-slate-100"
            >
              Clear file
            </button>
          )}
        </div>

        {error && (
          <div className="mt-4 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
            {error}
          </div>
        )}
      </div>

      {result && (
        <div className="space-y-4">
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="text-sm text-slate-600">
                  Compared {result.portalRowCount.toLocaleString()} portal rows against{' '}
                  {result.humanRowCount.toLocaleString()} rows in your sheet
                </p>
                <p className="mt-1 text-2xl font-semibold text-slate-900">
                  {matchPercent}% match
                  <span className="ml-2 text-sm font-normal text-slate-500">
                    {result.matchedRowCount.toLocaleString()} rows agree,{' '}
                    {result.diffs.length.toLocaleString()} need review
                  </span>
                </p>
              </div>
              {result.diffs.length > 0 && (
                <button
                  type="button"
                  onClick={() => void handleDownloadDifferences()}
                  className="inline-flex items-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-800 shadow-sm hover:bg-slate-50"
                >
                  <Download className="h-4 w-4" aria-hidden />
                  Download differences
                </button>
              )}
            </div>

            <div className="mt-4 flex h-2.5 w-full overflow-hidden rounded-full bg-slate-100">
              {[
                { value: result.matchedRowCount, className: 'bg-emerald-500' },
                { value: result.mismatchCount, className: 'bg-amber-500' },
                { value: result.missingInHumanCount, className: 'bg-rose-500' },
                { value: result.extraInHumanCount, className: 'bg-sky-500' },
              ].map((seg, i) =>
                seg.value > 0 ? (
                  <div
                    key={i}
                    className={seg.className}
                    style={{ width: `${(seg.value / Math.max(1, totalComparedRows)) * 100}%` }}
                  />
                ) : null
              )}
            </div>

            <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
              {(
                [
                  { id: 'all', label: 'All issues', value: result.diffs.length, dot: 'bg-slate-400' },
                  { id: 'mismatch', label: 'Field mismatches', value: result.mismatchCount, dot: 'bg-amber-500' },
                  { id: 'missingInHuman', label: 'Missing in your sheet', value: result.missingInHumanCount, dot: 'bg-rose-500' },
                  { id: 'extraInHuman', label: 'Extra in your sheet', value: result.extraInHumanCount, dot: 'bg-sky-500' },
                ] as Array<{ id: KindFilter; label: string; value: number; dot: string }>
              ).map((card) => {
                const active = kindFilter === card.id;
                return (
                  <button
                    key={card.id}
                    type="button"
                    onClick={() => setKindFilter(card.id)}
                    className={`rounded-lg border px-3 py-2.5 text-left transition ${
                      active
                        ? 'border-blue-400 bg-blue-50/60 ring-2 ring-blue-500/20'
                        : 'border-slate-200 bg-white hover:bg-slate-50'
                    }`}
                  >
                    <span className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-slate-500">
                      <span className={`h-2 w-2 rounded-full ${card.dot}`} />
                      {card.label}
                    </span>
                    <span className="mt-1 block text-xl font-semibold text-slate-900">
                      {card.value.toLocaleString()}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {result.diffs.length === 0 ? (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-8 text-center">
              <CheckCircle2 className="mx-auto h-8 w-8 text-emerald-600" aria-hidden />
              <p className="mt-2 text-sm font-medium text-emerald-900">
                No differences — your sheet matches the portal daywise export for this month.
              </p>
            </div>
          ) : (
            <>
              {topFields.length > 0 && (
                <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <h3 className="text-sm font-semibold text-slate-900">
                      Which columns differ most
                    </h3>
                    {fieldFilter && (
                      <button
                        type="button"
                        onClick={() => setFieldFilter(null)}
                        className="text-xs font-medium text-blue-700 hover:underline"
                      >
                        Clear column filter
                      </button>
                    )}
                  </div>
                  <ul className="space-y-1.5">
                    {topFields.map((field) => {
                      const active = fieldFilter === field.key;
                      const pct = (field.count / topFields[0].count) * 100;
                      return (
                        <li key={field.key}>
                          <button
                            type="button"
                            onClick={() => setFieldFilter(active ? null : field.key)}
                            className={`flex w-full items-center gap-3 rounded-md px-2 py-1.5 text-left transition ${
                              active ? 'bg-blue-50 ring-1 ring-blue-300' : 'hover:bg-slate-50'
                            }`}
                          >
                            <span className="w-44 shrink-0 truncate text-sm text-slate-800">
                              {field.label}
                            </span>
                            <span className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100">
                              <span
                                className="block h-full rounded-full bg-amber-400"
                                style={{ width: `${pct}%` }}
                              />
                            </span>
                            <span className="w-14 shrink-0 text-right text-sm font-medium text-slate-700">
                              {field.count.toLocaleString()}
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}

              <div className="grid grid-cols-1 gap-4 lg:grid-cols-[300px_minmax(0,1fr)]">
                <aside className="rounded-xl border border-slate-200 bg-white shadow-sm">
                  <div className="border-b border-slate-100 p-3">
                    <h3 className="mb-2 text-sm font-semibold text-slate-900">
                      Employees with issues ({visibleEmployees.length})
                    </h3>
                    <div className="relative">
                      <Search
                        className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-slate-400"
                        aria-hidden
                      />
                      <input
                        type="search"
                        value={employeeQuery}
                        onChange={(e) => setEmployeeQuery(e.target.value)}
                        placeholder="Find employee…"
                        className="w-full rounded-md border border-slate-200 py-2 pl-8 pr-3 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                      />
                    </div>
                  </div>
                  <ul className="max-h-[32rem] divide-y divide-slate-100 overflow-y-auto">
                    {visibleEmployees.map(({ group, count }) => {
                      const active = activeEmployee?.key === group.key;
                      return (
                        <li key={group.key}>
                          <button
                            type="button"
                            onClick={() => setSelectedEmployeeKey(group.key)}
                            className={`flex w-full items-center gap-2 px-3 py-2.5 text-left transition ${
                              active ? 'bg-blue-50' : 'hover:bg-slate-50'
                            }`}
                          >
                            <div className="min-w-0 flex-1">
                              <p
                                className={`truncate text-sm ${
                                  active ? 'font-semibold text-blue-900' : 'text-slate-800'
                                }`}
                              >
                                {group.name}
                              </p>
                              {group.code && (
                                <p className="truncate text-xs text-slate-500">{group.code}</p>
                              )}
                            </div>
                            <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">
                              {count}
                            </span>
                            <ChevronRight className="h-4 w-4 shrink-0 text-slate-300" aria-hidden />
                          </button>
                        </li>
                      );
                    })}
                    {visibleEmployees.length === 0 && (
                      <li className="px-3 py-8 text-center text-sm text-slate-500">
                        No employees match this view.
                      </li>
                    )}
                  </ul>
                </aside>

                <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                  {!activeEmployee ? (
                    <p className="py-12 text-center text-sm text-slate-500">
                      Select an employee to see their day-by-day differences.
                    </p>
                  ) : (
                    <>
                      <div className="mb-4 border-b border-slate-100 pb-3">
                        <h3 className="text-base font-semibold text-slate-900">
                          {activeEmployee.name}
                        </h3>
                        <p className="mt-0.5 text-sm text-slate-600">
                          {activeEmployee.code ? `${activeEmployee.code} · ` : ''}
                          {activeDiffs.length} day{activeDiffs.length === 1 ? '' : 's'} to review
                          {activeEmployee.mismatch > 0
                            ? ` · ${activeEmployee.mismatch} mismatch`
                            : ''}
                          {activeEmployee.missing > 0 ? ` · ${activeEmployee.missing} missing` : ''}
                          {activeEmployee.extra > 0 ? ` · ${activeEmployee.extra} extra` : ''}
                        </p>
                      </div>

                      <ul className="space-y-3">
                        {activeDiffs.slice(0, visibleDateCount).map((diff) => (
                          <li
                            key={diff.key}
                            className="rounded-lg border border-slate-200 bg-slate-50/60 p-3"
                          >
                            <div className="mb-2 flex flex-wrap items-center gap-2">
                              <span className="text-sm font-semibold text-slate-900">
                                {diff.date}
                              </span>
                              <span
                                className={`rounded border px-1.5 py-0.5 text-[11px] font-medium ${kindBadge(
                                  diff.kind
                                )}`}
                              >
                                {kindLabel(diff.kind)}
                              </span>
                            </div>

                            {diff.fields.length === 0 ? (
                              <p className="text-sm text-slate-700">{diff.summary}</p>
                            ) : (
                              <div className="overflow-hidden rounded-md border border-slate-200 bg-white">
                                <table className="w-full text-sm">
                                  <thead>
                                    <tr className="bg-slate-50 text-left text-[11px] uppercase tracking-wide text-slate-500">
                                      <th className="px-3 py-2 font-medium">Column</th>
                                      <th className="px-3 py-2 font-medium">Portal</th>
                                      <th className="px-3 py-2 font-medium">Your sheet</th>
                                      <th className="w-10 px-3 py-2" />
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-slate-100">
                                    {diff.fields.map((f) => {
                                      const reasonKey = `${diff.key}::${f.key}`;
                                      const showReason = expandedKey === reasonKey;
                                      return (
                                        <React.Fragment key={f.key}>
                                          <tr className="align-top">
                                            <td className="px-3 py-2 text-slate-800">{f.label}</td>
                                            <td className="px-3 py-2 font-medium text-slate-900">
                                              {f.portal || (
                                                <span className="text-slate-400">(blank)</span>
                                              )}
                                            </td>
                                            <td className="px-3 py-2 font-medium text-amber-800">
                                              {f.human || (
                                                <span className="text-slate-400">(blank)</span>
                                              )}
                                            </td>
                                            <td className="px-3 py-2 text-right">
                                              <button
                                                type="button"
                                                onClick={() =>
                                                  setExpandedKey(showReason ? null : reasonKey)
                                                }
                                                className="text-xs font-medium text-blue-700 hover:underline"
                                              >
                                                {showReason ? 'Hide' : 'Why?'}
                                              </button>
                                            </td>
                                          </tr>
                                          {showReason && (
                                            <tr>
                                              <td
                                                colSpan={4}
                                                className="bg-slate-50 px-3 py-2 text-xs text-slate-600"
                                              >
                                                {f.reason}
                                              </td>
                                            </tr>
                                          )}
                                        </React.Fragment>
                                      );
                                    })}
                                  </tbody>
                                </table>
                              </div>
                            )}
                          </li>
                        ))}
                      </ul>

                      {visibleDateCount < activeDiffs.length && (
                        <div className="mt-4 flex justify-center">
                          <button
                            type="button"
                            onClick={() =>
                              setVisibleDateCount((n) =>
                                Math.min(n + DATES_PAGE_SIZE, activeDiffs.length)
                              )
                            }
                            className="rounded-md border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-800 shadow-sm hover:bg-slate-50"
                          >
                            Show more days ({activeDiffs.length - visibleDateCount} left)
                          </button>
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </section>
  );
};
