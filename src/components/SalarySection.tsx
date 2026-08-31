'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  RefreshCw,
  Download,
  Mail,
  Search,
  IndianRupee,
  Lock,
  Unlock,
  ChevronDown,
  ChevronUp,
  Users,
  AlertCircle,
  Plus,
  Trash2,
} from 'lucide-react';
import { hrCredentialsInit } from '@/lib/hrAuthHeaders';
import { confirmMajorAction } from '@/lib/confirmMajorAction';
import {
  formatMonthLabel,
  inr,
  PAYROLL_BULK_BUILTIN_FIELDS,
  PAYROLL_BULK_BUILTIN_LABELS,
  normalizePayrollExtraFields,
  isPayrollLineFrozen,
  type PayrollExtraField,
  type PayrollExtraKind,
  type PayrollGroup,
  type PayrollOverrides,
} from '@/lib/salaryCalculation';
import { formatHoursMinutes } from '@/lib/attendanceSummaryMetrics';

type PayrollLine = {
  userId: string;
  name: string;
  email: string;
  attendanceEmail?: string;
  category: string;
  designation: string;
  team: string;
  verticalHead: string;
  paidFrom: string;
  group: PayrollGroup;
  isNewJoin: boolean;
  isArticle: boolean;
  articleshipYear?: string;
  pio: number;
  woPio: number;
  osP: number;
  absent: number;
  hd: number;
  wfhWeekday: number;
  weekdaysWorking: number;
  leavesTaken: number;
  leavesBf: number;
  leavesEarned: number;
  leavesConsumed: number;
  leavesCf: number;
  weekoffWorking: number;
  overtimeDays: number;
  overtimeSuggested: number;
  excessHours?: number;
  weekdayHours?: number;
  netWorkingDays: number;
  officeWorkingDays: number;
  checking: number;
  basic: number;
  laptop: number;
  payableBasic: number;
  payableLaptop: number;
  payableMonth: number;
  dueInTally: number;
  additionInOffDue: number;
  cashOffDue: number;
  otherExtra: number;
  esiEmployer: number;
  esiEmployee: number;
  tds: number;
  advances: number;
  off: number;
  taReimbursement?: number;
  lcReimbursement?: number;
  laptopAdjustment?: number;
  customEarnings?: number;
  customDeductions?: number;
  bankPayment: number;
  cashOff: number;
  diff: number;
  netSalary: number;
  overrides?: PayrollOverrides;
  payslipSentAt?: string | null;
  frozen?: boolean;
  frozenAt?: string | null;
  frozenBy?: string;
};

type PayrollDoc = {
  monthYear: string;
  status: 'draft' | 'finalized';
  calendar: { totalDays: number; sundays: number; ohd: number };
  lines: PayrollLine[];
  extraFields?: PayrollExtraField[];
  generatedAt?: string;
  finalizedAt?: string | null;
};

const GROUP_LABEL: Record<PayrollGroup, string> = {
  fixed: 'Fixed salary',
  partner: 'Partners',
  staff: 'Staff',
  admin: 'Admin',
  article: 'Articles / interns',
};

const GROUPS: PayrollGroup[] = ['fixed', 'partner', 'staff', 'admin', 'article'];

const WORKFLOW = ['Pick month & generate', 'Review or override', 'Export / email payslips'] as const;

function uid(line: PayrollLine): string {
  return typeof line.userId === 'string' ? line.userId : String((line.userId as { _id?: string })?._id || line.userId);
}

/** Stored excess, or the hours implied by converted OT days when the stored field is missing. */
function payrollExcessHours(line: PayrollLine): number {
  const stored = Number(line.excessHours);
  if (Number.isFinite(stored) && Math.abs(stored) > 0.0001) return stored;
  const suggested = Number(line.overtimeSuggested || 0);
  const dayLen = Number(line.weekdayHours || 8);
  if (suggested > 0 && dayLen > 0) return Number((suggested * dayLen).toFixed(2));
  return 0;
}

export const SalarySection: React.FC = () => {
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [doc, setDoc] = useState<PayrollDoc | null>(null);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [groupFilter, setGroupFilter] = useState<'all' | PayrollGroup>('all');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [expanded, setExpanded] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [emailBusy, setEmailBusy] = useState(false);
  const [draftOverrides, setDraftOverrides] = useState<PayrollOverrides>({});
  const [extraLabel, setExtraLabel] = useState('');
  const [extraKind, setExtraKind] = useState<PayrollExtraKind>('earning');
  const [bulkField, setBulkField] = useState<string>('tds');
  const [bulkAmount, setBulkAmount] = useState('');
  const [bulkScope, setBulkScope] = useState<'all' | 'selected' | 'designation'>('all');
  const [bulkDesignation, setBulkDesignation] = useState('');
  const [extrasBusy, setExtrasBusy] = useState(false);
  const [freezeBusy, setFreezeBusy] = useState<string | 'selected' | null>(null);

  const monthYear = `${year}-${String(month).padStart(2, '0')}`;
  const finalized = doc?.status === 'finalized';

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/payroll?monthYear=${encodeURIComponent(monthYear)}`, hrCredentialsInit());
      const json = await res.json();
      if (!res.ok || !json.success) {
        setDoc(null);
        if (res.status !== 404) setError(json.error || 'Failed to load payroll');
        return;
      }
      setDoc(json.data);
    } catch {
      setError('Failed to load payroll');
      setDoc(null);
    } finally {
      setLoading(false);
    }
  }, [monthYear]);

  useEffect(() => {
    void load();
  }, [load]);

  const generate = async () => {
    if (!confirmMajorAction('Generate / refresh salary for this month', 'Existing manual overrides for this month are kept.')) {
      return;
    }
    setGenerating(true);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch(
        '/api/payroll',
        hrCredentialsInit({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ monthYear }),
        })
      );
      const json = await res.json();
      if (!res.ok || !json.success) {
        setError(json.error || 'Generate failed');
        return;
      }
      setDoc(json.data);
      setNotice(`Generated ${json.data?.lines?.length || 0} people for ${formatMonthLabel(monthYear)}.`);
    } catch {
      setError('Generate failed');
    } finally {
      setGenerating(false);
    }
  };

  const lines = doc?.lines || [];
  const extraFields = useMemo(() => normalizePayrollExtraFields(doc?.extraFields), [doc]);
  const designations = useMemo(() => {
    const set = new Set<string>();
    for (const l of lines) {
      const d = String(l.designation || '').trim();
      if (d) set.add(d);
    }
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [lines]);
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return lines.filter((l) => {
      if (groupFilter !== 'all' && l.group !== groupFilter) return false;
      if (!q) return true;
      return (
        l.name.toLowerCase().includes(q) ||
        (l.verticalHead || '').toLowerCase().includes(q) ||
        (l.category || '').toLowerCase().includes(q) ||
        (l.paidFrom || '').toLowerCase().includes(q)
      );
    });
  }, [lines, search, groupFilter]);

  const stats = useMemo(() => {
    const headcount = filtered.length;
    const payable = filtered.reduce((s, l) => s + Number(l.payableMonth || 0), 0);
    const bank = filtered.reduce((s, l) => s + Number(l.bankPayment || 0), 0);
    const cash = filtered.reduce((s, l) => s + Number(l.cashOff || 0), 0);
    const unsent = filtered.filter((l) => !l.payslipSentAt).length;
    const frozen = filtered.filter((l) => l.frozen).length;
    return { headcount, payable, bank, cash, unsent, frozen };
  }, [filtered]);

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectFiltered = () => {
    setSelected(new Set(filtered.map(uid)));
  };

  const saveLineOverrides = async (line: PayrollLine, overrides: PayrollOverrides, noticeMsg: string) => {
    if (isPayrollLineFrozen(line, doc?.status)) {
      setError(`${line.name} is frozen. Unfreeze them to edit.`);
      return;
    }
    const id = uid(line);
    setSavingId(id);
    setError(null);
    try {
      const res = await fetch(
        '/api/payroll/line',
        hrCredentialsInit({
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ monthYear, userId: id, overrides }),
        })
      );
      const json = await res.json();
      if (!res.ok || !json.success) {
        setError(json.error || 'Save failed');
        return;
      }
      const saved = json.data as PayrollLine;
      setDoc((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          lines: prev.lines.map((l) => (uid(l) === id ? { ...l, ...saved } : l)),
        };
      });
      setDraftOverrides({ ...(saved.overrides || {}) });
      setNotice(noticeMsg);
    } catch {
      setError('Save failed');
    } finally {
      setSavingId(null);
    }
  };

  const saveOverrides = async (line: PayrollLine) => {
    await saveLineOverrides(line, draftOverrides, `Saved overrides for ${line.name}.`);
  };

  const addExtraField = async () => {
    const label = extraLabel.trim();
    if (!label) {
      setError('Enter a name for the extra, for example TDS or Senior Software Engineer allowance.');
      return;
    }
    setExtrasBusy(true);
    setError(null);
    try {
      const res = await fetch(
        '/api/payroll/extras',
        hrCredentialsInit({
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ monthYear, action: 'add', label, kind: extraKind }),
        })
      );
      const json = await res.json();
      if (!res.ok || !json.success) {
        setError(json.error || 'Could not add extra');
        return;
      }
      setDoc(json.data);
      setExtraLabel('');
      setNotice(`Added “${label}” for every employee.`);
    } catch {
      setError('Could not add extra');
    } finally {
      setExtrasBusy(false);
    }
  };

  const removeExtraField = async (extra: PayrollExtraField) => {
    if (
      !confirmMajorAction(
        `Remove “${extra.label}”`,
        'This extra is removed from every employee and its amounts are cleared.'
      )
    ) {
      return;
    }
    setExtrasBusy(true);
    setError(null);
    try {
      const res = await fetch(
        '/api/payroll/extras',
        hrCredentialsInit({
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ monthYear, action: 'remove', extraId: extra.id }),
        })
      );
      const json = await res.json();
      if (!res.ok || !json.success) {
        setError(json.error || 'Could not remove extra');
        return;
      }
      setDoc(json.data);
      setNotice(`Removed “${extra.label}”.`);
      if (bulkField === extra.id) setBulkField('tds');
    } catch {
      setError('Could not remove extra');
    } finally {
      setExtrasBusy(false);
    }
  };

  const applyBulkExtra = async (clear = false) => {
    const amount = clear ? 0 : Number(bulkAmount);
    if (!bulkField) {
      setError('Pick a field.');
      return;
    }
    if (!clear && !Number.isFinite(amount)) {
      setError('Enter an amount to apply.');
      return;
    }
    if (bulkScope === 'selected' && selected.size === 0) {
      setError('Select at least one employee, or choose All / Designation.');
      return;
    }
    if (bulkScope === 'designation' && !bulkDesignation) {
      setError('Pick a designation.');
      return;
    }
    const who =
      bulkScope === 'all'
        ? 'every employee this month'
        : bulkScope === 'selected'
          ? `${selected.size} selected employee(s)`
          : `everyone with designation ${bulkDesignation}`;
    const fieldLabel =
      PAYROLL_BULK_BUILTIN_LABELS[bulkField as keyof typeof PAYROLL_BULK_BUILTIN_LABELS] ||
      extraFields.find((f) => f.id === bulkField)?.label ||
      bulkField;
    if (
      !confirmMajorAction(
        clear ? `Remove ${fieldLabel}` : 'Apply extra amount',
        clear ? `${fieldLabel} will be cleared for ${who}.` : `${amount} will be set for ${who}.`
      )
    ) {
      return;
    }
    setExtrasBusy(true);
    setError(null);
    try {
      const res = await fetch(
        '/api/payroll/bulk',
        hrCredentialsInit({
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            monthYear,
            field: bulkField,
            amount: clear ? 0 : amount,
            clear,
            scope: bulkScope,
            userIds: [...selected],
            designation: bulkDesignation,
          }),
        })
      );
      const json = await res.json();
      if (!res.ok || !json.success) {
        setError(json.error || (clear ? 'Could not remove extra' : 'Could not apply extra'));
        return;
      }
      setDoc(json.data);
      setNotice(
        clear
          ? `Removed ${fieldLabel} from ${json.updated || 0} employee(s).`
          : `Applied to ${json.updated || 0} employee(s).`
      );
    } catch {
      setError(clear ? 'Could not remove extra' : 'Could not apply extra');
    } finally {
      setExtrasBusy(false);
    }
  };

  const setStatus = async (action: 'finalize' | 'reopen') => {
    const ok = confirmMajorAction(
      action === 'finalize' ? 'Finalize this salary month' : 'Re-open this salary month',
      action === 'finalize' ? 'Edits will be locked until you re-open.' : 'HR will be able to edit again.'
    );
    if (!ok) return;
    const res = await fetch(
      '/api/payroll/finalize',
      hrCredentialsInit({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ monthYear, action }),
      })
    );
    const json = await res.json();
    if (!res.ok || !json.success) {
      setError(json.error || 'Status update failed');
      return;
    }
    await load();
  };

  const setLineFreeze = async (ids: string[], action: 'finalize' | 'reopen', label: string) => {
    if (ids.length === 0) {
      setError(action === 'finalize' ? 'Select employees who are not already frozen.' : 'Select frozen employees to unfreeze.');
      return;
    }
    const ok = confirmMajorAction(
      action === 'finalize' ? `Freeze salary for ${label}` : `Unfreeze salary for ${label}`,
      action === 'finalize'
        ? 'This employee’s numbers stay locked. Generate and bulk extras will skip them until you unfreeze.'
        : 'HR can edit this employee again. Generate will recalculate them next time.'
    );
    if (!ok) return;
    setFreezeBusy(ids.length === 1 ? ids[0] : 'selected');
    setError(null);
    try {
      const res = await fetch(
        '/api/payroll/finalize',
        hrCredentialsInit({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ monthYear, action, userIds: ids }),
        })
      );
      const json = await res.json();
      if (!res.ok || !json.success) {
        setError(json.error || 'Could not update freeze');
        return;
      }
      if (json.data?.lines) {
        setDoc(json.data as PayrollDoc);
      } else {
        await load();
      }
      setNotice(
        action === 'finalize'
          ? `Frozen ${json.updated || ids.length} employee(s).`
          : `Unfrozen ${json.updated || ids.length} employee(s).`
      );
    } catch {
      setError('Could not update freeze');
    } finally {
      setFreezeBusy(null);
    }
  };

  const exportExcel = async () => {
    try {
      const res = await fetch(`/api/payroll/export?monthYear=${encodeURIComponent(monthYear)}`, hrCredentialsInit());
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        setError(json.error || 'Export failed');
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Salary-Sheet-${monthYear}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      setError('Export failed');
    }
  };

  const emailPayslips = async (ids: string[], label: string) => {
    if (ids.length === 0) return;
    if (!confirmMajorAction(`Email payslips to ${label}`, `${ids.length} employee(s).`)) return;
    setEmailBusy(true);
    setError(null);
    try {
      const res = await fetch(
        '/api/payroll/payslip',
        hrCredentialsInit({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ monthYear, employeeIds: ids }),
        })
      );
      const json = await res.json();
      if (!res.ok || !json.success) {
        setError(json.error || 'Email failed');
        return;
      }
      const failNote = json.failed?.length ? ` ${json.failed.length} failed.` : '';
      setNotice(`Sent ${json.sent} payslip(s).${failNote}`);
      await load();
    } catch {
      setError('Email failed');
    } finally {
      setEmailBusy(false);
    }
  };

  const selectCls =
    'rounded-lg border border-blue-200/65 bg-panel px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20';
  const inputCls =
    'w-full rounded-lg border border-blue-200/65 bg-panel px-3 py-2 text-sm text-slate-900 shadow-sm placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20';

  const grouped = GROUPS.map((g) => ({
    group: g,
    rows: filtered.filter((l) => l.group === g),
  })).filter((g) => g.rows.length > 0);

  return (
    <section className="space-y-5 p-6 text-slate-900" aria-labelledby="salary-heading">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-2">
          <h2 id="salary-heading" className="text-2xl font-bold tracking-tight text-slate-900">
            Salary
          </h2>
          <p className="text-sm text-slate-600">
            Monthly payroll from attendance, leave, and the employee master. For non-articles, Summary excess hours
            convert to overtime days; they are added to pay only after you approve them. Articles get no overtime.
          </p>
          <ol className="flex flex-wrap gap-2" aria-label="Workflow">
            {WORKFLOW.map((label, i) => (
              <li
                key={label}
                className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-700"
              >
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-blue-600 text-[10px] font-bold text-white">
                  {i + 1}
                </span>
                {label}
              </li>
            ))}
          </ol>
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:justify-end">
          <select id="salary-month" value={month} onChange={(e) => setMonth(Number(e.target.value))} className={selectCls}>
            {Array.from({ length: 12 }, (_, i) => (
              <option key={i + 1} value={i + 1}>
                {new Date(2000, i, 1).toLocaleString('default', { month: 'long' })}
              </option>
            ))}
          </select>
          <select id="salary-year" value={year} onChange={(e) => setYear(Number(e.target.value))} className={selectCls}>
            {Array.from({ length: 6 }, (_, i) => {
              const y = now.getFullYear() - 2 + i;
              return (
                <option key={y} value={y}>
                  {y}
                </option>
              );
            })}
          </select>
          <button
            type="button"
            onClick={() => void generate()}
            disabled={generating || finalized}
            className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700 disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${generating ? 'animate-spin' : ''}`} />
            {generating ? 'Generating…' : 'Generate'}
          </button>
          <button
            type="button"
            onClick={() => void exportExcel()}
            disabled={!doc}
            className="inline-flex items-center gap-2 rounded-lg border border-blue-200/65 bg-panel px-4 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50 disabled:opacity-50"
          >
            <Download className="h-4 w-4" />
            Export Excel
          </button>
          {finalized ? (
            <button
              type="button"
              onClick={() => void setStatus('reopen')}
              className="inline-flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-sm font-medium text-amber-900"
            >
              <Unlock className="h-4 w-4" />
              Re-open
            </button>
          ) : (
            <button
              type="button"
              onClick={() => void setStatus('finalize')}
              disabled={!doc}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-800 disabled:opacity-50"
            >
              <Lock className="h-4 w-4" />
              Finalize
            </button>
          )}
        </div>
      </header>

      {error && (
        <div className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          {error}
        </div>
      )}
      {notice && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{notice}</div>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {[
          { label: 'People', value: String(stats.headcount), icon: Users },
          { label: 'Gross payable', value: inr(stats.payable), icon: IndianRupee },
          { label: 'Bank payment', value: inr(stats.bank), icon: IndianRupee },
          { label: 'Cash off', value: inr(stats.cash), icon: IndianRupee },
          { label: 'Unsent slips', value: String(stats.unsent), icon: Mail },
          { label: 'Frozen', value: String(stats.frozen), icon: Lock },
        ].map((c) => (
          <div key={c.label} className="rounded-xl border border-blue-200/65 bg-panel p-4 shadow-sm">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{c.label}</p>
            <p className="mt-1 text-lg font-semibold text-slate-900">{c.value}</p>
          </div>
        ))}
      </div>

      {doc?.calendar && (
        <p className="text-xs text-slate-500">
          Calendar: {doc.calendar.totalDays} days · {doc.calendar.sundays} Sundays · {doc.calendar.ohd} OHD · office
          working {Math.max(0, doc.calendar.totalDays - doc.calendar.sundays - doc.calendar.ohd)}
          {finalized ? ' · Finalized' : ' · Draft'}
          {stats.frozen > 0 ? ` · ${stats.frozen} employee${stats.frozen === 1 ? '' : 's'} frozen` : ''}
        </p>
      )}

      {doc && (
        <div className="grid gap-4 rounded-xl border border-blue-200/65 bg-panel p-4 shadow-sm lg:grid-cols-2">
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-slate-900">Edit extras</h3>
            <p className="text-xs text-slate-500">
              Add a named extra (TDS, advances, a designation allowance). It appears on every employee. Earnings
              increase net pay; deductions reduce it.
            </p>
            <div className="flex flex-wrap items-end gap-2">
              <label className="min-w-[12rem] flex-1 text-xs text-slate-600">
                Name
                <input
                  className={`${inputCls} mt-1`}
                  disabled={finalized || extrasBusy}
                  placeholder="e.g. Senior Software Engineer allowance"
                  value={extraLabel}
                  onChange={(e) => setExtraLabel(e.target.value)}
                />
              </label>
              <label className="text-xs text-slate-600">
                Type
                <select
                  className={`${selectCls} mt-1`}
                  disabled={finalized || extrasBusy}
                  value={extraKind}
                  onChange={(e) => setExtraKind(e.target.value as PayrollExtraKind)}
                >
                  <option value="earning">Earning</option>
                  <option value="deduction">Deduction</option>
                </select>
              </label>
              <button
                type="button"
                disabled={finalized || extrasBusy}
                onClick={() => void addExtraField()}
                className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
              >
                <Plus className="h-4 w-4" />
                Add for everyone
              </button>
            </div>
            {extraFields.length === 0 ? (
              <p className="text-xs text-slate-500">No custom extras this month. Built-in TDS, advances, ESI still apply.</p>
            ) : (
              <ul className="space-y-1">
                {extraFields.map((f) => (
                  <li
                    key={f.id}
                    className="flex items-center justify-between rounded-md border border-slate-200 bg-white px-2 py-1 text-xs"
                  >
                    <span>
                      {f.label}{' '}
                      <span className="text-slate-400">({f.kind})</span>
                    </span>
                    <button
                      type="button"
                      disabled={finalized || extrasBusy}
                      onClick={() => void removeExtraField(f)}
                      className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-rose-700 hover:bg-rose-50 disabled:opacity-50"
                    >
                      <Trash2 className="h-3 w-3" />
                      Remove extra
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {extraFields.length > 0 && (
              <p className="text-xs text-slate-500">
                Open any employee (chevron on the right) to type an amount, or use Apply to people.
              </p>
            )}
          </div>
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-slate-900">Apply to people</h3>
            <p className="text-xs text-slate-500">
              Set or clear the same amount on all employees, the selected rows, or one designation.
            </p>
            <div className="grid gap-2 sm:grid-cols-2">
              <label className="text-xs text-slate-600">
                Field
                <select
                  className={`${selectCls} mt-1 w-full`}
                  disabled={finalized || extrasBusy}
                  value={bulkField}
                  onChange={(e) => setBulkField(e.target.value)}
                >
                  {PAYROLL_BULK_BUILTIN_FIELDS.map((key) => (
                    <option key={key} value={key}>
                      {PAYROLL_BULK_BUILTIN_LABELS[key]}
                    </option>
                  ))}
                  {extraFields.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-xs text-slate-600">
                Amount
                <input
                  type="number"
                  step="0.01"
                  className={`${inputCls} mt-1`}
                  disabled={finalized || extrasBusy}
                  value={bulkAmount}
                  onChange={(e) => setBulkAmount(e.target.value)}
                />
              </label>
              <label className="text-xs text-slate-600">
                Apply to
                <select
                  className={`${selectCls} mt-1 w-full`}
                  disabled={finalized || extrasBusy}
                  value={bulkScope}
                  onChange={(e) => setBulkScope(e.target.value as 'all' | 'selected' | 'designation')}
                >
                  <option value="all">All employees</option>
                  <option value="selected">Selected rows ({selected.size})</option>
                  <option value="designation">One designation</option>
                </select>
              </label>
              {bulkScope === 'designation' && (
                <label className="text-xs text-slate-600">
                  Designation
                  <select
                    className={`${selectCls} mt-1 w-full`}
                    disabled={finalized || extrasBusy}
                    value={bulkDesignation}
                    onChange={(e) => setBulkDesignation(e.target.value)}
                  >
                    <option value="">Pick designation</option>
                    {designations.map((d) => (
                      <option key={d} value={d}>
                        {d}
                      </option>
                    ))}
                  </select>
                </label>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={finalized || extrasBusy || !doc}
                onClick={() => void applyBulkExtra(false)}
                className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
              >
                {extrasBusy ? 'Working…' : 'Apply amount'}
              </button>
              <button
                type="button"
                disabled={finalized || extrasBusy || !doc || !bulkField}
                onClick={() => void applyBulkExtra(true)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-rose-200 bg-rose-50 px-4 py-2 text-sm font-medium text-rose-900 disabled:opacity-50"
              >
                <Trash2 className="h-4 w-4" />
                Remove amount
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[16rem] flex-1">
          <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
          <input
            className={`${inputCls} pl-9`}
            placeholder="Search name, team, category…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <select value={groupFilter} onChange={(e) => setGroupFilter(e.target.value as 'all' | PayrollGroup)} className={selectCls}>
          <option value="all">All groups</option>
          {GROUPS.map((g) => (
            <option key={g} value={g}>
              {GROUP_LABEL[g]}
            </option>
          ))}
        </select>
        <button type="button" onClick={selectFiltered} className="rounded-lg border border-slate-200 px-3 py-2 text-sm">
          Select filtered
        </button>
        <button
          type="button"
          onClick={() => void emailPayslips([...selected], 'selected employees')}
          disabled={emailBusy || selected.size === 0}
          className="inline-flex items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-medium text-rose-900 disabled:opacity-50"
        >
          <Mail className="h-4 w-4" />
          Email selected ({selected.size})
        </button>
        <button
          type="button"
          onClick={() => void emailPayslips(filtered.map(uid), 'all filtered')}
          disabled={emailBusy || filtered.length === 0}
          className="inline-flex items-center gap-2 rounded-lg bg-rose-700 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          <Mail className="h-4 w-4" />
          Email filtered ({filtered.length})
        </button>
        <button
          type="button"
          onClick={() =>
            void setLineFreeze(
              [...selected].filter((id) => !lines.find((l) => uid(l) === id)?.frozen),
              'finalize',
              `${selected.size} selected`
            )
          }
          disabled={finalized || freezeBusy !== null || selected.size === 0}
          className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-800 disabled:opacity-50"
        >
          <Lock className="h-4 w-4" />
          Freeze selected
        </button>
        <button
          type="button"
          onClick={() =>
            void setLineFreeze(
              [...selected].filter((id) => Boolean(lines.find((l) => uid(l) === id)?.frozen)),
              'reopen',
              'selected frozen employees'
            )
          }
          disabled={finalized || freezeBusy !== null || selected.size === 0}
          className="inline-flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-900 disabled:opacity-50"
        >
          <Unlock className="h-4 w-4" />
          Unfreeze selected
        </button>
      </div>

      {loading && <p className="text-sm text-slate-500">Loading…</p>}
      {!loading && !doc && (
        <p className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center text-sm text-slate-600">
          No payroll for {formatMonthLabel(monthYear)} yet. Click Generate.
        </p>
      )}

      {grouped.map(({ group, rows }) => (
        <div key={group} className="overflow-hidden rounded-xl border border-blue-200/65 bg-panel shadow-sm">
          <div className="border-b border-slate-200 bg-slate-50 px-4 py-2 text-sm font-semibold text-slate-800">
            {GROUP_LABEL[group]} ({rows.length})
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                  <th className="px-3 py-2" />
                  <th className="px-3 py-2">Name</th>
                  <th className="px-3 py-2">Working</th>
                  <th className="px-3 py-2">Net days</th>
                  <th className="px-3 py-2">Basic</th>
                  <th className="px-3 py-2">Payable</th>
                  <th className="px-3 py-2">Bank</th>
                  <th className="px-3 py-2">Diff</th>
                  <th className="px-3 py-2">Slip</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {rows.map((line) => {
                  const id = uid(line);
                  const open = expanded === id;
                  const checkWarn = Math.abs(Number(line.checking || 0)) > 0.05;
                  const lineLocked = isPayrollLineFrozen(line, doc?.status);
                  return (
                    <React.Fragment key={id}>
                      <tr className={`border-b border-slate-100 hover:bg-slate-50/80 ${line.frozen ? 'bg-slate-50' : ''}`}>
                        <td className="px-3 py-2">
                          <input type="checkbox" checked={selected.has(id)} onChange={() => toggleSelect(id)} />
                        </td>
                        <td className="px-3 py-2">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="font-medium text-slate-900">{line.name}</span>
                            {line.frozen ? (
                              <span className="inline-flex items-center gap-0.5 rounded bg-slate-800 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
                                <Lock className="h-2.5 w-2.5" />
                                Frozen
                              </span>
                            ) : null}
                          </div>
                          <div className="text-xs text-slate-500">
                            {line.designation || line.category} · {line.verticalHead || line.team || '—'}
                            {line.isNewJoin ? ' · New join' : ''}
                            {line.isArticle && line.articleshipYear ? ` · Year ${line.articleshipYear}` : ''}
                            {(() => {
                              if (line.isArticle) return '';
                              const excess = payrollExcessHours(line);
                              const suggested = Number(line.overtimeSuggested || 0);
                              const inPay = Number(line.overtimeDays || 0);
                              if (inPay > 0) {
                                return ` · OT ${inPay}d in pay (${formatHoursMinutes(excess)} excess)`;
                              }
                              if (suggested > 0 || excess > 0) {
                                return ` · ${formatHoursMinutes(excess)} excess → ${suggested}d OT (not in pay)`;
                              }
                              return '';
                            })()}
                          </div>
                        </td>
                        <td className="px-3 py-2">{line.weekdaysWorking}</td>
                        <td className="px-3 py-2">{line.netWorkingDays}</td>
                        <td className="px-3 py-2">{inr(line.basic)}</td>
                        <td className="px-3 py-2 font-medium">{inr(line.payableMonth)}</td>
                        <td className="px-3 py-2">{inr(line.bankPayment)}</td>
                        <td className={`px-3 py-2 ${Math.abs(line.diff) > 0.5 ? 'text-rose-700' : 'text-slate-500'}`}>
                          {line.diff}
                        </td>
                        <td className="px-3 py-2 text-xs text-slate-500">
                          {line.payslipSentAt ? 'Sent' : '—'}
                          {checkWarn ? <span className="ml-1 text-amber-700">check</span> : null}
                        </td>
                        <td className="px-3 py-2">
                          <div className="flex items-center justify-end gap-1">
                            <button
                              type="button"
                              title={line.frozen ? 'Unfreeze this employee' : 'Freeze this employee'}
                              disabled={finalized || freezeBusy !== null}
                              onClick={() =>
                                void setLineFreeze(
                                  [id],
                                  line.frozen ? 'reopen' : 'finalize',
                                  line.name
                                )
                              }
                              className={`rounded-md border p-1 disabled:opacity-50 ${
                                line.frozen
                                  ? 'border-amber-200 bg-amber-50 text-amber-900 hover:bg-amber-100'
                                  : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                              }`}
                            >
                              {line.frozen ? <Unlock className="h-4 w-4" /> : <Lock className="h-4 w-4" />}
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setExpanded(open ? null : id);
                                setDraftOverrides({
                                  ...(line.overrides || {}),
                                  customAmounts: { ...(line.overrides?.customAmounts || {}) },
                                });
                              }}
                              className="rounded-md border border-slate-200 p-1 text-slate-600 hover:bg-slate-50"
                            >
                              {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                            </button>
                          </div>
                        </td>
                      </tr>
                      {open && (
                        <tr className="bg-slate-50/70">
                          <td colSpan={10} className="px-4 py-4">
                            {line.frozen ? (
                              <p className="mb-3 text-xs text-amber-800">
                                This employee is frozen. Unfreeze to edit numbers. Generate and bulk extras skip them.
                              </p>
                            ) : null}
                            <OverrideForm
                              line={line}
                              extraFields={extraFields}
                              draft={draftOverrides}
                              setDraft={setDraftOverrides}
                              disabled={lineLocked}
                              saving={savingId === id}
                              onSave={() => void saveOverrides(line)}
                              onApproveOvertime={() =>
                                void saveLineOverrides(
                                  line,
                                  { ...draftOverrides, overtimeDays: Number(line.overtimeSuggested || 0) },
                                  `Overtime added to pay for ${line.name}.`
                                )
                              }
                              onRemoveOvertime={() =>
                                void saveLineOverrides(
                                  line,
                                  { ...draftOverrides, overtimeDays: null },
                                  `Overtime removed from pay for ${line.name}.`
                                )
                              }
                              inputCls={inputCls}
                            />
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </section>
  );
};

function BreakdownRow({ label, value, inPay }: { label: string; value: string; inPay: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-0.5 text-xs">
      <span className="text-slate-600">{label}</span>
      <span className={`tabular-nums font-medium ${inPay ? 'text-slate-900' : 'text-slate-500'}`}>
        {value}
        <span className={`ml-2 text-[10px] font-semibold uppercase tracking-wide ${inPay ? 'text-emerald-700' : 'text-slate-400'}`}>
          {inPay ? 'in pay' : 'not in pay'}
        </span>
      </span>
    </div>
  );
}

function OverrideForm({
  line,
  extraFields,
  draft,
  setDraft,
  disabled,
  saving,
  onSave,
  onApproveOvertime,
  onRemoveOvertime,
  inputCls,
}: {
  line: PayrollLine;
  extraFields: PayrollExtraField[];
  draft: PayrollOverrides;
  setDraft: (o: PayrollOverrides) => void;
  disabled: boolean;
  saving: boolean;
  onSave: () => void;
  onApproveOvertime: () => void;
  onRemoveOvertime: () => void;
  inputCls: string;
}) {
  const set = (key: keyof PayrollOverrides, raw: string) => {
    if (key === 'remarks' || key === 'group') {
      setDraft({ ...draft, [key]: raw || undefined });
      return;
    }
    const n = raw === '' ? null : Number(raw);
    setDraft({ ...draft, [key]: n });
  };
  const field = (key: keyof PayrollOverrides, label: string, fallback: number) => (
    <label className="block text-xs text-slate-600">
      {label}
      <input
        type="number"
        step="0.01"
        disabled={disabled}
        className={`${inputCls} mt-1`}
        value={draft[key] == null || draft[key] === undefined ? '' : String(draft[key])}
        placeholder={String(fallback)}
        onChange={(e) => set(key, e.target.value)}
      />
    </label>
  );
  const otSuggested = Number(line.overtimeSuggested || 0);
  const otInPay = Number(line.overtimeDays || 0);
  const weekdayHours = Number(line.weekdayHours || 8);
  const excessHours = payrollExcessHours(line);
  const excessLabel = formatHoursMinutes(excessHours);
  const otApproved = !line.isArticle && otInPay > 0;
  const netWithoutOt = Number(
    (Number(line.weekdaysWorking || 0) + Number(line.leavesConsumed || 0) + Number(line.weekoffWorking || 0)).toFixed(3)
  );

  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-lg border border-slate-200 bg-white px-3 py-2">
          <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Days in this salary</p>
          <BreakdownRow label="Weekdays working" value={String(line.weekdaysWorking)} inPay />
          <BreakdownRow
            label="Leave consumed"
            value={line.isArticle ? '0 (articles)' : String(line.leavesConsumed)}
            inPay={!line.isArticle}
          />
          <BreakdownRow label="Weekoff working" value={String(line.weekoffWorking)} inPay />
          <BreakdownRow
            label="Overtime from excess hours"
            value={line.isArticle ? '0 (articles)' : String(otInPay)}
            inPay={!line.isArticle && otInPay > 0}
          />
          <div className="mt-1 flex items-baseline justify-between border-t border-slate-100 pt-1 text-xs font-semibold">
            <span>Net working days</span>
            <span className="tabular-nums">{line.netWorkingDays}</span>
          </div>
          <p className="mt-1 text-[11px] text-slate-500">
            {line.isArticle
              ? 'Articles: weekdays + weekoff only. No overtime.'
              : otApproved
                ? `Base days ${netWithoutOt} + approved OT ${otInPay}`
                : `Base days ${netWithoutOt}. Converted OT is not in pay until you approve it.`}
          </p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white px-3 py-2">
          <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Excess-hour overtime</p>
          <BreakdownRow
            label="Monday schedule (day length)"
            value={line.isArticle ? '—' : `${weekdayHours} h`}
            inPay={false}
          />
          <BreakdownRow
            label="Excess (same as Summary)"
            value={line.isArticle ? '0 (articles)' : excessLabel}
            inPay={false}
          />
          <BreakdownRow
            label="Converted to overtime days"
            value={line.isArticle ? '0 (articles)' : `${otSuggested} d`}
            inPay={otApproved && otSuggested > 0 && otInPay === otSuggested}
          />
          <p className="mt-2 text-[11px] text-slate-500">
            {line.isArticle
              ? 'Articles get no overtime.'
              : 'Summary excess ÷ Monday scheduled hours. Approve overtime to add those days to payable net days.'}
          </p>
          {!line.isArticle && otSuggested > 0 && (
            <div className="mt-2 flex flex-wrap gap-2">
              <button
                type="button"
                disabled={disabled || saving || (otApproved && otInPay === otSuggested)}
                onClick={onApproveOvertime}
                className="rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
              >
                {otApproved && otInPay === otSuggested
                  ? 'Overtime in pay'
                  : `Approve overtime (${otSuggested} d)`}
              </button>
              {otApproved && (
                <button
                  type="button"
                  disabled={disabled || saving}
                  onClick={onRemoveOvertime}
                  className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 disabled:opacity-50"
                >
                  Remove from pay
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      <p className="text-xs text-slate-500">
        Leave taken {line.leavesTaken} · C/F {line.leavesCf} · Office days {line.officeWorkingDays} · Checking {line.checking}
        {Math.abs(Number(line.checking || 0)) > 0.05 ? ' (should be 0)' : ''}
      </p>
      <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {!line.isArticle && field('overtimeDays', 'Overtime days override', line.overtimeSuggested)}
        {field('netWorkingDays', 'Net working days override', line.netWorkingDays)}
        {field('officeWorkingDays', 'Office working days override', line.officeWorkingDays)}
        {field('dueInTally', 'Due in tally', line.payableMonth)}
        {field('additionInOffDue', 'Addition in off due', 0)}
        {field('advances', 'Advances', 0)}
        {field('tds', 'TDS', 0)}
        {field('esiEmployee', 'ESI employee', 0)}
        {field('esiEmployer', 'ESI employer', 0)}
        {field('otherExtra', 'Other extra', 0)}
        {field('off', 'OFF', 0)}
        {field('taReimbursement', 'TA reimbursement', 0)}
        {field('lcReimbursement', 'LC reimbursement', 0)}
        {field('laptopAdjustment', 'Laptop adjustment', 0)}
        {extraFields.length > 0 && (
          <p className="sm:col-span-3 lg:col-span-4 mt-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            Custom extras
          </p>
        )}
        {extraFields.map((ex) => (
          <label key={ex.id} className="block text-xs text-slate-600">
            {ex.label} ({ex.kind})
            <input
              type="number"
              step="0.01"
              disabled={disabled}
              className={`${inputCls} mt-1`}
              value={
                draft.customAmounts?.[ex.id] == null || draft.customAmounts?.[ex.id] === undefined
                  ? ''
                  : String(draft.customAmounts[ex.id])
              }
              placeholder="0"
              onChange={(e) => {
                const raw = e.target.value;
                const n = raw === '' ? null : Number(raw);
                setDraft({
                  ...draft,
                  customAmounts: { ...(draft.customAmounts || {}), [ex.id]: n },
                });
              }}
            />
          </label>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={disabled || saving}
          onClick={onSave}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Save overrides'}
        </button>
        <span className="text-xs text-slate-500">
          Overtime stays out of pay until you approve it. Other blank fields keep the calculated value.
        </span>
      </div>
    </div>
  );
}
