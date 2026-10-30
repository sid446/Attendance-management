'use client';

import { inr, type PayrollAmountPreview, type PayrollExtraField, type PayrollOverrides } from '@/lib/salaryCalculation';
import { formatHoursMinutes } from '@/lib/attendanceSummaryMetrics';
import type { PayrollLine } from '../types';
import { payrollExcessHours } from '../utils/salaryUtils';
import { BreakdownRow } from './BreakdownRow';

export function OverrideForm({
  line,
  extraFields,
  draft,
  setDraft,
  preview,
  unsaved,
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
  preview: PayrollAmountPreview | null;
  unsaved: boolean;
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
  const otInPay = Number(preview?.overtimeDays ?? line.overtimeDays ?? 0);
  const weekdayHours = Number(line.weekdayHours || 8);
  const excessHours = payrollExcessHours(line);
  const excessLabel = formatHoursMinutes(excessHours);
  const otApproved = !line.isArticle && otInPay > 0;
  const netWithoutOt = Number(
    (Number(line.weekdaysWorking || 0) + Number(line.leavesConsumed || 0) + Number(line.weekoffWorking || 0)).toFixed(3)
  );
  const payableMonth = Number(preview?.payableMonth ?? line.payableMonth ?? 0);
  const bankPayment = Number(preview?.bankPayment ?? line.bankPayment ?? 0);
  const cashOff = Number(preview?.cashOff ?? line.cashOff ?? 0);
  const netWorkingDays = Number(preview?.netWorkingDays ?? line.netWorkingDays ?? 0);
  const officeWorkingDays = Number(preview?.officeWorkingDays ?? line.officeWorkingDays ?? 0);

  return (
    <div className="space-y-4">
      <div
        className={`rounded-lg border px-3 py-2 ${
          unsaved ? 'border-amber-300 bg-amber-50' : 'border-slate-200 bg-white'
        }`}
      >
        <div className="mb-1 flex items-center justify-between gap-2">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Upcoming totals</p>
          {unsaved ? (
            <span className="rounded border border-amber-200 bg-white px-1.5 py-0.5 text-[11px] font-medium text-amber-900">
              Not saved
            </span>
          ) : (
            <span className="text-[11px] text-slate-500">Saved</span>
          )}
        </div>
        <div className="grid gap-2 sm:grid-cols-3">
          <div>
            <p className="text-[11px] text-slate-500">Payable</p>
            <p className="text-sm font-semibold tabular-nums text-slate-900">{inr(payableMonth)}</p>
          </div>
          <div>
            <p className="text-[11px] text-slate-500">Bank payment</p>
            <p className="text-sm font-semibold tabular-nums text-slate-900">{inr(bankPayment)}</p>
          </div>
          <div>
            <p className="text-[11px] text-slate-500">Cash off</p>
            <p className="text-sm font-semibold tabular-nums text-slate-900">{inr(cashOff)}</p>
          </div>
        </div>
        <p className="mt-1 text-[11px] text-slate-500">
          Totals change as you type. They are not stored until you click Save overrides. Bank payment starts from due
          in tally, then adds other extra, TA, and LC, and deducts TDS, ESI employee, advances, and laptop adjustment.
        </p>
      </div>
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
            <span className="tabular-nums">{netWorkingDays}</span>
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
        Leave taken {line.leavesTaken} · C/F {line.leavesCf} · Office days {officeWorkingDays} · Checking {line.checking}
        {Math.abs(Number(line.checking || 0)) > 0.05 ? ' (should be 0)' : ''}
      </p>
      <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {!line.isArticle && field('overtimeDays', 'Overtime days override', line.overtimeSuggested)}
        {field('netWorkingDays', 'Net working days override', netWorkingDays)}
        {field('officeWorkingDays', 'Office working days override', officeWorkingDays)}
        {field('dueInTally', 'Due in tally', payableMonth)}
        <p className="sm:col-span-3 lg:col-span-4 mt-1 text-[11px] font-semibold uppercase tracking-wide text-emerald-700">
          Added to bank payment
        </p>
        {field('otherExtra', 'Other extra', 0)}
        {field('taReimbursement', 'TA reimbursement', 0)}
        {field('lcReimbursement', 'LC reimbursement', 0)}
        <p className="sm:col-span-3 lg:col-span-4 mt-1 text-[11px] font-semibold uppercase tracking-wide text-rose-700">
          Deducted from bank payment
        </p>
        {field('tds', 'TDS', 0)}
        {field('esiEmployee', 'ESI employee', 0)}
        {field('advances', 'Advances', 0)}
        {field('laptopAdjustment', 'Laptop adjustment', 0)}
        <p className="sm:col-span-3 lg:col-span-4 mt-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
          Cash, not bank
        </p>
        {field('additionInOffDue', 'Addition in off due', 0)}
        {field('off', 'OFF', 0)}
        <p className="sm:col-span-3 lg:col-span-4 mt-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
          Employer cost, not in employee bank pay
        </p>
        {field('esiEmployer', 'ESI employer', 0)}
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
          {unsaved
            ? 'Upcoming totals above are a preview only. Click Save overrides to store them.'
            : 'Overtime stays out of pay until you approve it. Other blank fields keep the calculated value.'}
        </span>
      </div>
    </div>
  );
}
