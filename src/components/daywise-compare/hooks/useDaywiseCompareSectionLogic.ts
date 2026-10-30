'use client';

import { startTransition, useCallback, useEffect, useMemo, useState } from 'react';
import { buildDaywiseWorkbook } from '@/components/summary/exports/daywiseExport';
import { downloadWorkbook } from '@/components/summary/exports/downloadWorkbook';
import { compareDaywiseRows, parseDaywiseSheetBuffer, plainRowsFromDaywiseWorkbook, type DaywiseCompareResult, type DaywiseRowDiff } from '@/lib/daywiseSheetCompare';
import type { KindFilter, EmployeeGroup, Props } from '../types';
import { DATES_PAGE_SIZE } from '../constants';
import { monthOptions, yieldToBrowser, fetchPortalSummariesForMonth, formatMonthLabel, buildExportContext } from '../utils/daywiseCompareUtils';

export function useDaywiseCompareSectionLogic({ allUsers = [], holidays = [] }: Props) {
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

  return {
    selectedMonth,
    setSelectedMonth,
    humanFile,
    setHumanFile,
    comparing,
    error,
    setError,
    result,
    setResult,
    expandedKey,
    setExpandedKey,
    kindFilter,
    setKindFilter,
    fieldFilter,
    setFieldFilter,
    employeeQuery,
    setEmployeeQuery,
    setSelectedEmployeeKey,
    visibleDateCount,
    setVisibleDateCount,
    months,
    topFields,
    visibleEmployees,
    activeEmployee,
    activeDiffs,
    totalComparedRows,
    matchPercent,
    handleCompare,
    kindBadge,
    kindLabel,
    handleDownloadDifferences,
  } as const;
}
