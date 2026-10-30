'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { hrCredentialsInit } from '@/lib/hrAuthHeaders';
import { confirmMajorAction } from '@/lib/confirmMajorAction';
import { formatMonthLabel, PAYROLL_BULK_BUILTIN_LABELS, normalizePayrollExtraFields, isPayrollLineFrozen, previewPayrollLineFromOverrides, type PayrollAmountPreview, type PayrollExtraField, type PayrollExtraKind, type PayrollGroup, type PayrollOverrides } from '@/lib/salaryCalculation';
import type { PayrollDoc, InvalidDayIssue, EmptyDayIssue, IssuePanelKind, PayrollLine } from '../types';
import { GROUPS } from '../constants';
import { uid, payrollOverridesSignature } from '../utils/salaryUtils';

export function useSalarySectionLogic() {
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
  const [slipBusy, setSlipBusy] = useState<string | null>(null);
  const [draftOverrides, setDraftOverrides] = useState<PayrollOverrides>({});
  const [extraLabel, setExtraLabel] = useState('');
  const [extraKind, setExtraKind] = useState<PayrollExtraKind>('earning');
  const [bulkField, setBulkField] = useState<string>('tds');
  const [bulkAmount, setBulkAmount] = useState('');
  const [bulkScope, setBulkScope] = useState<'all' | 'selected' | 'designation'>('all');
  const [bulkDesignation, setBulkDesignation] = useState('');
  const [extrasBusy, setExtrasBusy] = useState(false);
  const [freezeBusy, setFreezeBusy] = useState<string | 'selected' | null>(null);
  const [invalidByUser, setInvalidByUser] = useState<Map<string, InvalidDayIssue[]>>(new Map());
  const [emptyByUser, setEmptyByUser] = useState<Map<string, EmptyDayIssue>>(new Map());
  const [issuePanel, setIssuePanel] = useState<{ id: string; kind: IssuePanelKind } | null>(null);

  const monthYear = `${year}-${String(month).padStart(2, '0')}`;
  const finalized = doc?.status === 'finalized';

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setIssuePanel(null);
    try {
      const [res, invalidRes, emptyRes] = await Promise.all([
        fetch(`/api/payroll?monthYear=${encodeURIComponent(monthYear)}`, hrCredentialsInit()),
        fetch(
          `/api/attendance/invalid-records?monthYear=${encodeURIComponent(monthYear)}`,
          hrCredentialsInit()
        ),
        fetch(
          `/api/attendance/missing-month?monthYear=${encodeURIComponent(monthYear)}`,
          hrCredentialsInit()
        ),
      ]);

      const invalidJson = await invalidRes.json().catch(() => null);
      const nextInvalid = new Map<string, InvalidDayIssue[]>();
      if (invalidJson?.success && Array.isArray(invalidJson.data)) {
        for (const emp of invalidJson.data as Array<{
          userId?: string;
          invalidRecords?: Array<{
            date?: string;
            checkin?: string;
            checkout?: string;
            issue?: string;
          }>;
        }>) {
          const days = (emp.invalidRecords || [])
            .filter((r) => r.date && (r.issue === 'missing-checkin' || r.issue === 'missing-checkout'))
            .map((r) => ({
              date: String(r.date).slice(0, 10),
              checkin: String(r.checkin || ''),
              checkout: String(r.checkout || ''),
              issue: r.issue as InvalidDayIssue['issue'],
            }));
          if (days.length > 0 && emp.userId) nextInvalid.set(String(emp.userId), days);
        }
      }
      setInvalidByUser(nextInvalid);

      const emptyJson = await emptyRes.json().catch(() => null);
      const nextEmpty = new Map<string, EmptyDayIssue>();
      if (emptyJson?.success && Array.isArray(emptyJson.data)) {
        for (const emp of emptyJson.data as Array<{
          userId?: string;
          wholeMonthMissing?: boolean;
          missingDays?: Array<{ date?: string }>;
        }>) {
          const dates = (emp.missingDays || [])
            .map((d) => String(d.date || '').slice(0, 10))
            .filter(Boolean);
          if (dates.length > 0 && emp.userId) {
            nextEmpty.set(String(emp.userId), {
              dates,
              wholeMonthMissing: Boolean(emp.wholeMonthMissing),
            });
          }
        }
      }
      setEmptyByUser(nextEmpty);

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
      setInvalidByUser(new Map());
      setEmptyByUser(new Map());
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

  const expandedLine = useMemo(
    () => (expanded ? lines.find((l) => uid(l) === expanded) : undefined),
    [expanded, lines]
  );

  const draftPreview = useMemo((): PayrollAmountPreview | null => {
    if (!expandedLine || !doc?.calendar) return null;
    return previewPayrollLineFromOverrides(
      expandedLine,
      draftOverrides,
      extraFields,
      doc.calendar
    );
  }, [expandedLine, draftOverrides, extraFields, doc?.calendar]);

  const draftUnsaved = Boolean(
    expandedLine &&
      payrollOverridesSignature(draftOverrides) !== payrollOverridesSignature(expandedLine.overrides)
  );

  const displayLines = useMemo(() => {
    if (!expanded || !draftPreview) return filtered;
    return filtered.map((l) =>
      uid(l) === expanded
        ? {
            ...l,
            ...draftPreview,
          }
        : l
    );
  }, [filtered, expanded, draftPreview]);

  const stats = useMemo(() => {
    const headcount = displayLines.length;
    const payable = displayLines.reduce((s, l) => s + Number(l.payableMonth || 0), 0);
    const bank = displayLines.reduce((s, l) => s + Number(l.bankPayment || 0), 0);
    const cash = displayLines.reduce((s, l) => s + Number(l.cashOff || 0), 0);
    const unsent = displayLines.filter((l) => !l.payslipSentAt).length;
    const frozen = displayLines.filter((l) => l.frozen).length;
    const withInvalid = displayLines.filter((l) => (invalidByUser.get(uid(l))?.length || 0) > 0).length;
    const withEmpty = displayLines.filter((l) => (emptyByUser.get(uid(l))?.dates.length || 0) > 0).length;
    return { headcount, payable, bank, cash, unsent, frozen, withInvalid, withEmpty };
  }, [displayLines, invalidByUser, emptyByUser]);

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

  const downloadPayslip = async (id: string, name: string) => {
    setSlipBusy(id);
    setError(null);
    try {
      const res = await fetch(
        `/api/payroll/payslip?monthYear=${encodeURIComponent(monthYear)}&employeeId=${encodeURIComponent(id)}`,
        hrCredentialsInit()
      );
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        setError(json.error || 'Could not download payslip');
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const header = res.headers.get('Content-Disposition') || '';
      const quoted = /filename="([^"]+)"/.exec(header)?.[1];
      a.href = url;
      a.download = quoted || `Salary Slip - ${name}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      setError('Could not download payslip');
    } finally {
      setSlipBusy(null);
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
    rows: displayLines.filter((l) => l.group === g),
  })).filter((g) => g.rows.length > 0);

  return {
    now,
    month,
    setMonth,
    year,
    setYear,
    doc,
    loading,
    generating,
    error,
    notice,
    search,
    setSearch,
    groupFilter,
    setGroupFilter,
    selected,
    expanded,
    setExpanded,
    savingId,
    emailBusy,
    slipBusy,
    draftOverrides,
    setDraftOverrides,
    extraLabel,
    setExtraLabel,
    extraKind,
    setExtraKind,
    bulkField,
    setBulkField,
    bulkAmount,
    setBulkAmount,
    bulkScope,
    setBulkScope,
    bulkDesignation,
    setBulkDesignation,
    extrasBusy,
    freezeBusy,
    invalidByUser,
    emptyByUser,
    issuePanel,
    setIssuePanel,
    monthYear,
    finalized,
    generate,
    lines,
    extraFields,
    designations,
    filtered,
    draftPreview,
    draftUnsaved,
    stats,
    toggleSelect,
    selectFiltered,
    saveLineOverrides,
    saveOverrides,
    addExtraField,
    removeExtraField,
    applyBulkExtra,
    setStatus,
    setLineFreeze,
    exportExcel,
    downloadPayslip,
    emailPayslips,
    selectCls,
    inputCls,
    grouped,
  } as const;
}
