import React, { useState, useEffect } from 'react';
import { Search, Download, Loader2, X, Newspaper, CreditCard, Award, Settings } from 'lucide-react';
import { User } from '@/types/ui';
import { hrCredentialsInit } from '@/lib/hrAuthHeaders';
import {
  type ExcessAllowanceLookup,
  type ExcessDisplayLookup,
} from '@/lib/excessHourAllowance';
import {
  calculateArticleCredit,
  DEFAULT_ARTICLE_CREDIT_CONFIG,
  type ArticleCreditConfig,
  type ArticleCreditRow,
  type WeekdayHoursMode,
} from '@/lib/articleCredit';

const ARTICLE_CREDITS_WORKFLOW_STEPS = ['Set attendance period', 'Search or sort table', 'Export or view breakdown'] as const;

const fetchUsers = async (): Promise<User[]> => {
  const res = await fetch('/api/users?listOnly=1', hrCredentialsInit());
  const json = await res.json();
  return json.success ? json.data : [];
};

const fetchAttendance = async (userId: string): Promise<any[]> => {
  // Fetch all attendance records for the user
  const res = await fetch(`/api/attendance?userId=${userId}`);
  const json = await res.json();
  return json.success ? json.data : [];
};

export const ArticleCreditsManager: React.FC = () => {
  const [rows, setRows] = useState<ArticleCreditRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState<{ start: string; end: string }>({ start: '', end: '' });
  const [search, setSearch] = useState('');
  const [sortField, setSortField] = useState<keyof ArticleCreditRow>('finalCredit');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [showRangeModal, setShowRangeModal] = useState(false);
  const [showCalcModal, setShowCalcModal] = useState(false);
  const [calcRow, setCalcRow] = useState<ArticleCreditRow|null>(null);
  const [config, setConfig] = useState<ArticleCreditConfig>(DEFAULT_ARTICLE_CREDIT_CONFIG);
  const [showRuleModal, setShowRuleModal] = useState(false);

  // Load the (HR-editable) rule config once on mount. Falls back to defaults on error.
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/hr-console-settings/article-credit', hrCredentialsInit());
        const json = await res.json();
        if (json.success && json.data) setConfig(json.data as ArticleCreditConfig);
      } catch {
        // keep defaults
      }
    })();
  }, []);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const users = await fetchUsers();
      const articleUsers = users.filter(u => u.category === 'Article');

      const pairs: string[] = [];
      const attendanceByUser = new Map<string, any[]>();
      for (const user of articleUsers) {
        const attendance = await fetchAttendance(user._id);
        attendanceByUser.set(user._id, attendance);
        for (const rec of attendance) {
          const my = rec.monthYear || '';
          if (my) pairs.push(`${user._id}:${my}`);
        }
      }

      let allowanceMap: ExcessAllowanceLookup = {};
      let displayMap: ExcessDisplayLookup = {};
      if (pairs.length > 0) {
        try {
          const res = await fetch(
            `/api/excess-hour-allowance?pairs=${encodeURIComponent(pairs.join(','))}`,
            hrCredentialsInit()
          );
          const json = await res.json();
          if (json.success && json.data) {
            allowanceMap = json.data as ExcessAllowanceLookup;
          }
          if (json.success && json.displayExcess) {
            displayMap = json.displayExcess as ExcessDisplayLookup;
          }
        } catch {
          allowanceMap = {};
          displayMap = {};
        }
      }

      const allRows: ArticleCreditRow[] = [];
      for (const user of articleUsers) {
        const attendance = attendanceByUser.get(user._id) || [];
        const filtered = attendance.filter((rec: any) => {
          if (!range.start || !range.end) return true;
          return rec.monthYear >= range.start && rec.monthYear <= range.end;
        });
        allRows.push(calculateArticleCredit(user, filtered, config, allowanceMap, displayMap));
      }
      setRows(allRows);
      setLoading(false);
    };
    load();
  }, [range, config]);

  // Dashboard stats
  const stats = {
    totalArticles: rows.length,
    sumCredits: rows.reduce((acc, r) => acc + r.creditAsOnJan26, 0),
    sumFinalCredits: rows.reduce((acc, r) => acc + r.finalCredit, 0),
  };

  // Sorting
  const sortedRows = [...rows]
    .filter(r =>
      !search ||
      r.name.toLowerCase().includes(search.toLowerCase()) ||
      r.empId.toLowerCase().includes(search.toLowerCase())
    )
    .sort((a, b) => {
      let aVal = a[sortField];
      let bVal = b[sortField];
      if (typeof aVal === 'string' && typeof bVal === 'string') {
        return sortDir === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
      } else {
        return sortDir === 'asc' ? (aVal as number) - (bVal as number) : (bVal as number) - (aVal as number);
      }
    });

  // Export to Excel
  const handleExport = async () => {
    if (rows.length === 0) return;
    const ExcelJS = (await import('exceljs')).default;
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Article Credits');
    worksheet.columns = [
      { key: 'empId', header: 'Emp ID', width: 12 },
      { key: 'name', header: 'Name', width: 18 },
      { key: 'creditAsOnJan26', header: 'Credit (as on 1 Jan 26)', width: 18 },
      { key: 'leaveTakenBeforeJan26', header: 'Leave Taken Before 1 Jan 2026', width: 24 },
      { key: 'leaveTakenAfterJan26', header: 'Leave Taken On/After 1 Jan 2026', width: 28 },
      { key: 'totalExcessHours', header: 'Excess Hours (from Jan 2026)', width: 22 },
      { key: 'totalExcessDays', header: 'Excess Days (from Jan 2026)', width: 22 },
      { key: 'finalCredit', header: 'Final Credit', width: 14 },
    ];
    rows.forEach(row => worksheet.addRow(row));
    worksheet.getRow(1).font = { bold: true, size: 12 };
    worksheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return;
      row.eachCell(cell => {
        cell.font = { size: 11 };
        cell.alignment = { vertical: 'middle', horizontal: 'center' };
        cell.border = {
          top: { style: 'thin' },
          bottom: { style: 'thin' },
          left: { style: 'thin' },
          right: { style: 'thin' },
        };
      });
    });
    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'Article_Credits.xlsx';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
  };

  // Range modal with dropdowns for month selection
  const RangeModal: React.FC<{isOpen: boolean; onClose: () => void}> = ({isOpen, onClose}) => {
    const [start, setStart] = useState(range.start);
    const [end, setEnd] = useState(range.end);
    // Generate a list of months for the last 3 years
    const months: string[] = [];
    const now = new Date();
    for (let y = now.getFullYear(); y >= now.getFullYear() - 2; y--) {
      for (let m = 11; m >= 0; m--) {
        const ym = `${y}-${String(m+1).padStart(2,'0')}`;
        if (y === now.getFullYear() && m > now.getMonth()) continue;
        months.push(ym);
      }
    }
    // Sort months descending
    months.sort((a, b) => b.localeCompare(a));

    const apply = () => {
      if (start && end && start > end) {
        alert('Start month must be before or equal to end month.');
        return;
      }
      setRange({ start, end });
      onClose();
    };
    if (!isOpen) return null;
    const rangeTitleId = 'article-credits-range-modal-title';
    const selectCls =
      'w-full rounded-md border border-blue-200/65 bg-panel px-2 py-2 font-mono text-sm text-slate-800 shadow-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20';
    return (
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm"
        onClick={onClose}
        role="presentation"
      >
        <div
          className="flex max-h-[80vh] w-full max-w-md flex-col overflow-hidden rounded-lg border border-blue-200/65 bg-panel shadow-xl"
          onClick={(e) => e.stopPropagation()}
          role="dialog"
          aria-modal="true"
          aria-labelledby={rangeTitleId}
        >
          <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-4 py-3">
            <h3 id={rangeTitleId} className="text-sm font-semibold text-slate-900">
              Custom month range
            </h3>
            <button
              type="button"
              onClick={onClose}
              className="rounded-md p-1 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="flex-1 p-4">
            <p className="mb-4 text-xs text-slate-600">Attendance months included in excess-hour totals must fall in this range.</p>
            <div className="flex flex-col justify-between gap-6 md:flex-row">
              <div className="flex-1">
                <label htmlFor="article-credits-range-start" className="mb-2 block text-sm font-medium text-slate-700">
                  From
                </label>
                <select
                  id="article-credits-range-start"
                  className={selectCls}
                  value={start}
                  onChange={(e) => setStart(e.target.value)}
                >
                  <option value="">Select month</option>
                  {months.map((m) => (
                    <option key={`${m}:start`} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex-1">
                <label htmlFor="article-credits-range-end" className="mb-2 block text-sm font-medium text-slate-700">
                  To
                </label>
                <select
                  id="article-credits-range-end"
                  className={selectCls}
                  value={end}
                  onChange={(e) => setEnd(e.target.value)}
                >
                  <option value="">Select month</option>
                  {months.map((m) => (
                    <option key={`${m}:end`} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="font-mono text-xs text-slate-500">
                {start && end ? `Selected: ${start} → ${end}` : 'Select start and end months.'}
              </div>
              <button
                type="button"
                onClick={apply}
                className="rounded-md bg-blue-600 px-5 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
              >
                Apply
              </button>
            </div>
          </div>
          <div className="border-t border-slate-200 bg-slate-50 px-4 py-2 text-right">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md px-3 py-1.5 text-xs text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    );
  };

  // Calculation Modal
  const CalculationModal: React.FC<{row: ArticleCreditRow|null, isOpen: boolean, onClose: () => void}> = ({row, isOpen, onClose}) => {
    if (!isOpen || !row) return null;
    // Recompute the breakdown for display
    const base = row.creditAsOnJan26;
    const leaveAfter = row.leaveTakenAfterJan26;
    const excess = row.totalExcessHours;
    const excessDays = row.totalExcessDays;
    const calcTitleId = 'article-credits-calc-modal-title';
    return (
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm"
        onClick={onClose}
        role="presentation"
      >
        <div
          className="flex max-h-[90vh] w-full max-w-md flex-col overflow-hidden rounded-lg border border-blue-200/65 bg-panel shadow-xl"
          onClick={(e) => e.stopPropagation()}
          role="dialog"
          aria-modal="true"
          aria-labelledby={calcTitleId}
        >
          <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-4 py-3">
            <h3 id={calcTitleId} className="text-sm font-semibold text-slate-900">
              Credit calculation — {row.name}
            </h3>
            <button
              type="button"
              onClick={onClose}
              className="rounded-md p-1 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="space-y-3 p-5 text-sm text-slate-800">
            <div>
              <span className="font-semibold text-slate-900">Base credit (as on {config.cutoffMonth}):</span>{' '}
              <span className="font-mono tabular-nums">{base}</span>
            </div>
            <div>
              <span className="font-semibold text-slate-900">Leave taken on/after {config.cutoffMonth}:</span>{' '}
              <span className="font-mono tabular-nums text-rose-700">− {leaveAfter}</span>
            </div>
            <div>
              <span className="font-semibold text-slate-900">Excess hours (from {config.cutoffMonth}):</span>{' '}
              <span className={`font-mono tabular-nums ${excess >= 0 ? 'text-emerald-800' : 'text-rose-700'}`}>
                {excess >= 0 ? '+' : ''}
                {excess}
              </span>
            </div>
            <div>
              <span className="font-semibold text-slate-900">Excess days (from {config.cutoffMonth}):</span>{' '}
              <span className={`font-mono tabular-nums ${excessDays >= 0 ? 'text-amber-800' : 'text-rose-700'}`}>
                {excessDays >= 0 ? '+' : ''}
                {excessDays}
              </span>
            </div>
            <hr className="my-2 border-slate-200" />
            <div className="text-lg font-bold text-slate-900">
              Final credit: <span className="font-mono text-emerald-800 tabular-nums">{row.finalCredit}</span>
            </div>
            <p className="mt-2 text-xs text-slate-600">
              Formula: base credit − leave after {config.cutoffMonth} + excess days (excess hours ÷{' '}
              {config.weekdayHoursMode === 'fixed'
                ? `${config.defaultWeekdayHours}h fixed`
                : `weekday hours, default ${config.defaultWeekdayHours}h`}
              ){config.floorFinalCreditAtZero ? ', floored at 0' : ''}.
            </p>
          </div>
          <div className="border-t border-slate-200 bg-slate-50 px-4 py-2 text-right">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    );
  };

  // Rule settings modal (HR-editable). Keeps the formula identical; only tunes constants.
  const RuleSettingsModal: React.FC<{ isOpen: boolean; onClose: () => void }> = ({ isOpen, onClose }) => {
    const [cutoffMonth, setCutoffMonth] = useState(config.cutoffMonth);
    const [defaultWeekdayHours, setDefaultWeekdayHours] = useState(String(config.defaultWeekdayHours));
    const [weekdayHoursMode, setWeekdayHoursMode] = useState<WeekdayHoursMode>(config.weekdayHoursMode);
    const [floorFinalCreditAtZero, setFloorFinalCreditAtZero] = useState(config.floorFinalCreditAtZero);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    if (!isOpen) return null;
    const ruleTitleId = 'article-credits-rule-modal-title';
    const inputCls =
      'w-full rounded-md border border-blue-200/65 bg-panel px-2 py-2 text-sm text-slate-800 shadow-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20';

    const save = async () => {
      setError(null);
      if (!/^\d{4}-\d{2}$/.test(cutoffMonth.trim())) {
        setError('Cutoff month must be in YYYY-MM format.');
        return;
      }
      const hours = Number(defaultWeekdayHours);
      if (!Number.isFinite(hours) || hours <= 0) {
        setError('Default weekday hours must be a number greater than 0.');
        return;
      }
      setSaving(true);
      try {
        const res = await fetch(
          '/api/hr-console-settings/article-credit',
          hrCredentialsInit({
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              cutoffMonth: cutoffMonth.trim(),
              defaultWeekdayHours: hours,
              weekdayHoursMode,
              floorFinalCreditAtZero,
            }),
          })
        );
        const json = await res.json();
        if (json.success && json.data) {
          setConfig(json.data as ArticleCreditConfig);
          onClose();
        } else {
          setError(json.error || 'Failed to save rule settings.');
        }
      } catch {
        setError('Failed to save rule settings.');
      } finally {
        setSaving(false);
      }
    };

    return (
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm"
        onClick={onClose}
        role="presentation"
      >
        <div
          className="flex max-h-[90vh] w-full max-w-md flex-col overflow-hidden rounded-lg border border-blue-200/65 bg-panel shadow-xl"
          onClick={(e) => e.stopPropagation()}
          role="dialog"
          aria-modal="true"
          aria-labelledby={ruleTitleId}
        >
          <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-4 py-3">
            <h3 id={ruleTitleId} className="text-sm font-semibold text-slate-900">
              Article credit rule settings
            </h3>
            <button
              type="button"
              onClick={onClose}
              className="rounded-md p-1 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="space-y-4 p-5 text-sm text-slate-800">
            <p className="text-xs text-slate-600">
              The formula is unchanged (base credit − leave after cutoff + excess days). These settings
              only tune its constants and apply to everyone.
            </p>
            <div>
              <label htmlFor="acr-cutoff" className="mb-1 block text-xs font-medium text-slate-600">
                Cutoff month (YYYY-MM)
              </label>
              <input
                id="acr-cutoff"
                type="text"
                inputMode="numeric"
                placeholder="2026-01"
                value={cutoffMonth}
                onChange={(e) => setCutoffMonth(e.target.value)}
                className={`${inputCls} font-mono`}
              />
              <p className="mt-1 text-xs text-slate-500">Only attendance months on/after this count toward excess.</p>
            </div>
            <div>
              <label htmlFor="acr-weekday-mode" className="mb-1 block text-xs font-medium text-slate-600">
                Weekday hours basis
              </label>
              <select
                id="acr-weekday-mode"
                value={weekdayHoursMode}
                onChange={(e) => setWeekdayHoursMode(e.target.value as WeekdayHoursMode)}
                className={inputCls}
              >
                <option value="schedule">From each employee&apos;s Monday schedule (fallback below)</option>
                <option value="fixed">Fixed for everyone (value below)</option>
              </select>
            </div>
            <div>
              <label htmlFor="acr-weekday-hours" className="mb-1 block text-xs font-medium text-slate-600">
                {weekdayHoursMode === 'fixed' ? 'Weekday hours (fixed)' : 'Default weekday hours (fallback)'}
              </label>
              <input
                id="acr-weekday-hours"
                type="number"
                min="0.5"
                step="0.5"
                value={defaultWeekdayHours}
                onChange={(e) => setDefaultWeekdayHours(e.target.value)}
                className={`${inputCls} font-mono`}
              />
              <p className="mt-1 text-xs text-slate-500">Excess hours are divided by this to convert to days.</p>
            </div>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={floorFinalCreditAtZero}
                onChange={(e) => setFloorFinalCreditAtZero(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500/30"
              />
              <span className="text-sm text-slate-800">Never show a negative final credit (floor at 0)</span>
            </label>
            {error && (
              <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800" role="alert">
                {error}
              </div>
            )}
          </div>
          <div className="flex items-center justify-end gap-2 border-t border-slate-200 bg-slate-50 px-4 py-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md px-3 py-1.5 text-xs text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={save}
              disabled={saving}
              className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500/40 disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      </div>
    );
  };

  const periodBtnOn = 'rounded-md bg-slate-200 px-3 py-1 text-xs font-semibold text-slate-900 shadow-sm transition-colors';
  const periodBtnOff =
    'rounded-md px-3 py-1 text-xs font-semibold text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900';
  const periodBtnCustomOn = 'rounded-md bg-blue-600 px-3 py-1 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-blue-700';

  const thBase =
    'cursor-pointer px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500 transition-colors hover:bg-slate-100';
  const thRight = `${thBase} text-right`;
  const tdMono = 'px-4 py-3 text-right font-mono text-sm tabular-nums text-slate-700';

  return (
    <section className="space-y-5 text-slate-900" aria-labelledby="article-credits-heading">
      <header className="space-y-2">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <h2 id="article-credits-heading" className="text-lg font-semibold text-slate-900 sm:text-xl">
            Article credits
          </h2>
          <button
            type="button"
            onClick={() => setShowRuleModal(true)}
            className="inline-flex shrink-0 items-center gap-2 rounded-md border border-blue-200/65 bg-panel px-3 py-1.5 text-xs font-medium text-slate-800 shadow-sm transition-colors hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            title="Edit the article credit rule settings"
          >
            <Settings className="h-4 w-4 text-slate-600" aria-hidden />
            Rule settings
          </button>
        </div>
        <p className="max-w-3xl text-sm text-slate-600">
          Credits for <span className="font-medium text-slate-800">Article</span> category staff: base credit from
          master data, leave after {config.cutoffMonth}, and excess hours from {config.cutoffMonth} onward (by selected attendance period).
        </p>
        <p className="max-w-3xl text-xs text-slate-500">
          Current rule: cutoff <span className="font-mono">{config.cutoffMonth}</span>, weekday hours{' '}
          {config.weekdayHoursMode === 'fixed'
            ? `fixed ${config.defaultWeekdayHours}h`
            : `from schedule (default ${config.defaultWeekdayHours}h)`}
          {config.floorFinalCreditAtZero ? ', floored at 0' : ''}.
        </p>
        <ol className="flex list-none flex-wrap gap-2 text-xs text-slate-700" aria-label="Article credits workflow">
          {ARTICLE_CREDITS_WORKFLOW_STEPS.map((t, i) => (
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
      </header>

      <div className="flex flex-col gap-4 rounded-xl border border-blue-200/65 bg-panel p-4 shadow-sm md:flex-row md:items-center md:justify-between">
        <div className="flex min-w-0 flex-col gap-2">
          <span className="text-xs font-medium text-slate-600">Attendance period (for excess totals)</span>
          <div className="flex flex-wrap items-center gap-2">
            <div
              className="inline-flex flex-wrap gap-1 rounded-lg border border-blue-200/65 bg-panel p-0.5 shadow-sm"
              role="group"
              aria-label="Period preset"
            >
              <button
                type="button"
                className={!range.start && !range.end ? periodBtnOn : periodBtnOff}
                onClick={() => setRange({ start: '', end: '' })}
              >
                All
              </button>
              <button
                type="button"
                className={
                  (() => {
                    const now = new Date();
                    const ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
                    return range.start === ym && range.end === ym;
                  })()
                    ? periodBtnOn
                    : periodBtnOff
                }
                onClick={() => {
                  const now = new Date();
                  const ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
                  setRange({ start: ym, end: ym });
                }}
              >
                Current month
              </button>
              <button
                type="button"
                className={
                  (() => {
                    const now = new Date();
                    const end = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
                    const startDate = new Date(now.getFullYear(), now.getMonth() - 2, 1);
                    const start = `${startDate.getFullYear()}-${String(startDate.getMonth() + 1).padStart(2, '0')}`;
                    return range.start === start && range.end === end;
                  })()
                    ? periodBtnOn
                    : periodBtnOff
                }
                onClick={() => {
                  const now = new Date();
                  const end = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
                  const startDate = new Date(now.getFullYear(), now.getMonth() - 2, 1);
                  const start = `${startDate.getFullYear()}-${String(startDate.getMonth() + 1).padStart(2, '0')}`;
                  setRange({ start, end });
                }}
              >
                Last 3 months
              </button>
              <button
                type="button"
                className={
                  (() => {
                    const now = new Date();
                    const end = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
                    const startDate = new Date(now.getFullYear(), now.getMonth() - 5, 1);
                    const start = `${startDate.getFullYear()}-${String(startDate.getMonth() + 1).padStart(2, '0')}`;
                    return range.start === start && range.end === end;
                  })()
                    ? periodBtnOn
                    : periodBtnOff
                }
                onClick={() => {
                  const now = new Date();
                  const end = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
                  const startDate = new Date(now.getFullYear(), now.getMonth() - 5, 1);
                  const start = `${startDate.getFullYear()}-${String(startDate.getMonth() + 1).padStart(2, '0')}`;
                  setRange({ start, end });
                }}
              >
                Last 6 months
              </button>
              <button
                type="button"
                className={
                  (() => {
                    const now = new Date();
                    const end = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
                    const startDate = new Date(now.getFullYear() - 1, now.getMonth() + 1, 1);
                    const start = `${startDate.getFullYear()}-${String(startDate.getMonth() + 1).padStart(2, '0')}`;
                    return range.start === start && range.end === end;
                  })()
                    ? periodBtnOn
                    : periodBtnOff
                }
                onClick={() => {
                  const now = new Date();
                  const end = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
                  const startDate = new Date(now.getFullYear() - 1, now.getMonth() + 1, 1);
                  const start = `${startDate.getFullYear()}-${String(startDate.getMonth() + 1).padStart(2, '0')}`;
                  setRange({ start, end });
                }}
              >
                Last 12 months
              </button>
              <button
                type="button"
                className={
                  range.start && range.end && range.start !== range.end ? periodBtnCustomOn : periodBtnOff
                }
                onClick={() => setShowRangeModal(true)}
              >
                Custom
              </button>
            </div>
            <span className="font-mono text-xs text-slate-500">
              {range.start && range.end ? `${range.start} → ${range.end}` : 'All months'}
            </span>
          </div>
        </div>

        <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-center md:w-auto md:max-w-md">
          <label htmlFor="article-credits-search" className="sr-only">
            Search by name or employee ID
          </label>
          <div className="relative flex-1">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500"
              aria-hidden
            />
            <input
              id="article-credits-search"
              type="search"
              placeholder="Search by name or ID…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-md border border-blue-200/65 bg-panel py-2 pl-10 pr-3 text-sm text-slate-900 shadow-sm placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            />
          </div>
          <button
            type="button"
            onClick={handleExport}
            disabled={rows.length === 0}
            className="inline-flex shrink-0 items-center justify-center gap-2 rounded-md border border-blue-200/65 bg-panel px-3 py-2 text-sm font-medium text-slate-800 shadow-sm transition-colors hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500/20 disabled:cursor-not-allowed disabled:opacity-40"
            title="Export article credits to Excel"
          >
            <Download className="h-4 w-4 text-slate-600" aria-hidden />
            Export
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <div className="flex items-center gap-4 rounded-lg border border-slate-200 bg-slate-50 p-4 shadow-sm">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-emerald-200 bg-emerald-50 text-emerald-700">
            <Newspaper className="h-6 w-6" aria-hidden />
          </div>
          <div>
            <div className="text-2xl font-bold tabular-nums text-slate-900">{stats.totalArticles}</div>
            <div className="text-xs font-medium uppercase tracking-wide text-slate-500">Article employees</div>
          </div>
        </div>
        <div className="flex items-center gap-4 rounded-lg border border-slate-200 bg-slate-50 p-4 shadow-sm">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-blue-200 bg-blue-50 text-blue-700">
            <CreditCard className="h-6 w-6" aria-hidden />
          </div>
          <div>
            <div className="text-2xl font-bold tabular-nums text-slate-900">{stats.sumCredits}</div>
            <div className="text-xs font-medium uppercase tracking-wide text-slate-500">Sum credits (1 Jan 26)</div>
          </div>
        </div>
        <div className="flex items-center gap-4 rounded-lg border border-slate-200 bg-slate-50 p-4 shadow-sm">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-indigo-200 bg-indigo-50 text-indigo-700">
            <Award className="h-6 w-6" aria-hidden />
          </div>
          <div>
            <div className="text-2xl font-bold tabular-nums text-slate-900">{stats.sumFinalCredits.toFixed(2)}</div>
            <div className="text-xs font-medium uppercase tracking-wide text-slate-500">Sum final credits</div>
          </div>
        </div>
      </div>

      <section
        className="overflow-hidden rounded-xl border border-blue-200/65 bg-panel shadow-sm"
        aria-labelledby="article-credits-table-heading"
      >
        <div className="border-b border-slate-200 bg-slate-50 px-4 py-3">
          <h3 id="article-credits-table-heading" className="text-sm font-semibold text-slate-900">
            Detail by employee
          </h3>
          <p className="text-xs text-slate-600">Click final credit to see the calculation breakdown.</p>
        </div>
        {loading ? (
          <div className="flex flex-col items-center justify-center gap-2 px-4 py-14 text-center text-slate-600">
            <Loader2 className="h-8 w-8 animate-spin text-blue-600" aria-hidden />
            <p role="status">Loading article credits…</p>
          </div>
        ) : sortedRows.length === 0 ? (
          <div className="px-4 py-14 text-center text-slate-600">
            <p>No article-category employees for this view, or no rows match your search.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="sticky top-0 border-b border-slate-200 bg-slate-50">
                <tr>
                  <th
                    scope="col"
                    className={`${thBase} text-left`}
                    onClick={() => {
                      setSortField('empId');
                      setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
                    }}
                  >
                    Emp ID
                  </th>
                  <th
                    scope="col"
                    className={`${thBase} text-left text-slate-600`}
                    onClick={() => {
                      setSortField('name');
                      setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
                    }}
                  >
                    Name
                  </th>
                  <th scope="col" className={thRight} onClick={() => { setSortField('creditAsOnJan26'); setSortDir(sortDir === 'asc' ? 'desc' : 'asc'); }}>
                    Credit (1 Jan 26)
                  </th>
                  <th scope="col" className={thRight} onClick={() => { setSortField('leaveTakenBeforeJan26'); setSortDir(sortDir === 'asc' ? 'desc' : 'asc'); }}>
                    Leave before 1 Jan 2026
                  </th>
                  <th scope="col" className={thRight} onClick={() => { setSortField('leaveTakenAfterJan26'); setSortDir(sortDir === 'asc' ? 'desc' : 'asc'); }}>
                    Leave on/after 1 Jan 2026
                  </th>
                  <th scope="col" className={thRight} onClick={() => { setSortField('totalExcessHours'); setSortDir(sortDir === 'asc' ? 'desc' : 'asc'); }}>
                    Excess hours (Jan 2026+)
                  </th>
                  <th scope="col" className={thRight} onClick={() => { setSortField('totalExcessDays'); setSortDir(sortDir === 'asc' ? 'desc' : 'asc'); }}>
                    Excess days (Jan 2026+)
                  </th>
                  <th scope="col" className={thRight} onClick={() => { setSortField('finalCredit'); setSortDir(sortDir === 'asc' ? 'desc' : 'asc'); }}>
                    Final credit
                  </th>
                </tr>
              </thead>
              <tbody>
                {sortedRows.map((row, idx) => (
                  <tr key={idx} className="border-b border-slate-200 transition-colors hover:bg-slate-50/90">
                    <td className="px-4 py-3 text-left font-mono text-xs text-slate-600">{row.empId}</td>
                    <td className="px-4 py-3 font-medium text-slate-900">{row.name}</td>
                    <td className={`${tdMono} text-blue-800`}>{row.creditAsOnJan26}</td>
                    <td className={`${tdMono} text-rose-800`}>{row.leaveTakenBeforeJan26}</td>
                    <td className={`${tdMono} text-sky-800`}>{row.leaveTakenAfterJan26}</td>
                    <td className={`${tdMono} text-amber-900`}>{row.totalExcessHours}</td>
                    <td className={`${tdMono} text-orange-900`}>{row.totalExcessDays}</td>
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        className="font-mono text-sm font-semibold tabular-nums text-emerald-800 underline decoration-dotted underline-offset-2 transition-colors hover:text-blue-800"
                        title="Show calculation"
                        onClick={() => {
                          setCalcRow(row);
                          setShowCalcModal(true);
                        }}
                      >
                        {row.finalCredit}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <RangeModal isOpen={showRangeModal} onClose={() => setShowRangeModal(false)} />
      <CalculationModal row={calcRow} isOpen={showCalcModal} onClose={() => setShowCalcModal(false)} />
      <RuleSettingsModal isOpen={showRuleModal} onClose={() => setShowRuleModal(false)} />
    </section>
  );
};
