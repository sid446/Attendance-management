export function numInput(
  value: number | undefined,
  fallback: number,
  onChange: (v: number) => void
) {
  return (
    <input
      type="number"
      min={0}
      value={value ?? fallback}
      onChange={(e) => onChange(Number(e.target.value))}
      className="w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-900"
    />
  );
}

export function cutoffInput(
  value: number | undefined,
  fallback: number,
  onChange: (v: number) => void
) {
  return (
    <input
      type="number"
      min={1}
      max={31}
      value={value ?? fallback}
      onChange={(e) => onChange(Number(e.target.value))}
      className="w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-900"
    />
  );
}
