import React, { useState, useEffect, useRef } from 'react';
import { formatLeaveValue } from '../utils/leaveManagementUtils';

/** Editable Adj this month — saves on blur, Enter, or Save button. */
export const LeaveAdjLwpInput: React.FC<{
  userId: string;
  value: number;
  disabled?: boolean;
  onSave: (userId: string, leaveAdjLwp: number) => Promise<void>;
}> = ({ userId, value, disabled, onSave }) => {
  const [draft, setDraft] = useState(formatLeaveValue(value));
  const [dirty, setDirty] = useState(false);
  const [localSaving, setLocalSaving] = useState(false);
  const lastSaved = useRef(formatLeaveValue(value));

  useEffect(() => {
    if (localSaving || dirty) return;
    const formatted = formatLeaveValue(value);
    setDraft(formatted);
    lastSaved.current = formatted;
  }, [value, localSaving, dirty]);

  const commitValue = async (raw: string) => {
    const next = Number(String(raw).trim());
    if (!Number.isFinite(next)) {
      setDraft(lastSaved.current);
      setDirty(false);
      return;
    }
    const rounded = Number(next.toFixed(3));
    const formatted = formatLeaveValue(rounded);
    if (formatted === lastSaved.current) {
      setDraft(formatted);
      setDirty(false);
      return;
    }

    setDraft(formatted);
    setLocalSaving(true);
    try {
      await onSave(userId, rounded);
      lastSaved.current = formatted;
      setDirty(false);
    } catch {
      setDraft(lastSaved.current);
      setDirty(false);
    } finally {
      setLocalSaving(false);
    }
  };

  return (
    <div className="inline-flex items-center justify-center gap-1">
      <input
        type="text"
        inputMode="decimal"
        value={draft}
        disabled={disabled || localSaving}
        onChange={(e) => {
          setDraft(e.target.value);
          setDirty(true);
        }}
        onBlur={(e) => {
          if (!dirty) return;
          void commitValue(e.target.value);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            void commitValue((e.target as HTMLInputElement).value);
          }
          if (e.key === 'Escape') {
            setDraft(lastSaved.current);
            setDirty(false);
            e.currentTarget.blur();
          }
        }}
        aria-label="Adj this month"
        title="Adj this month — change for the selected month. Enter or Save to persist."
        className="w-20 rounded-md border border-violet-200 bg-violet-50 px-2 py-1 text-center text-xs font-medium tabular-nums text-violet-950 shadow-sm outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20 disabled:opacity-50"
      />
      <button
        type="button"
        disabled={disabled || localSaving || !dirty}
        onClick={() => void commitValue(draft)}
        className="rounded-md border border-violet-300 bg-violet-600 px-1.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-white hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-40"
        title="Save Adj this month"
      >
        {localSaving ? '…' : 'Save'}
      </button>
    </div>
  );
};
