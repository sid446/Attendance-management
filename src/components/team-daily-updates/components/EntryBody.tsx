"use client";

import { formatDailyUpdateRangeLabel, type TeamDailyUpdateRangeEntry } from "@/lib/teamDailyUpdates";
import { statusBadgeClass, statusBadgeLabel } from '../utils/teamDailyUpdatesUtils';

export function EntryBody({
  entry,
  showDates,
}: {
  entry: TeamDailyUpdateRangeEntry;
  showDates: boolean;
}) {
  return (
    <>
      <div className="min-w-0 flex-1">
        <div className="font-medium text-foreground">{entry.name}</div>
        <div className="text-xs text-muted-foreground">
          {entry.odId || entry.employeeCode || "—"}
        </div>
        {showDates && (
          <div className="mt-1 text-xs font-medium text-foreground">
            {formatDailyUpdateRangeLabel(entry.dateFrom, entry.dateTo)}
          </div>
        )}
        <div className="mt-1 text-sm text-foreground">{entry.label}</div>
        {(entry.startTime || entry.endTime) && (
          <div className="mt-0.5 text-xs text-muted-foreground">
            {entry.startTime || "—"} – {entry.endTime || "—"}
          </div>
        )}
        {entry.reason && (
          <div className="mt-1 text-xs text-muted-foreground line-clamp-2">{entry.reason}</div>
        )}
      </div>
      <span
        className={`inline-flex shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${statusBadgeClass(entry)}`}
      >
        {statusBadgeLabel(entry)}
      </span>
    </>
  );
}
