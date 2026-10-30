import type { EmployeeAttendanceRequest } from "@/types/employeeAttendanceRequest";

export function formatRequestDate(dateStr: string): string {
  const iso = dateStr.split("T")[0];
  const d = new Date(iso + "T12:00:00");
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-IN", {
    weekday: "long",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function pendingStatusLabel(status: EmployeeAttendanceRequest["status"]): string {
  if (status === "PendingHr") return "Waiting for HR";
  if (status === "Pending") return "Waiting for partner";
  return status;
}

export function formatMonthLabel(monthYear: string): string {
  const [ys, ms] = monthYear.split("-");
  const y = parseInt(ys, 10);
  const m = parseInt(ms, 10);
  if (!y || !m) return "";
  return new Date(y, m - 1, 1).toLocaleDateString("en-IN", {
    month: "long",
    year: "numeric",
  });
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
