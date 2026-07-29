'use client';

import React, { useCallback, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  FileSpreadsheet,
  Loader2,
  Search,
  Upload,
} from 'lucide-react';
import type { User } from '@/types/ui';
import { buildDaywiseWorkbook } from '@/components/summary/exports/daywiseExport';
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
  const [searchTerm, setSearchTerm] = useState('');
  const [kindFilter, setKindFilter] = useState<'all' | DaywiseRowDiff['kind']>('all');
  const [expandedKey, setExpandedKey] = useState<string | null>(null);

  const months = useMemo(() => monthOptions(), []);

  const filteredDiffs = useMemo(() => {
    if (!result) return [];
    const q = searchTerm.trim().toLowerCase();
    return result.diffs.filter((d) => {
      if (kindFilter !== 'all' && d.kind !== kindFilter) return false;
      if (!q) return true;
      return (
        d.employeeCode.toLowerCase().includes(q) ||
        d.employeeName.toLowerCase().includes(q) ||
        d.date.includes(q) ||
        d.summary.toLowerCase().includes(q)
      );
    });
  }, [result, searchTerm, kindFilter]);

  const handleCompare = useCallback(async () => {
    if (!humanFile) {
      setError('Upload the human-maintained daywise Excel file first.');
      return;
    }
    setComparing(true);
    setError(null);
    setResult(null);
    setExpandedKey(null);
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

      const summaries = await fetchPortalSummariesForMonth(selectedMonth, users);
      if (!summaries.length) {
        throw new Error(`No portal attendance found for ${formatMonthLabel(selectedMonth)}`);
      }

      const ctx = buildExportContext(summaries, users, holidayList, selectedMonth);
      const workbook = await buildDaywiseWorkbook(ctx);
      if (!workbook) {
        throw new Error('Could not build portal daywise sheet for this month');
      }

      const [portalRows, humanRows] = await Promise.all([
        plainRowsFromDaywiseWorkbook(workbook),
        humanFile.arrayBuffer().then((buf) => parseDaywiseSheetBuffer(buf)),
      ]);

      if (!humanRows.length) {
        throw new Error('No data rows found in the uploaded human sheet');
      }

      setResult(compareDaywiseRows(portalRows, humanRows));
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
              Pick a month, upload the human-maintained daywise Excel (same format as the portal
              export), and compare it with a freshly generated portal sheet to see mismatches and
              why they differ.
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
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
            {[
              { label: 'Portal rows', value: result.portalRowCount },
              { label: 'Human rows', value: result.humanRowCount },
              { label: 'Matched', value: result.matchedRowCount },
              { label: 'Mismatches', value: result.mismatchCount },
              { label: 'Missing in human', value: result.missingInHumanCount },
              { label: 'Extra in human', value: result.extraInHumanCount },
            ].map((card) => (
              <div
                key={card.label}
                className="rounded-lg border border-slate-200 bg-white px-3 py-3 shadow-sm"
              >
                <div className="text-[11px] font-medium uppercase tracking-wide text-slate-500">
                  {card.label}
                </div>
                <div className="mt-1 text-xl font-semibold text-slate-900">{card.value}</div>
              </div>
            ))}
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="mb-3 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <h3 className="text-sm font-semibold text-slate-900">
                Differences ({filteredDiffs.length})
              </h3>
              <div className="flex flex-col gap-2 sm:flex-row">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
                  <input
                    type="search"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="Search code, name, date…"
                    className="w-full rounded-md border border-slate-200 py-2 pl-8 pr-3 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 sm:w-56"
                  />
                </div>
                <select
                  value={kindFilter}
                  onChange={(e) => setKindFilter(e.target.value as typeof kindFilter)}
                  className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                >
                  <option value="all">All issue types</option>
                  <option value="mismatch">Field mismatches</option>
                  <option value="missingInHuman">Missing in human</option>
                  <option value="extraInHuman">Extra in human</option>
                </select>
              </div>
            </div>

            {filteredDiffs.length === 0 ? (
              <p className="py-8 text-center text-sm text-slate-500">
                {result.diffs.length === 0
                  ? 'No differences — human sheet matches the portal daywise export for this month.'
                  : 'No rows match the current filters.'}
              </p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {filteredDiffs.map((diff) => {
                  const open = expandedKey === diff.key;
                  return (
                    <li key={diff.key}>
                      <button
                        type="button"
                        onClick={() => setExpandedKey(open ? null : diff.key)}
                        className="flex w-full items-start gap-3 px-1 py-3 text-left hover:bg-slate-50"
                      >
                        {open ? (
                          <ChevronDown className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
                        ) : (
                          <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
                        )}
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-medium text-slate-900">
                              {diff.employeeName || diff.employeeCode}
                            </span>
                            <span className="text-xs text-slate-500">{diff.employeeCode}</span>
                            <span className="text-xs text-slate-500">{diff.date}</span>
                            <span
                              className={`rounded border px-1.5 py-0.5 text-[11px] font-medium ${kindBadge(diff.kind)}`}
                            >
                              {kindLabel(diff.kind)}
                            </span>
                          </div>
                          <p className="mt-0.5 text-xs text-slate-600">{diff.summary}</p>
                        </div>
                      </button>
                      {open && (
                        <div className="mb-3 ml-7 space-y-2 rounded-md border border-slate-200 bg-slate-50/80 p-3">
                          {diff.kind !== 'mismatch' ? (
                            <p className="text-sm text-slate-700">{diff.summary}</p>
                          ) : (
                            diff.fields.map((f) => (
                              <div
                                key={f.key}
                                className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm"
                              >
                                <div className="font-medium text-slate-800">{f.label}</div>
                                <div className="mt-1 grid gap-1 text-xs sm:grid-cols-2">
                                  <div>
                                    <span className="text-slate-500">Portal: </span>
                                    <span className="font-medium text-slate-900">
                                      {f.portal || '(blank)'}
                                    </span>
                                  </div>
                                  <div>
                                    <span className="text-slate-500">Human: </span>
                                    <span className="font-medium text-slate-900">
                                      {f.human || '(blank)'}
                                    </span>
                                  </div>
                                </div>
                                <p className="mt-1.5 text-xs text-slate-600">{f.reason}</p>
                              </div>
                            ))
                          )}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      )}
    </section>
  );
};
