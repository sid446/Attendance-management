import React, { useState, useEffect, useRef } from 'react';
import { hrCredentialsInit } from '@/lib/hrAuthHeaders';
import { confirmMajorAction } from '@/lib/confirmMajorAction';
import { downloadWorkbook } from '@/components/summary/exports/downloadWorkbook';
import type { LeaveBalance, UploadRow, UploadPreview, LeaveManagementSectionProps } from '../types';
import { currentMonthYear, leaveMonthOptions, formatPeriodLabel, clampMonthYear, formatMonthLabel, formatLeaveValue } from '../utils/leaveManagementUtils';

export function useLeaveManagementSectionLogic({ onRefresh }: Pick<LeaveManagementSectionProps, 'onRefresh'>) {
  const [leaveBalances, setLeaveBalances] = useState<LeaveBalance[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [filterTeam, setFilterTeam] = useState<string>('all');
  const [fromMonth, setFromMonth] = useState<string>(() => currentMonthYear());
  const [monthFilter, setMonthFilter] = useState<string>(() => currentMonthYear());
  const [exporting, setExporting] = useState(false);
  const [sortBy, setSortBy] = useState<
    'name' | 'balanceAsOfJan26' | 'earned' | 'remaining' | 'leaveAdjLwp' | 'leaveAdjLwpThisMonth'
  >('earned');
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [activeTab, setActiveTab] = useState<'all' | 'articles' | 'employees'>('all');

  const fileInputRef = useRef<HTMLInputElement>(null);
  const adjFileInputRef = useRef<HTMLInputElement>(null);
  const [uploadBusy, setUploadBusy] = useState<boolean>(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadNotice, setUploadNotice] = useState<string | null>(null);
  const [pendingRows, setPendingRows] = useState<UploadRow[] | null>(null);
  const [preview, setPreview] = useState<UploadPreview | null>(null);
  const [savingAdjUserId, setSavingAdjUserId] = useState<string | null>(null);

  const monthOptions = leaveMonthOptions();
  const earliestMonth = [...monthOptions].sort()[0] || '2026-01';
  const latestMonth = currentMonthYear();
  const periodLabel = formatPeriodLabel(fromMonth, monthFilter);

  const applyPeriod = (nextFrom: string, nextTo: string) => {
    const from = clampMonthYear(nextFrom, monthOptions);
    const to = clampMonthYear(nextTo, monthOptions);
    if (from <= to) {
      setFromMonth(from);
      setMonthFilter(to);
    } else {
      setFromMonth(to);
      setMonthFilter(from);
    }
  };

  const fetchLeaveBalances = async (monthYear = monthFilter) => {
    setLoading(true);
    try {
      const response = await fetch(
        `/api/leave/balances?monthYear=${encodeURIComponent(monthYear)}&_=${Date.now()}`,
        hrCredentialsInit({
          cache: 'no-store',
          headers: { 'Cache-Control': 'no-cache' },
        })
      );
      if (!response.ok) {
        throw new Error('Failed to fetch leave balances');
      }
      const data = await response.json();
      if (data.success) {
        setLeaveBalances(data.data);
      } else {
        throw new Error(data.error || 'Failed to fetch leave balances');
      }
    } catch (err) {
      console.error('Error fetching leave balances:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchLeaveBalances(monthFilter);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- refetch when period end changes
  }, [monthFilter]);

  const filteredAndSortedBalances = leaveBalances
    .filter(balance => {
      const matchesTab = activeTab === 'all' || 
        (activeTab === 'articles' && balance.employmentType?.toLowerCase() === 'article') ||
        (activeTab === 'employees' && balance.employmentType?.toLowerCase() !== 'article');
      
      const matchesTeam = filterTeam === 'all' || balance.team === filterTeam;
      
      const matchesSearch = balance.userName.toLowerCase().includes(searchTerm.toLowerCase()) || 
        (balance.employeeCode && balance.employeeCode.toLowerCase().includes(searchTerm.toLowerCase()));
      
      return matchesTab && matchesTeam && matchesSearch;
    })
    .sort((a, b) => {
      switch (sortBy) {
        case 'balanceAsOfJan26':
          return b.balanceAsOfJan26 - a.balanceAsOfJan26;
        case 'earned':
          return b.earned - a.earned;
        case 'remaining':
          return b.remaining - a.remaining;
        case 'leaveAdjLwp':
          return (b.leaveAdjLwp || 0) - (a.leaveAdjLwp || 0);
        case 'leaveAdjLwpThisMonth':
          return (b.leaveAdjLwpThisMonth || 0) - (a.leaveAdjLwpThisMonth || 0);
        case 'name':
        default:
          return a.userName.localeCompare(b.userName);
      }
    });

  const teams = Array.from(new Set(leaveBalances.map(b => b.team).filter(Boolean)));

  const totalStats = filteredAndSortedBalances.reduce(
    (acc, balance) => ({
      totalBalanceAsOfJan26: acc.totalBalanceAsOfJan26 + balance.balanceAsOfJan26,
      totalEarned: acc.totalEarned + balance.earned,
      totalLeaveAdjLwp: acc.totalLeaveAdjLwp + (balance.leaveAdjLwp || 0),
      totalLeaveAdjLwpThisMonth: acc.totalLeaveAdjLwpThisMonth + (balance.leaveAdjLwpThisMonth || 0),
      totalUsedAfterJan26: acc.totalUsedAfterJan26 + (balance.usedAfterJan26 || 0),
      totalRemaining: acc.totalRemaining + balance.remaining,
    }),
    {
      totalBalanceAsOfJan26: 0,
      totalEarned: 0,
      totalLeaveAdjLwp: 0,
      totalLeaveAdjLwpThisMonth: 0,
      totalUsedAfterJan26: 0,
      totalRemaining: 0,
    }
  );

  const selectCls =
    'rounded-md border border-blue-200/65 bg-panel px-3 py-2 text-sm text-slate-800 shadow-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20';

  const handleRefresh = () => {
    void fetchLeaveBalances(monthFilter);
    onRefresh();
  };

  const exportToExcel = async () => {
    if (filteredAndSortedBalances.length === 0) return;
    setExporting(true);
    setUploadError(null);
    try {
      const ExcelJS = (await import('exceljs')).default;
      const workbook = new ExcelJS.Workbook();
      const sheet = workbook.addWorksheet('Leave balances');
      sheet.columns = [
        { header: 'Employee Name', key: 'userName', width: 28 },
        { header: 'Employee Code', key: 'employeeCode', width: 16 },
        { header: 'Type', key: 'employmentType', width: 14 },
        { header: 'Team', key: 'team', width: 22 },
        { header: 'Balance 1 Jan 26', key: 'balanceAsOfJan26', width: 18 },
        { header: `Earned through ${formatMonthLabel(monthFilter)}`, key: 'earned', width: 22 },
        { header: `Adj ${formatMonthLabel(monthFilter)}`, key: 'leaveAdjLwpThisMonth', width: 18 },
        { header: 'Adj till this month', key: 'leaveAdjLwp', width: 18 },
        { header: `Used through ${formatMonthLabel(monthFilter)}`, key: 'usedAfterJan26', width: 22 },
        { header: 'Balance', key: 'remaining', width: 14 },
        { header: 'Last updated', key: 'lastUpdated', width: 16 },
        { header: 'Period from', key: 'periodFrom', width: 16 },
        { header: 'Period to', key: 'periodTo', width: 16 },
      ];

      for (const balance of filteredAndSortedBalances) {
        const isArticle = balance.employmentType?.toLowerCase() === 'article';
        sheet.addRow({
          userName: balance.userName,
          employeeCode: balance.employeeCode || '',
          employmentType: isArticle ? 'Article' : 'Employee',
          team: balance.team || '',
          balanceAsOfJan26: Number(formatLeaveValue(balance.balanceAsOfJan26)),
          earned: isArticle ? 'N/A' : Number(formatLeaveValue(balance.earned)),
          leaveAdjLwpThisMonth: Number(formatLeaveValue(balance.leaveAdjLwpThisMonth ?? 0)),
          leaveAdjLwp: Number(formatLeaveValue(balance.leaveAdjLwp ?? 0)),
          usedAfterJan26: Number(formatLeaveValue(balance.usedAfterJan26 || 0)),
          remaining: Number(formatLeaveValue(balance.remaining)),
          lastUpdated: new Date(balance.lastUpdated).toLocaleDateString('en-GB'),
          periodFrom: formatMonthLabel(fromMonth),
          periodTo: formatMonthLabel(monthFilter),
        });
      }

      const totalRow = sheet.addRow({
        userName: 'TOTAL',
        employeeCode: '',
        employmentType: '',
        team: '',
        balanceAsOfJan26: Number(formatLeaveValue(totalStats.totalBalanceAsOfJan26)),
        earned: Number(formatLeaveValue(totalStats.totalEarned)),
        leaveAdjLwpThisMonth: Number(formatLeaveValue(totalStats.totalLeaveAdjLwpThisMonth)),
        leaveAdjLwp: Number(formatLeaveValue(totalStats.totalLeaveAdjLwp)),
        usedAfterJan26: Number(formatLeaveValue(totalStats.totalUsedAfterJan26)),
        remaining: Number(formatLeaveValue(totalStats.totalRemaining)),
        lastUpdated: '',
        periodFrom: formatMonthLabel(fromMonth),
        periodTo: formatMonthLabel(monthFilter),
      });
      totalRow.font = { bold: true };

      sheet.spliceRows(1, 0, [`Leave balances — ${periodLabel}`]);
      sheet.mergeCells(1, 1, 1, 13);
      const titleCell = sheet.getCell(1, 1);
      titleCell.font = { bold: true, size: 14, color: { argb: 'FF1E40AF' } };
      titleCell.alignment = { vertical: 'middle', horizontal: 'left' };

      const headerRow = sheet.getRow(2);
      headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      headerRow.alignment = { vertical: 'middle', horizontal: 'center' };
      headerRow.eachCell((cell) => {
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FF1E40AF' },
        };
        cell.border = {
          top: { style: 'thin', color: { argb: 'FF000000' } },
          bottom: { style: 'thin', color: { argb: 'FF000000' } },
          left: { style: 'thin', color: { argb: 'FF000000' } },
          right: { style: 'thin', color: { argb: 'FF000000' } },
        };
      });

      const buffer = await workbook.xlsx.writeBuffer();
      const fileName =
        fromMonth === monthFilter
          ? `Leave_Balances_${monthFilter}.xlsx`
          : `Leave_Balances_${fromMonth}_to_${monthFilter}.xlsx`;
      await downloadWorkbook(buffer as ArrayBuffer, fileName);
    } catch (err) {
      console.error('Error exporting leave balances:', err);
      setUploadError('Failed to export Excel');
    } finally {
      setExporting(false);
    }
  };

  const handleFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadBusy(true);
    setUploadError(null);
    setUploadNotice(null);
    setPreview(null);
    setPendingRows(null);

    try {
      const XLSX = await import('xlsx');
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data, { cellDates: false });
      const worksheet = workbook.Sheets[workbook.SheetNames[0]];
      const grid: unknown[][] = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

      if (grid.length < 2) {
        throw new Error('The file looks empty or has no header row.');
      }

      let headerRowIndex = -1;
      for (let i = 0; i < Math.min(grid.length, 10); i++) {
        const row = grid[i];
        if (!Array.isArray(row)) continue;
        const cells = row.map((c) => String(c ?? '').toLowerCase());
        if (cells.some((c) => c.includes('name'))) {
          headerRowIndex = i;
          break;
        }
      }
      if (headerRowIndex === -1) {
        throw new Error('Could not find a header row containing "Employee Name".');
      }

      const headers = (grid[headerRowIndex] as unknown[]).map((h) =>
        String(h ?? '').toLowerCase().trim()
      );
      const nameIdx = headers.findIndex((h) => h.includes('name'));
      const bfIdx = headers.findIndex(
        (h) => h.includes('b/f') || h.includes('bf') || h.includes('brought forward')
      );

      if (nameIdx === -1) throw new Error('Could not find an "Employee Name" column.');
      if (bfIdx === -1) throw new Error('Could not find a "Leaves B/F" column.');

      const rows: UploadRow[] = [];
      for (let i = headerRowIndex + 1; i < grid.length; i++) {
        const row = grid[i];
        if (!Array.isArray(row)) continue;
        const name = String(row[nameIdx] ?? '').trim();
        if (!name) continue;
        rows.push({ name, balance: Number(row[bfIdx] ?? 0) });
      }

      if (rows.length === 0) throw new Error('No employee rows found in the file.');

      const res = await fetch(
        '/api/leave/upload-opening-balance',
        hrCredentialsInit({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ rows, mode: 'preview' }),
        })
      );
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || 'Could not read the uploaded balances.');
      }

      setPendingRows(rows);
      setPreview({ ...(json.data as Omit<UploadPreview, 'kind'>), kind: 'bf' });
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploadBusy(false);
      e.target.value = '';
    }
  };

  const handleAdjFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadBusy(true);
    setUploadError(null);
    setUploadNotice(null);
    setPreview(null);
    setPendingRows(null);

    try {
      const XLSX = await import('xlsx');
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data, { cellDates: false });
      const worksheet = workbook.Sheets[workbook.SheetNames[0]];
      const grid: unknown[][] = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

      if (grid.length < 2) {
        throw new Error('The file looks empty or has no header row.');
      }

      let headerRowIndex = -1;
      for (let i = 0; i < Math.min(grid.length, 10); i++) {
        const row = grid[i];
        if (!Array.isArray(row)) continue;
        const cells = row.map((c) => String(c ?? '').toLowerCase());
        if (cells.some((c) => c.includes('name'))) {
          headerRowIndex = i;
          break;
        }
      }
      if (headerRowIndex === -1) {
        throw new Error('Could not find a header row containing "Employee Name".');
      }

      const headers = (grid[headerRowIndex] as unknown[]).map((h) =>
        String(h ?? '').toLowerCase().trim()
      );
      const nameIdx = headers.findIndex((h) => h.includes('name'));
      const adjIdx = headers.findIndex(
        (h) =>
          h.includes('adj') ||
          h.includes('lwp') ||
          (h.includes('leave') && h.includes('adjust'))
      );

      if (nameIdx === -1) throw new Error('Could not find an "Employee Name" column.');
      if (adjIdx === -1) {
        throw new Error('Could not find a "Leave Adj/LWP" column (header should include Adj or LWP).');
      }

      const rows: UploadRow[] = [];
      for (let i = headerRowIndex + 1; i < grid.length; i++) {
        const row = grid[i];
        if (!Array.isArray(row)) continue;
        const name = String(row[nameIdx] ?? '').trim();
        if (!name) continue;
        rows.push({ name, leaveAdjLwp: Number(row[adjIdx] ?? 0) });
      }

      if (rows.length === 0) throw new Error('No employee rows found in the file.');

      const res = await fetch(
        '/api/leave/upload-adj-lwp',
        hrCredentialsInit({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ rows, mode: 'preview', monthYear: monthFilter }),
        })
      );
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || 'Could not read the uploaded Adj/LWP values.');
      }

      setPendingRows(rows);
      setPreview({ ...(json.data as Omit<UploadPreview, 'kind'>), kind: 'adj', monthYear: monthFilter });
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploadBusy(false);
      e.target.value = '';
    }
  };

  const saveLeaveAdjLwp = async (userId: string, leaveAdjLwp: number) => {
    setSavingAdjUserId(userId);
    setUploadError(null);
    setUploadNotice(null);
    try {
      const res = await fetch(
        '/api/leave/adj-lwp',
        hrCredentialsInit({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId, leaveAdjLwpThisMonth: leaveAdjLwp, monthYear: monthFilter }),
          cache: 'no-store',
        })
      );
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.success) {
        throw new Error(json.error || `Could not save Leave Adj/LWP (${res.status}).`);
      }

      const savedAdj = Number(json.data?.leaveAdjLwp);
      const savedThisMonth = Number(json.data?.leaveAdjLwpThisMonth ?? leaveAdjLwp);
      const savedRemaining = Number(json.data?.remaining);
      setLeaveBalances((prev) =>
        prev.map((row) =>
          row.userId === userId
            ? {
                ...row,
                leaveAdjLwp: Number.isFinite(savedAdj) ? savedAdj : row.leaveAdjLwp,
                leaveAdjLwpThisMonth: savedThisMonth,
                remaining: Number.isFinite(savedRemaining) ? savedRemaining : row.remaining,
                lastUpdated: new Date(),
              }
            : row
        )
      );
      setUploadNotice(
        `Saved Adj this month for ${formatMonthLabel(monthFilter)} as ${formatLeaveValue(savedThisMonth)}.`
      );
      // Re-read from DB (cache-busted) so Refresh shows the same value.
      await fetchLeaveBalances(monthFilter);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to save Leave Adj/LWP';
      setUploadError(message);
      throw err instanceof Error ? err : new Error(message);
    } finally {
      setSavingAdjUserId(null);
    }
  };

  const applyUpload = async () => {
    if (!pendingRows || !preview) return;

    const isAdj = preview.kind === 'adj';
    const endpoint = isAdj ? '/api/leave/upload-adj-lwp' : '/api/leave/upload-opening-balance';
    const changes = preview.reconcile.recordsUpdated;
    if (
      !confirmMajorAction(
        isAdj
          ? `Save Adj this month for ${formatMonthLabel(monthFilter)} and recalculate leave from Jan 2026 to now`
          : 'Save leaves B/F and recalculate leave from Jan 2026 to now',
        [
          isAdj
            ? `${preview.matched.length} employee(s) will get a new Adj this month for ${formatMonthLabel(monthFilter)}. Adj till this month is recalculated and cannot be typed.`
            : `${preview.matched.length} employee(s) will get a new opening balance.`,
          `${changes} attendance day(s) will be switched between "On leave" and "Absent".`,
          'Leave balances, the leave ledger and monthly snapshots will be rebuilt.',
          'This cannot be undone.',
        ]
      )
    ) {
      return;
    }

    setUploadBusy(true);
    setUploadError(null);
    try {
      const res = await fetch(
        endpoint,
        hrCredentialsInit({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(
            isAdj
              ? { rows: pendingRows, mode: 'apply', monthYear: monthFilter }
              : { rows: pendingRows, mode: 'apply' }
          ),
        })
      );
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || 'Could not save the balances.');
      }

      const applied = json.data as Omit<UploadPreview, 'kind'>;
      setPreview(null);
      setPendingRows(null);
      setUploadNotice(
        `Updated ${applied.matched.length} employee(s). ` +
          `${applied.reconcile.recordsUpdated} attendance day(s) changed across ` +
          `${applied.reconcile.monthsRebuilt.length} month(s).`
      );
      await fetchLeaveBalances(monthFilter);
      onRefresh();
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setUploadBusy(false);
    }
  };

  const cancelUpload = () => {
    setPreview(null);
    setPendingRows(null);
  };

  return {
    leaveBalances,
    loading,
    filterTeam,
    setFilterTeam,
    fromMonth,
    monthFilter,
    exporting,
    sortBy,
    setSortBy,
    searchTerm,
    setSearchTerm,
    activeTab,
    setActiveTab,
    fileInputRef,
    adjFileInputRef,
    uploadBusy,
    uploadError,
    uploadNotice,
    preview,
    savingAdjUserId,
    monthOptions,
    earliestMonth,
    latestMonth,
    periodLabel,
    applyPeriod,
    filteredAndSortedBalances,
    teams,
    totalStats,
    selectCls,
    handleRefresh,
    exportToExcel,
    handleFileSelected,
    handleAdjFileSelected,
    saveLeaveAdjLwp,
    applyUpload,
    cancelUpload,
  } as const;
}
