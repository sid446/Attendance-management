import React, { useState, useEffect, useRef } from 'react';
import {
  Calendar,
  TrendingUp,
  TrendingDown,
  AlertCircle,
  AlertTriangle,
  RefreshCw,
  Search,
  Upload,
  X,
} from 'lucide-react';
import { hrCredentialsInit } from '@/lib/hrAuthHeaders';
import { confirmMajorAction } from '@/lib/confirmMajorAction';

type UploadRow = { name: string; balance: number };

type ReconcileUser = {
  userId: string;
  userName: string;
  isArticle: boolean;
  monthsWithAttendance: number;
  balanceAsOfJan26: number;
  earned: number;
  usedAfterJan26: number;
  remaining: number;
  paidDays: number;
  unpaidDays: number;
  lockedDays: number;
  attendanceDayChanges: number;
};

type ReconcileChange = {
  userName: string;
  date: string;
  fromType: string;
  toType: string;
};

type ReconcileResult = {
  dryRun: boolean;
  fromMonth: string;
  toMonth: string;
  usersProcessed: number;
  usersSkippedNoAttendance: number;
  attendanceDocsUpdated: number;
  recordsUpdated: number;
  monthsRebuilt: string[];
  users: ReconcileUser[];
  sampleChanges: ReconcileChange[];
};

type UploadPreview = {
  mode: 'preview' | 'apply';
  matched: Array<{
    excelName: string;
    userId: string;
    userName: string;
    currentBalanceAsOfJan26: number;
    newBalanceAsOfJan26: number;
  }>;
  notFound: string[];
  ambiguous: Array<{ excelName: string; candidates: string[] }>;
  invalid: Array<{ excelName: string; reason: string }>;
  duplicateNames: string[];
  reconcile: ReconcileResult;
};

interface LeaveBalance {
  userId: string;
  userName: string;
  employeeCode?: string;
  team?: string;
  employmentType?: string;
  balanceAsOfJan26: number;
  earned: number;
  used: number; // Leaves taken before 1st Jan 2026
  usedAfterJan26: number; // Leaves taken on or after 1st Jan 2026
  remaining: number;
  lastUpdated: Date;
  monthlyEarned: number;
}

interface LeaveManagementSectionProps {
  isLoading: boolean;
  error: string | null;
  onRefresh: () => void;
}

const LEAVE_MANAGEMENT_WORKFLOW_STEPS = [
  'Pick month & filters',
  'Review balances',
  'Refresh from server',
] as const;

/** Leave day amounts always display with exactly two decimal places. */
const formatLeaveValue = (value: number | null | undefined): string => {
  const n = Number(value);
  if (!Number.isFinite(n)) return '0.00';
  return n.toFixed(2);
};

function currentMonthYear(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

/** Months from Jan 2026 through the current month (newest first). */
function leaveMonthOptions(): string[] {
  const options: string[] = [];
  const end = currentMonthYear();
  let y = 2026;
  let m = 1;
  while (true) {
    const my = `${y}-${String(m).padStart(2, '0')}`;
    if (my > end) break;
    options.push(my);
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return options.reverse();
}

function formatMonthLabel(monthYear: string): string {
  const [year, month] = monthYear.split('-');
  const date = new Date(parseInt(year, 10), parseInt(month, 10) - 1, 1);
  return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

const UploadPreviewDialog: React.FC<{
  preview: UploadPreview;
  busy: boolean;
  onApply: () => void;
  onCancel: () => void;
}> = ({ preview, busy, onApply, onCancel }) => {
  const { matched, notFound, ambiguous, invalid, duplicateNames, reconcile } = preview;
  const userById = new Map(reconcile.users.map((u) => [u.userId, u]));
  const problems = notFound.length + ambiguous.length + invalid.length + duplicateNames.length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
      <div className="flex max-h-[88vh] w-full max-w-4xl flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl">
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4">
          <div>
            <h3 className="text-base font-semibold text-slate-900">Check before saving</h3>
            <p className="mt-1 text-sm text-slate-600">
              Nothing has been saved yet. This is what will happen if you continue.
            </p>
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="rounded p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-800"
            aria-label="Close"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>

        <div className="grid grid-cols-2 gap-3 border-b border-slate-200 bg-slate-50 px-5 py-4 sm:grid-cols-4">
          <div>
            <div className="text-2xl font-bold tabular-nums text-slate-900">{matched.length}</div>
            <div className="text-xs text-slate-600">Employees matched</div>
          </div>
          <div>
            <div className="text-2xl font-bold tabular-nums text-slate-900">
              {reconcile.recordsUpdated}
            </div>
            <div className="text-xs text-slate-600">Attendance days changing</div>
          </div>
          <div>
            <div className="text-2xl font-bold tabular-nums text-slate-900">
              {reconcile.usersProcessed}
            </div>
            <div className="text-xs text-slate-600">Recalculated</div>
          </div>
          <div>
            <div className={`text-2xl font-bold tabular-nums ${problems > 0 ? 'text-amber-700' : 'text-slate-900'}`}>
              {problems}
            </div>
            <div className="text-xs text-slate-600">Rows needing attention</div>
          </div>
        </div>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-4">
          <p className="text-sm text-slate-600">
            Leave will be recalculated from <strong>{reconcile.fromMonth}</strong> to{' '}
            <strong>{reconcile.toMonth}</strong> as{' '}
            <strong>B/F + earned after Jan − used before Jan − used after Jan</strong>, where earned
            is 2 per month with attendance (articles earn none). Days set by an approved employee
            request are kept exactly as they are. Employees not listed in the file are untouched.
            {reconcile.usersSkippedNoAttendance > 0 && (
              <> {reconcile.usersSkippedNoAttendance} matched employee(s) have no attendance in this range and will only get the new opening balance.</>
            )}
          </p>

          {notFound.length > 0 && (
            <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              <div className="mb-1 flex items-center gap-2 font-medium">
                <AlertTriangle className="h-4 w-4" aria-hidden />
                {notFound.length} name(s) not found — these rows will be skipped
              </div>
              <div className="text-amber-900/90">{notFound.join(', ')}</div>
            </div>
          )}

          {ambiguous.length > 0 && (
            <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              <div className="mb-1 font-medium">
                {ambiguous.length} name(s) match more than one employee — skipped
              </div>
              <ul className="list-disc pl-5">
                {ambiguous.map((a) => (
                  <li key={a.excelName}>
                    {a.excelName} → {a.candidates.join(' / ')}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {invalid.length > 0 && (
            <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              <div className="mb-1 font-medium">{invalid.length} row(s) have an unusable B/F value</div>
              <ul className="list-disc pl-5">
                {invalid.map((r) => (
                  <li key={r.excelName}>
                    {r.excelName} — {r.reason}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {duplicateNames.length > 0 && (
            <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              <div className="mb-1 font-medium">
                {duplicateNames.length} repeated name(s) — only the first row was used
              </div>
              <div>{duplicateNames.join(', ')}</div>
            </div>
          )}

          <div className="overflow-hidden rounded-lg border border-slate-200">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="border-b border-slate-200 bg-slate-50">
                <tr>
                  <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Employee
                  </th>
                  <th className="px-3 py-2 text-center text-xs font-semibold uppercase tracking-wide text-slate-500">
                    B/F now
                  </th>
                  <th className="px-3 py-2 text-center text-xs font-semibold uppercase tracking-wide text-slate-500">
                    B/F new
                  </th>
                  <th className="px-3 py-2 text-center text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Earned after Jan
                  </th>
                  <th className="px-3 py-2 text-center text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Used after Jan
                  </th>
                  <th className="px-3 py-2 text-center text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Balance after
                  </th>
                  <th className="px-3 py-2 text-center text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Days changing
                  </th>
                </tr>
              </thead>
              <tbody>
                {matched.map((m) => {
                  const u = userById.get(m.userId);
                  return (
                    <tr key={m.userId} className="border-b border-slate-100">
                      <td className="px-3 py-2 text-slate-900">
                        <div className="font-medium">{m.userName}</div>
                        {m.excelName !== m.userName && (
                          <div className="text-xs text-slate-500">in file: {m.excelName}</div>
                        )}
                      </td>
                      <td className="px-3 py-2 text-center tabular-nums text-slate-600">
                        {formatLeaveValue(m.currentBalanceAsOfJan26)}
                      </td>
                      <td className="px-3 py-2 text-center font-medium tabular-nums text-slate-900">
                        {formatLeaveValue(m.newBalanceAsOfJan26)}
                      </td>
                      <td className="px-3 py-2 text-center tabular-nums text-emerald-800">
                        {u ? (u.isArticle ? 'N/A' : `+${formatLeaveValue(u.earned)}`) : '—'}
                      </td>
                      <td className="px-3 py-2 text-center tabular-nums text-slate-700">
                        {u ? formatLeaveValue(u.usedAfterJan26) : '—'}
                      </td>
                      <td className="px-3 py-2 text-center font-medium tabular-nums text-slate-900">
                        {u ? formatLeaveValue(u.remaining) : '—'}
                      </td>
                      <td className="px-3 py-2 text-center tabular-nums text-slate-700">
                        {u && u.attendanceDayChanges > 0 ? (
                          <span className="inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-900">
                            {u.attendanceDayChanges}
                          </span>
                        ) : (
                          '0'
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {reconcile.sampleChanges.length > 0 && (
            <div>
              <h4 className="mb-2 text-sm font-semibold text-slate-900">
                Attendance days that will change
              </h4>
              <ul className="space-y-1 text-sm text-slate-700">
                {reconcile.sampleChanges.map((c, i) => (
                  <li key={`${c.userName}-${c.date}-${i}`}>
                    <span className="font-medium text-slate-900">{c.userName}</span> — {c.date}:{' '}
                    {c.fromType} → <strong>{c.toType}</strong>
                  </li>
                ))}
              </ul>
              {reconcile.recordsUpdated > reconcile.sampleChanges.length && (
                <p className="mt-2 text-xs text-slate-500">
                  Showing the first {reconcile.sampleChanges.length} of {reconcile.recordsUpdated}.
                </p>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-slate-200 bg-slate-50 px-5 py-4">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onApply}
            disabled={busy || matched.length === 0}
            className="inline-flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {busy && <RefreshCw className="h-4 w-4 animate-spin" aria-hidden />}
            Save and recalculate
          </button>
        </div>
      </div>
    </div>
  );
};

export const LeaveManagementSection: React.FC<LeaveManagementSectionProps> = ({
  isLoading,
  error,
  onRefresh
}) => {
  const [leaveBalances, setLeaveBalances] = useState<LeaveBalance[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [filterTeam, setFilterTeam] = useState<string>('all');
  const [monthFilter, setMonthFilter] = useState<string>(() => currentMonthYear());
  const [sortBy, setSortBy] = useState<'name' | 'balanceAsOfJan26' | 'earned' | 'remaining' | 'used'>('earned');
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [activeTab, setActiveTab] = useState<'all' | 'articles' | 'employees'>('all');

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadBusy, setUploadBusy] = useState<boolean>(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadNotice, setUploadNotice] = useState<string | null>(null);
  const [pendingRows, setPendingRows] = useState<UploadRow[] | null>(null);
  const [preview, setPreview] = useState<UploadPreview | null>(null);

  const monthOptions = leaveMonthOptions();

  const fetchLeaveBalances = async (monthYear = monthFilter) => {
    setLoading(true);
    try {
      const response = await fetch(
        `/api/leave/balances?monthYear=${encodeURIComponent(monthYear)}`
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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- refetch when month changes
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
        case 'used':
          return b.used - a.used;
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
      totalUsed: acc.totalUsed + balance.used,
      totalUsedAfterJan26: acc.totalUsedAfterJan26 + (balance.usedAfterJan26 || 0),
      totalRemaining: acc.totalRemaining + balance.remaining,
    }),
    { totalBalanceAsOfJan26: 0, totalEarned: 0, totalUsed: 0, totalUsedAfterJan26: 0, totalRemaining: 0 }
  );

  const selectCls =
    'rounded-md border border-blue-200/65 bg-panel px-3 py-2 text-sm text-slate-800 shadow-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20';

  const handleRefresh = () => {
    void fetchLeaveBalances(monthFilter);
    onRefresh();
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
      setPreview(json.data as UploadPreview);
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploadBusy(false);
      e.target.value = '';
    }
  };

  const applyUpload = async () => {
    if (!pendingRows || !preview) return;

    const changes = preview.reconcile.recordsUpdated;
    if (
      !confirmMajorAction('Save leaves B/F and recalculate leave from Jan 2026 to now', [
        `${preview.matched.length} employee(s) will get a new opening balance.`,
        `${changes} attendance day(s) will be switched between "On leave" and "Absent".`,
        'Leave balances, the leave ledger and monthly snapshots will be rebuilt.',
        'This cannot be undone.',
      ])
    ) {
      return;
    }

    setUploadBusy(true);
    setUploadError(null);
    try {
      const res = await fetch(
        '/api/leave/upload-opening-balance',
        hrCredentialsInit({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ rows: pendingRows, mode: 'apply' }),
        })
      );
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || 'Could not save the balances.');
      }

      const applied = json.data as UploadPreview;
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

  return (
    <section className="space-y-5 text-slate-900" aria-labelledby="leave-management-heading">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-2">
          <h2 id="leave-management-heading" className="flex items-center gap-2 text-xl font-semibold text-slate-900">
            <Calendar className="h-5 w-5 shrink-0 text-blue-600" aria-hidden />
            Leave management
          </h2>
          <p className="max-w-2xl text-sm text-slate-600">
            {activeTab === 'all' &&
              `Track earned, used, and remaining leave balances as of ${formatMonthLabel(monthFilter)}.`}
            {activeTab === 'articles' &&
              'Article staff: opening balance and usage; no monthly earn after 1 Jan 2026 in this view.'}
            {activeTab === 'employees' &&
              `Regular employees: earned / used / remaining as of ${formatMonthLabel(monthFilter)}.`}
          </p>
          <ol className="flex list-none flex-wrap gap-2 text-xs text-slate-700" aria-label="Leave management workflow">
            {LEAVE_MANAGEMENT_WORKFLOW_STEPS.map((t, i) => (
              <li
                key={t}
                className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-slate-50 px-2 py-1"
              >
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-blue-600 text-[10px] font-bold text-white">
                  {i + 1}
                </span>
                {t}
              </li>
            ))}
          </ol>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls"
            onChange={handleFileSelected}
            className="hidden"
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="inline-flex shrink-0 items-center gap-2 rounded-md border border-blue-200/65 bg-panel px-3 py-2 text-sm font-medium text-slate-800 shadow-sm transition-colors hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500/30 disabled:opacity-50"
            disabled={uploadBusy || loading || isLoading}
            title='Excel with columns "Employee Name" and "Leaves B/F"'
          >
            <Upload className={`h-4 w-4 ${uploadBusy ? 'animate-pulse text-blue-600' : 'text-slate-600'}`} aria-hidden />
            {uploadBusy ? 'Working…' : 'Upload B/F'}
          </button>
          <button
            type="button"
            onClick={handleRefresh}
            className="inline-flex shrink-0 items-center gap-2 rounded-md border border-blue-200/65 bg-panel px-4 py-2 text-sm font-medium text-slate-800 shadow-sm transition-colors hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500/30 disabled:opacity-50"
            disabled={loading || isLoading}
          >
            <RefreshCw className={`h-4 w-4 ${loading || isLoading ? 'animate-spin text-blue-600' : 'text-slate-600'}`} aria-hidden />
            Refresh
          </button>
        </div>
      </header>

      {uploadError && (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900" role="alert">
          {uploadError}
        </div>
      )}
      {uploadNotice && (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900" role="status">
          {uploadNotice}
        </div>
      )}

      {preview && <UploadPreviewDialog preview={preview} busy={uploadBusy} onApply={applyUpload} onCancel={cancelUpload} />}

      <div
        className="inline-flex flex-wrap gap-1 rounded-lg border border-blue-200/65 bg-panel p-0.5 shadow-sm"
        role="tablist"
        aria-label="Employee category"
      >
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'all'}
          onClick={() => setActiveTab('all')}
          className={`rounded-md px-4 py-2 text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500/30 ${
            activeTab === 'all' ? 'bg-slate-200 text-slate-900 shadow-sm' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
          }`}
        >
          All ({leaveBalances.length})
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'articles'}
          onClick={() => setActiveTab('articles')}
          className={`rounded-md px-4 py-2 text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500/30 ${
            activeTab === 'articles' ? 'bg-slate-200 text-slate-900 shadow-sm' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
          }`}
        >
          Articles ({leaveBalances.filter((b) => b.employmentType?.toLowerCase() === 'article').length})
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'employees'}
          onClick={() => setActiveTab('employees')}
          className={`rounded-md px-4 py-2 text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500/30 ${
            activeTab === 'employees' ? 'bg-slate-200 text-slate-900 shadow-sm' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
          }`}
        >
          Regular ({leaveBalances.filter((b) => b.employmentType?.toLowerCase() !== 'article').length})
        </button>
      </div>

      <div
        className={`grid grid-cols-1 gap-3 ${activeTab === 'articles' ? 'sm:grid-cols-2 lg:grid-cols-4' : 'sm:grid-cols-2 lg:grid-cols-5'}`}
      >
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 shadow-sm">
          <div className="mb-2 flex items-center gap-2">
            <Calendar className="h-5 w-5 text-blue-700" aria-hidden />
            <span className="text-sm font-medium text-slate-700">Balance as of 1 Jan 26</span>
          </div>
          <div className="text-2xl font-bold tabular-nums text-slate-900">
            {formatLeaveValue(totalStats.totalBalanceAsOfJan26)}
          </div>
          <div className="mt-1 text-xs text-slate-500">Opening balance</div>
        </div>

        {activeTab !== 'articles' && (
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 shadow-sm">
            <div className="mb-2 flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-emerald-700" aria-hidden />
              <span className="text-sm font-medium text-slate-700">Earned (after Jan)</span>
            </div>
            <div className="text-2xl font-bold tabular-nums text-slate-900">
              {formatLeaveValue(totalStats.totalEarned)}
            </div>
            <div className="mt-1 text-xs text-slate-500">Earned after 1 Jan 2026</div>
          </div>
        )}

        <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 shadow-sm">
          <div className="mb-2 flex items-center gap-2">
            <TrendingDown className="h-5 w-5 text-rose-700" aria-hidden />
            <span className="text-sm font-medium text-slate-700">Used (before 1 Jan)</span>
          </div>
          <div className="text-2xl font-bold tabular-nums text-slate-900">
            {formatLeaveValue(totalStats.totalUsed)}
          </div>
          <div className="mt-1 text-xs text-slate-500">Leave before 1 Jan 2026</div>
        </div>

        <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 shadow-sm">
          <div className="mb-2 flex items-center gap-2">
            <TrendingDown className="h-5 w-5 text-amber-800" aria-hidden />
            <span className="text-sm font-medium text-slate-700">Used (after 1 Jan)</span>
          </div>
          <div className="text-2xl font-bold tabular-nums text-slate-900">
            {formatLeaveValue(totalStats.totalUsedAfterJan26)}
          </div>
          <div className="mt-1 text-xs text-slate-500">Leave on/after 1 Jan 2026</div>
        </div>

        <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 shadow-sm">
          <div className="mb-2 flex items-center gap-2">
            <Calendar className="h-5 w-5 text-sky-700" aria-hidden />
            <span className="text-sm font-medium text-slate-700">Total remaining</span>
          </div>
          <div className="text-2xl font-bold tabular-nums text-slate-900">
            {formatLeaveValue(totalStats.totalRemaining)}
          </div>
          <div className="mt-1 text-xs text-slate-500">Available leave balance</div>
        </div>
      </div>

      <div className="flex flex-col flex-wrap gap-3 rounded-xl border border-blue-200/65 bg-panel p-4 shadow-sm md:flex-row md:items-end">
        <div className="relative min-w-[200px] flex-1 md:max-w-xs">
          <label htmlFor="leave-management-search" className="sr-only">
            Search by name or employee code
          </label>
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500"
            aria-hidden
          />
          <input
            id="leave-management-search"
            type="search"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search by name or code…"
            className="w-full rounded-md border border-blue-200/65 bg-panel py-2 pl-10 pr-3 text-sm text-slate-900 shadow-sm placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
          />
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="leave-management-month" className="text-xs font-medium text-slate-600">
            Month
          </label>
          <select
            id="leave-management-month"
            value={monthFilter}
            onChange={(e) => setMonthFilter(e.target.value)}
            className={selectCls}
          >
            {monthOptions.map((my) => (
              <option key={my} value={my}>
                {formatMonthLabel(my)}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="leave-management-team" className="text-xs font-medium text-slate-600">
            Team
          </label>
          <select
            id="leave-management-team"
            value={filterTeam}
            onChange={(e) => setFilterTeam(e.target.value)}
            className={selectCls}
          >
            <option value="all">All teams</option>
            {teams.map((team) => (
              <option key={team} value={team}>
                {team}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="leave-management-sort" className="text-xs font-medium text-slate-600">
            Sort by
          </label>
          <select
            id="leave-management-sort"
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as 'name' | 'balanceAsOfJan26' | 'earned' | 'remaining' | 'used')}
            className={selectCls}
          >
            <option value="name">Name</option>
            <option value="balanceAsOfJan26">Balance as of Jan 26</option>
            <option value="earned">Earned</option>
            <option value="remaining">Remaining</option>
            <option value="used">Used (before Jan)</option>
          </select>
        </div>
      </div>

      <section
        className="overflow-hidden rounded-xl border border-blue-200/65 bg-panel shadow-sm"
        aria-labelledby="leave-balances-table-heading"
      >
        <div className="border-b border-slate-200 bg-slate-50 px-4 py-3">
          <h3 id="leave-balances-table-heading" className="text-sm font-semibold text-slate-900">
            Leave balances
          </h3>
          <p className="text-xs text-slate-600">
            Showing balances as of {formatMonthLabel(monthFilter)}. Totals above respect the current
            tab, team, and search.
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-sm">
            <thead className="border-b border-slate-200 bg-slate-50">
              <tr>
                <th scope="col" className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Employee
                </th>
                <th scope="col" className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Type
                </th>
                <th scope="col" className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Team
                </th>
                <th scope="col" className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Balance 1 Jan 26
                </th>
                <th scope="col" className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Earned (after Jan)
                </th>
                <th scope="col" className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Used (before 1 Jan)
                </th>
                <th scope="col" className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Used (after 1 Jan)
                </th>
                <th scope="col" className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Balance
                </th>
                <th scope="col" className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Last updated
                </th>
              </tr>
            </thead>
            <tbody>
              {loading || isLoading ? (
                <tr>
                  <td colSpan={9} className="px-4 py-10 text-center text-slate-600">
                    <RefreshCw className="mx-auto mb-2 h-6 w-6 animate-spin text-blue-600" aria-hidden />
                    <span role="status">Loading leave balances…</span>
                  </td>
                </tr>
              ) : filteredAndSortedBalances.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-10 text-center text-slate-600">
                    <AlertCircle className="mx-auto mb-2 h-6 w-6 text-slate-400" aria-hidden />
                    No leave balances match your filters.
                  </td>
                </tr>
              ) : (
                filteredAndSortedBalances.map((balance) => (
                  <tr key={balance.userId} className="border-b border-slate-200 transition-colors hover:bg-slate-50/90">
                    <td className="px-4 py-3">
                      <div>
                        <div className="font-medium text-slate-900">{balance.userName}</div>
                        {balance.employeeCode && <div className="text-xs text-slate-500">{balance.employeeCode}</div>}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center rounded-full border px-2 py-1 text-xs font-medium ${
                          balance.employmentType?.toLowerCase() === 'article'
                            ? 'border-violet-200 bg-violet-50 text-violet-900'
                            : 'border-blue-200 bg-blue-50 text-blue-900'
                        }`}
                      >
                        {balance.employmentType?.toLowerCase() === 'article' ? 'Article' : 'Employee'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-700">{balance.team || '—'}</td>
                    <td className="px-4 py-3 text-center">
                      <span className="inline-flex items-center rounded-full border border-blue-200 bg-blue-50 px-2.5 py-0.5 text-xs font-medium tabular-nums text-blue-900">
                        {formatLeaveValue(balance.balanceAsOfJan26)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      {balance.employmentType?.toLowerCase() === 'article' ? (
                        <span className="text-xs italic text-slate-500">N/A</span>
                      ) : (
                        <span className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-xs font-medium tabular-nums text-emerald-900">
                          {formatLeaveValue(balance.earned)}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className="inline-flex items-center rounded-full border border-rose-200 bg-rose-50 px-2.5 py-0.5 text-xs font-medium tabular-nums text-rose-900">
                        {formatLeaveValue(balance.used)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className="inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-xs font-medium tabular-nums text-amber-950">
                        {formatLeaveValue(balance.usedAfterJan26 || 0)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span
                        className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium tabular-nums ${
                          balance.remaining > 0
                            ? 'border-sky-200 bg-sky-50 text-sky-900'
                            : 'border-slate-200 bg-slate-100 text-slate-700'
                        }`}
                      >
                        {formatLeaveValue(balance.remaining)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-600">{new Date(balance.lastUpdated).toLocaleDateString('en-GB')}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900" role="alert">
          {error}
        </div>
      )}
    </section>
  );
};