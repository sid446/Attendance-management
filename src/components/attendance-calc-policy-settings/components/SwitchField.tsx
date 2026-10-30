'use client';

export function SwitchField({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex items-start gap-3 text-sm text-slate-800">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-1 rounded border-slate-300 text-blue-600 focus:ring-blue-500/40"
      />
      <span>
        <span className="font-medium">{label}</span>
        <span className="mt-0.5 block text-xs font-normal text-slate-500">{hint}</span>
      </span>
    </label>
  );
}
