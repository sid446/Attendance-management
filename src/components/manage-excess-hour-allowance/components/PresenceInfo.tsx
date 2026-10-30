"use client";

import { formatPresenceLabel } from '../utils/manageExcessHourAllowanceUtils';

export function PresenceInfo({
  typeOfPresence,
  missedEntry,
  compact = false,
}: {
  typeOfPresence?: string;
  missedEntry?: boolean;
  compact?: boolean;
}) {
  const label = formatPresenceLabel(typeOfPresence);
  return (
    <div className={`flex flex-wrap items-center gap-1.5 ${compact ? "" : "min-w-[140px]"}`}>
      <span
        className={`inline-flex max-w-full rounded-full border border-border bg-background px-2 py-0.5 text-xs text-foreground ${compact ? "truncate" : ""}`}
        title={label}
      >
        {label}
      </span>
      {missedEntry && (
        <span className="inline-flex rounded-full border border-amber-500/40 bg-amber-950/20 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-700">
          Missed entry
        </span>
      )}
    </div>
  );
}
