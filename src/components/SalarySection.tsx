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
} from 'lucide-react';
import { hrCredentialsInit } from '@/lib/hrAuthHeaders';
import { confirmMajorAction } from '@/lib/confirmMajorAction';
import { formatMonthLabel, inr, type PayrollGroup, type PayrollOverrides } from '@/lib/salaryCalculation';

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
  penalty: number;
  bankPayment: number;
  cashOff: number;
  diff: number;
  netSalary: number;
  overrides?: PayrollOverrides;
  payslipSentAt?: string | null;
};

type PayrollDoc = {
  monthYear: string;
  status: 'draft' | 'finalized';
  calendar: { totalDays: number; sundays: number; ohd: number };
  lines: PayrollLine[];
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
    return { headcount, payable, bank, cash, unsent };
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

  const saveOverrides = async (line: PayrollLine) => {
    const id = uid(line);
    setSavingId(id);
    setError(null);
    try {
      const res = await fetch(
        '/api/payroll/line',
        hrCredentialsInit({
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ monthYear, userId: id, overrides: draftOverrides }),
        })
      );
      const json = await res.json();
      if (!res.ok || !json.success) {
        setError(json.error || 'Save failed');
        return;
      }
      setDoc((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          lines: prev.lines.map((l) => (uid(l) === id ? { ...l, ...json.data } : l)),
        };
      });
      setNotice(`Saved overrides for ${line.name}.`);
    } catch {
      setError('Save failed');
    } finally {
      setSavingId(null);
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
            Monthly payroll from attendance, leave, and the employee master — same rules as the Salary sheet.
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

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {[
          { label: 'People', value: String(stats.headcount), icon: Users },
          { label: 'Gross payable', value: inr(stats.payable), icon: IndianRupee },
          { label: 'Bank payment', value: inr(stats.bank), icon: IndianRupee },
          { label: 'Cash off', value: inr(stats.cash), icon: IndianRupee },
          { label: 'Unsent slips', value: String(stats.unsent), icon: Mail },
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
        </p>
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
                  return (
                    <React.Fragment key={id}>
                      <tr className="border-b border-slate-100 hover:bg-slate-50/80">
                        <td className="px-3 py-2">
                          <input type="checkbox" checked={selected.has(id)} onChange={() => toggleSelect(id)} />
                        </td>
                        <td className="px-3 py-2">
                          <div className="font-medium text-slate-900">{line.name}</div>
                          <div className="text-xs text-slate-500">
                            {line.designation || line.category} · {line.verticalHead || line.team || '—'}
                            {line.isNewJoin ? ' · New join' : ''}
                            {line.isArticle && line.articleshipYear ? ` · Year ${line.articleshipYear}` : ''}
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
                          <button
                            type="button"
                            onClick={() => {
                              setExpanded(open ? null : id);
                              setDraftOverrides({ ...(line.overrides || {}) });
                            }}
                            className="rounded-md border border-slate-200 p-1 text-slate-600 hover:bg-slate-50"
                          >
                            {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                          </button>
                        </td>
                      </tr>
                      {open && (
                        <tr className="bg-slate-50/70">
                          <td colSpan={10} className="px-4 py-4">
                            <OverrideForm
                              line={line}
                              draft={draftOverrides}
                              setDraft={setDraftOverrides}
                              disabled={finalized}
                              saving={savingId === id}
                              onSave={() => void saveOverrides(line)}
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

function OverrideForm({
  line,
  draft,
  setDraft,
  disabled,
  saving,
  onSave,
  inputCls,
}: {
  line: PayrollLine;
  draft: PayrollOverrides;
  setDraft: (o: PayrollOverrides) => void;
  disabled: boolean;
  saving: boolean;
  onSave: () => void;
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
  return (
    <div className="space-y-3">
      <p className="text-xs text-slate-500">
        Weekdays {line.weekdaysWorking} · Leave taken {line.leavesTaken} (consumed {line.leavesConsumed}, C/F {line.leavesCf}) ·
        Weekoff {line.weekoffWorking} · OT suggested {line.overtimeSuggested} · Office days {line.officeWorkingDays} · Checking{' '}
        {line.checking}
      </p>
      <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {field('overtimeDays', 'Overtime days', line.overtimeSuggested)}
        {field('netWorkingDays', 'Net working days override', line.netWorkingDays)}
        {field('officeWorkingDays', 'Office working days override', line.officeWorkingDays)}
        {field('dueInTally', 'Due in tally', line.payableMonth)}
        {field('additionInOffDue', 'Addition in off due', 0)}
        {field('penalty', 'Penalty', line.penalty)}
        {field('advances', 'Advances', 0)}
        {field('tds', 'TDS', 0)}
        {field('esiEmployee', 'ESI employee', 0)}
        {field('esiEmployer', 'ESI employer', 0)}
        {field('otherExtra', 'Other extra', 0)}
        {field('off', 'OFF', 0)}
        {field('taReimbursement', 'TA reimbursement', 0)}
        {field('lcReimbursement', 'LC reimbursement', 0)}
        {field('laptopAdjustment', 'Laptop adjustment', 0)}
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
        <span className="text-xs text-slate-500">Blank fields keep the calculated value.</span>
      </div>
    </div>
  );
}
