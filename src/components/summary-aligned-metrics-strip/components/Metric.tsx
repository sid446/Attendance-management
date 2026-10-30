'use client';

export function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="whitespace-nowrap">
      <span className="font-semibold text-slate-900">{label}:</span>{' '}
      <span className="font-mono tabular-nums text-slate-800">{value}</span>
    </div>
  );
}
