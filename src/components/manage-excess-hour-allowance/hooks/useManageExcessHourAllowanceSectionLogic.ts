"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { formatHoursMinutes } from "@/lib/attendanceSummaryMetrics";
import type { DailyExcessApprovalRow } from "@/lib/excessHourAllowance";
import { exportExcessHourSheet } from "@/components/summary/exports/excessHourExport";
import type { TeamMemberRow, ManageExcessHourAllowanceSectionProps } from '../types';

export function useManageExcessHourAllowanceSectionLogic({ viewerUserId }: ManageExcessHourAllowanceSectionProps) {
  const [monthYear, setMonthYear] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [members, setMembers] = useState<TeamMemberRow[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [draftAllowance, setDraftAllowance] = useState<Record<string, string>>({});
  const [draftRemark, setDraftRemark] = useState<Record<string, string>>({});
  const [exporting, setExporting] = useState(false);

  const fetchData = useCallback(async () => {
    if (!viewerUserId || !monthYear) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/employee/team-excess-hour-allowance?viewerUserId=${encodeURIComponent(viewerUserId)}&monthYear=${encodeURIComponent(monthYear)}`,
        { cache: "no-store" }
      );
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || "Failed to load excess hour settings");
      }
      const rows: TeamMemberRow[] = Array.isArray(json.data?.members) ? json.data.members : [];
      setMembers(rows);
      setExpandedId((prev) => (prev && !rows.some((row) => row._id === prev) ? null : prev));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
      setMembers([]);
    } finally {
      setLoading(false);
    }
  }, [viewerUserId, monthYear]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  const filteredMembers = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    if (!term) return members;
    return members.filter(
      (m) =>
        m.name.toLowerCase().includes(term) ||
        m.odId.toLowerCase().includes(term) ||
        m.employeeCode.toLowerCase().includes(term)
    );
  }, [members, searchTerm]);

  const getDraftValue = (employeeId: string, day: DailyExcessApprovalRow): string => {
    const key = `${employeeId}:${day.date}`;
    if (Object.prototype.hasOwnProperty.call(draftAllowance, key)) {
      return draftAllowance[key];
    }
    if (day.allowedExcessHours != null) {
      return formatHoursMinutes(day.allowedExcessHours);
    }
    if (day.rawExcessHour !== 0) {
      return formatHoursMinutes(Math.abs(day.rawExcessHour));
    }
    return formatHoursMinutes(0);
  };

  const setDraftValue = (employeeId: string, date: string, value: string) => {
    const key = `${employeeId}:${date}`;
    setDraftAllowance((prev) => ({ ...prev, [key]: value }));
  };

  const getDraftRemark = (employeeId: string, day: DailyExcessApprovalRow): string => {
    const key = `${employeeId}:${day.date}`;
    if (Object.prototype.hasOwnProperty.call(draftRemark, key)) {
      return draftRemark[key];
    }
    return day.remark || "";
  };

  const setDraftRemarkValue = (employeeId: string, date: string, value: string) => {
    const key = `${employeeId}:${date}`;
    setDraftRemark((prev) => ({ ...prev, [key]: value }));
  };

  const setDayAllowance = async (
    employeeId: string,
    date: string,
    allowedExcessHours: number | "clear" | null,
    options?: { remark?: string; remarkOnly?: boolean }
  ) => {
    const key = `${employeeId}:${date}`;
    setSavingKey(key);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch("/api/employee/team-excess-hour-allowance", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          viewerUserId,
          employeeId,
          monthYear,
          date,
          ...(options?.remarkOnly
            ? { remarkOnly: true, remark: options.remark ?? "" }
            : allowedExcessHours === "clear"
              ? { clear: true }
              : {
                  allowedExcessHours,
                  ...(options?.remark !== undefined ? { remark: options.remark } : {}),
                }),
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || "Failed to update allowance");
      }
      setMessage(
        options?.remarkOnly
          ? "Remark saved."
          : allowedExcessHours === "clear"
            ? "Day restored to default (full excess counts)."
            : `Allowed ${formatHoursMinutes(allowedExcessHours as number)} for that day.`
      );
      setDraftAllowance((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
      setDraftRemark((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
      await fetchData();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update");
    } finally {
      setSavingKey(null);
    }
  };

  const handleExport = async (targetMembers: TeamMemberRow[]) => {
    if (targetMembers.length === 0) return;
    setExporting(true);
    setError(null);
    try {
      await exportExcessHourSheet(
        targetMembers.map((m) => ({
          _id: m._id,
          name: m.name,
          employeeCode: m.employeeCode,
          odId: m.odId,
          days: m.days,
        })),
        monthYear
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Export failed");
    } finally {
      setExporting(false);
    }
  };

  return {
    monthYear,
    setMonthYear,
    loading,
    savingKey,
    error,
    message,
    searchTerm,
    setSearchTerm,
    expandedId,
    setExpandedId,
    exporting,
    filteredMembers,
    getDraftValue,
    setDraftValue,
    getDraftRemark,
    setDraftRemarkValue,
    setDayAllowance,
    handleExport,
  } as const;
}
