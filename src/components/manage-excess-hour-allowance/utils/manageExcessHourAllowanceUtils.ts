import { formatHoursMinutes } from "@/lib/attendanceSummaryMetrics";
import type { DailyExcessApprovalRow } from "@/lib/excessHourAllowance";
import type { ExcessDayChangeLogEntry } from '../types';

export function formatSignedExcess(val: number): string {
  const sign = val > 0 ? "+" : val < 0 ? "−" : "";
  return `${sign}${formatHoursMinutes(Math.abs(val))}`;
}

export function formatDateLabel(date: string): string {
  const d = new Date(`${date}T12:00:00`);
  if (Number.isNaN(d.getTime())) return date;
  return d.toLocaleDateString("en-IN", {
    weekday: "short",
    day: "2-digit",
    month: "short",
  });
}

export function formatAllowanceValue(val: number | null): string {
  if (val == null) return "Default (full excess)";
  return formatHoursMinutes(val);
}

export function formatChangeTimestamp(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatChangeSummary(entry: ExcessDayChangeLogEntry): string {
  return `${formatAllowanceValue(entry.oldAllowedExcessHours)} → ${formatAllowanceValue(entry.newAllowedExcessHours)}`;
}

export function formatPresenceLabel(typeOfPresence?: string): string {
  const label = String(typeOfPresence || "").trim();
  return label || "—";
}

export function allowanceLabel(day: DailyExcessApprovalRow): string {
  const absRaw = Math.abs(day.rawExcessHour);
  if (day.rawExcessHour === 0) {
    if (day.allowedExcessHours == null) return "Default (0:00)";
    return `Manual (${formatSignedExcess(day.allowedExcessHours)})`;
  }
  if (day.rawExcessHour < 0) {
    if (day.allowedExcessHours == null) return `Default (${formatSignedExcess(day.rawExcessHour)})`;
    if (day.allowedExcessHours === 0) return "None counted (0:00)";
    if (day.allowedExcessHours >= absRaw) return `Full (${formatSignedExcess(day.rawExcessHour)})`;
    return `Count ${formatHoursMinutes(day.allowedExcessHours)} of ${formatHoursMinutes(absRaw)} deficit`;
  }
  if (day.allowedExcessHours == null) return `Default (${formatSignedExcess(day.rawExcessHour)})`;
  if (day.allowedExcessHours === 0) return "None allowed (0:00)";
  if (day.allowedExcessHours >= day.rawExcessHour) {
    return `Full (${formatSignedExcess(day.rawExcessHour)})`;
  }
  return `Allowed ${formatHoursMinutes(day.allowedExcessHours)} of ${formatHoursMinutes(day.rawExcessHour)}`;
}

export function allowanceClass(day: DailyExcessApprovalRow): string {
  const absRaw = Math.abs(day.rawExcessHour);
  if (day.rawExcessHour === 0) {
    if (day.allowedExcessHours == null) return "text-muted-foreground bg-background border-border";
    if (day.allowedExcessHours === 0) return "text-muted-foreground bg-background border-border";
    return day.allowedExcessHours > 0
      ? "text-emerald-700 bg-emerald-950/20 border-emerald-500/30"
      : "text-sky-700 bg-sky-950/20 border-sky-500/20";
  }
  if (day.allowedExcessHours == null) {
    return day.rawExcessHour < 0
      ? "text-sky-700 bg-sky-950/20 border-sky-500/20"
      : "text-muted-foreground bg-background border-border";
  }
  if (day.allowedExcessHours === 0) return "text-rose-700 bg-rose-950/20 border-rose-500/30";
  if (day.allowedExcessHours >= absRaw) {
    return "text-emerald-700 bg-emerald-950/20 border-emerald-500/30";
  }
  return "text-amber-700 bg-amber-950/20 border-amber-500/30";
}
