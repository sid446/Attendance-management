import { CalendarDays, Plane, Home, Clock, ClipboardList, UserRound } from "lucide-react";
import { istDateString } from "@/lib/attendanceRequestWindow";
import { DAILY_UPDATE_GROUP_META, formatDailyUpdateRangeLabel, shiftIstYyyyMmDd, type TeamDailyUpdateCategory, type TeamDailyUpdateEntry } from "@/lib/teamDailyUpdates";

export function istWeekdayIndex(date: string): number {
  const label = new Date(`${date}T12:00:00+05:30`).toLocaleDateString("en-US", {
    weekday: "short",
    timeZone: "Asia/Kolkata",
  });
  const order = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const idx = order.indexOf(label);
  return idx >= 0 ? idx : 0;
}

export function startOfIstWeek(date: string): string {
  const weekday = istWeekdayIndex(date);
  const mondayOffset = weekday === 0 ? -6 : 1 - weekday;
  return shiftIstYyyyMmDd(date, mondayOffset);
}

export function formatDateHeading(from: string, to: string): string {
  const today = istDateString();
  if (from === to) {
    const yesterday = shiftIstYyyyMmDd(today, -1);
    const tomorrow = shiftIstYyyyMmDd(today, 1);
    const formatted = formatDailyUpdateRangeLabel(from, to);
    if (from === today) return `Today · ${formatted}`;
    if (from === yesterday) return `Yesterday · ${formatted}`;
    if (from === tomorrow) return `Tomorrow · ${formatted}`;
    return formatted;
  }
  return formatDailyUpdateRangeLabel(from, to);
}

export function groupIcon(category: TeamDailyUpdateCategory) {
  switch (category) {
    case "leave":
      return UserRound;
    case "wfh":
      return Home;
    case "outstation":
      return Plane;
    case "half_day":
      return Clock;
    case "pending":
    case "pending_hr":
      return ClipboardList;
    default:
      return CalendarDays;
  }
}

/** Matches ManageExcessHourAllowanceSection badge tones. */
export function groupPanelClass(tone: (typeof DAILY_UPDATE_GROUP_META)[TeamDailyUpdateCategory]["tone"]) {
  switch (tone) {
    case "rose":
      return "border-rose-500/30 bg-rose-950/20";
    case "sky":
      return "border-sky-500/30 bg-sky-950/20";
    case "violet":
      return "border-violet-500/30 bg-violet-950/20";
    case "amber":
      return "border-amber-500/30 bg-amber-950/20";
    case "emerald":
      return "border-emerald-500/30 bg-emerald-950/20";
    default:
      return "border-border bg-background/40";
  }
}

export function groupTitleClass(tone: (typeof DAILY_UPDATE_GROUP_META)[TeamDailyUpdateCategory]["tone"]) {
  switch (tone) {
    case "rose":
      return "text-rose-700";
    case "sky":
      return "text-sky-700";
    case "violet":
      return "text-violet-700";
    case "amber":
      return "text-amber-700";
    case "emerald":
      return "text-emerald-700";
    default:
      return "text-foreground";
  }
}

export function summaryChipClass(kind: "leave" | "away" | "pending") {
  switch (kind) {
    case "leave":
      return "border-rose-500/30 bg-rose-950/20 text-rose-700";
    case "away":
      return "border-sky-500/30 bg-sky-950/20 text-sky-700";
    case "pending":
      return "border-amber-500/30 bg-amber-950/20 text-amber-700";
  }
}

export function statusBadgeClass(entry: TeamDailyUpdateEntry): string {
  if (entry.requestStatus === "Pending") {
    return "text-amber-700 bg-amber-950/20 border-amber-500/30";
  }
  if (entry.requestStatus === "PendingHr") {
    return "text-muted-foreground bg-background border-border";
  }
  if (entry.source === "attendance") {
    return "text-muted-foreground bg-background border-border";
  }
  return "text-emerald-700 bg-emerald-950/20 border-emerald-500/30";
}

export function statusBadgeLabel(entry: TeamDailyUpdateEntry): string {
  if (entry.requestStatus === "Pending") return "Pending";
  if (entry.requestStatus === "PendingHr") return "HR pending";
  if (entry.source === "attendance") return "In records";
  return entry.approvedBy ? `By ${entry.approvedBy}` : "Approved";
}
