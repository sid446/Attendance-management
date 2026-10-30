'use client';

export function BreakdownRow({ label, value, inPay }: { label: string; value: string; inPay: boolean }) {
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
