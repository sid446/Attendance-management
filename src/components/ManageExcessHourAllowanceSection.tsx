"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Clock, History, Loader2, RotateCcw } from "lucide-react";
import { EmployeeSummaryMonthPicker } from "@/components/EmployeeSummaryMonthPicker";
import { formatHoursMinutes, parseHoursMinutes } from "@/lib/attendanceSummaryMetrics";
import type { DailyExcessApprovalRow } from "@/lib/excessHourAllowance";

interface ExcessDayChangeLogEntry {
  date: string;
  oldAllowedExcessHours: number | null;
  newAllowedExcessHours: number | null;
  changedByEmail: string;
  changedAt: string;
  typeOfPresence: string;
  missedEntry: boolean;
}

interface TeamMemberRow {
  _id: string;
  name: string;
  odId: string;
  employeeCode: string;
  rawExcessHour: number;
  displayExcessHour: number;
  adjustedPositiveDays: number;
  partnerAdjusted: boolean;
  days: DailyExcessApprovalRow[];
  changeLogs: ExcessDayChangeLogEntry[];
}

interface ManageExcessHourAllowanceSectionProps {
  viewerUserId: string;
}

function formatSignedExcess(val: number): string {
  const sign = val > 0 ? "+" : val < 0 ? "−" : "";
  return `${sign}${formatHoursMinutes(Math.abs(val))}`;
}

function formatDateLabel(date: string): string {
  const d = new Date(`${date}T12:00:00`);
  if (Number.isNaN(d.getTime())) return date;
  return d.toLocaleDateString("en-IN", {
    weekday: "short",
    day: "2-digit",
    month: "short",
  });
}

function formatAllowanceValue(val: number | null): string {
  if (val == null) return "Default (full excess)";
  return formatHoursMinutes(val);
}

function formatChangeTimestamp(iso: string): string {
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

function formatChangeSummary(entry: ExcessDayChangeLogEntry): string {
  return `${formatAllowanceValue(entry.oldAllowedExcessHours)} → ${formatAllowanceValue(entry.newAllowedExcessHours)}`;
}

function formatPresenceLabel(typeOfPresence?: string): string {
  const label = String(typeOfPresence || "").trim();
  return label || "—";
}

function PresenceInfo({
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

function allowanceLabel(day: DailyExcessApprovalRow): string {
  if (day.rawExcessHour <= 0) return "Deficit (always counts)";
  if (day.allowedExcessHours == null) return `Default (${formatSignedExcess(day.rawExcessHour)})`;
  if (day.allowedExcessHours === 0) return "None allowed (0:00)";
  if (day.allowedExcessHours >= day.rawExcessHour) {
    return `Full (${formatSignedExcess(day.rawExcessHour)})`;
  }
  return `Allowed ${formatHoursMinutes(day.allowedExcessHours)} of ${formatHoursMinutes(day.rawExcessHour)}`;
}

function allowanceClass(day: DailyExcessApprovalRow): string {
  if (day.rawExcessHour <= 0) return "text-sky-700 bg-sky-950/20 border-sky-500/20";
  if (day.allowedExcessHours == null) return "text-muted-foreground bg-background border-border";
  if (day.allowedExcessHours === 0) return "text-rose-700 bg-rose-950/20 border-rose-500/30";
  if (day.allowedExcessHours >= day.rawExcessHour) {
    return "text-emerald-700 bg-emerald-950/20 border-emerald-500/30";
  }
  return "text-amber-700 bg-amber-950/20 border-amber-500/30";
}

export function ManageExcessHourAllowanceSection({
  viewerUserId,
}: ManageExcessHourAllowanceSectionProps) {
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
    return formatHoursMinutes(day.rawExcessHour);
  };

  const setDraftValue = (employeeId: string, date: string, value: string) => {
    const key = `${employeeId}:${date}`;
    setDraftAllowance((prev) => ({ ...prev, [key]: value }));
  };

  const setDayAllowance = async (
    employeeId: string,
    date: string,
    allowedExcessHours: number | "clear"
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
          ...(allowedExcessHours === "clear"
            ? { clear: true }
            : { allowedExcessHours }),
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || "Failed to update allowance");
      }
      setMessage(
        allowedExcessHours === "clear"
          ? "Day restored to default (full excess counts)."
          : `Allowed ${formatHoursMinutes(allowedExcessHours)} for that day.`
      );
      setDraftAllowance((prev) => {
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

  return (
    <section className="rounded-xl border border-border bg-surface shadow-[inset_0_0_0_1px_rgba(147,197,253,0.18)]">
      <header className="border-b border-border bg-background/60 px-4 py-4 sm:px-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold tracking-tight text-foreground">
              Excess hours by day
            </h2>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
              Manage excess for your work-partner team and employees who list you as their
              attendance approver. Each day&apos;s excess counts in full until you change it. Set how
              many hours to allow per day (0 to the day&apos;s excess). Reset restores the default.
              Deficit days always count. Every change is logged with your email, old value, and new
              value.
            </p>
          </div>
          <EmployeeSummaryMonthPicker
            monthYear={monthYear}
            onMonthYearChange={setMonthYear}
            disabled={loading || savingKey !== null}
          />
        </div>
      </header>

      <div className="space-y-4 p-4 sm:p-5">
        {error && (
          <div className="rounded-lg border border-rose-500/30 bg-rose-950/20 px-3 py-2 text-sm text-rose-200">
            {error}
          </div>
        )}
        {message && (
          <div className="rounded-lg border border-emerald-500/30 bg-emerald-950/20 px-3 py-2 text-sm text-emerald-200">
            {message}
          </div>
        )}

        <input
          type="text"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder="Search by name or OD ID…"
          className="w-full max-w-md rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
        />

        {loading ? (
          <div className="flex items-center gap-2 py-10 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            Loading team…
          </div>
        ) : filteredMembers.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border py-10 text-center text-sm text-muted-foreground">
            No employees in your work-partner team or attendance-approver inbox for this month.
          </p>
        ) : (
          <div className="space-y-3">
            {filteredMembers.map((member) => {
              const expanded = expandedId === member._id;
              const hasDays = member.days.length > 0;

              return (
                <div
                  key={member._id}
                  className="overflow-hidden rounded-lg border border-border bg-background/40"
                >
                  <button
                    type="button"
                    onClick={() => setExpandedId(expanded ? null : member._id)}
                    className="flex w-full items-center gap-3 px-3 py-3 text-left hover:bg-surface/60 sm:px-4"
                  >
                    {expanded ? (
                      <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                    ) : (
                      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="font-medium text-foreground">{member.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {member.odId || member.employeeCode}
                        {member.adjustedPositiveDays > 0 && (
                          <span className="ml-2 text-amber-600">
                            · {member.adjustedPositiveDays} day
                            {member.adjustedPositiveDays === 1 ? "" : "s"} adjusted
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="hidden shrink-0 text-right sm:block">
                      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                        Counts as
                      </div>
                      <div className="font-mono text-sm tabular-nums text-emerald-700">
                        {formatSignedExcess(member.displayExcessHour)}
                      </div>
                    </div>
                  </button>

                  {expanded && (
                    <div className="border-t border-border px-3 py-3 sm:px-4">
                      {!hasDays ? (
                        <p className="py-4 text-sm text-muted-foreground">
                          No excess or deficit days recorded for {monthYear}.
                        </p>
                      ) : (
                        <div className="overflow-x-auto rounded-lg border border-border">
                          <table className="w-full min-w-[860px] text-left text-sm">
                            <thead className="border-b border-border bg-background/80 text-xs uppercase tracking-wide text-muted-foreground">
                              <tr>
                                <th className="px-3 py-2.5">Date</th>
                                <th className="px-3 py-2.5">Presence</th>
                                <th className="px-3 py-2.5 text-right">Day excess</th>
                                <th className="px-3 py-2.5">Allowance</th>
                                <th className="px-3 py-2.5 text-right">Counts as</th>
                                <th className="px-3 py-2.5 text-right">Set allowed</th>
                              </tr>
                            </thead>
                            <tbody>
                              {member.days.map((day) => {
                                const rowKey = `${member._id}:${day.date}`;
                                const saving = savingKey === rowKey;
                                const canSetAllowance = day.rawExcessHour > 0;
                                const draftValue = getDraftValue(member._id, day);
                                const parsedDraft = parseHoursMinutes(draftValue);
                                const maxAllowance = day.rawExcessHour;

                                return (
                                  <tr key={day.date} className="border-b border-border/70">
                                    <td className="px-3 py-2.5 text-foreground">
                                      {formatDateLabel(day.date)}
                                      <span className="ml-2 text-xs text-muted-foreground">
                                        {day.date}
                                      </span>
                                    </td>
                                    <td className="px-3 py-2.5">
                                      <PresenceInfo
                                        typeOfPresence={day.typeOfPresence}
                                        missedEntry={day.missedEntry}
                                      />
                                    </td>
                                    <td className="px-3 py-2.5 text-right font-mono tabular-nums">
                                      {formatSignedExcess(day.rawExcessHour)}
                                    </td>
                                    <td className="px-3 py-2.5">
                                      <span
                                        className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-medium ${allowanceClass(day)}`}
                                      >
                                        {allowanceLabel(day)}
                                      </span>
                                    </td>
                                    <td className="px-3 py-2.5 text-right font-mono tabular-nums text-emerald-700">
                                      {formatSignedExcess(day.countsAs)}
                                    </td>
                                    <td className="px-3 py-2.5">
                                      {canSetAllowance ? (
                                        <div className="flex flex-wrap items-center justify-end gap-1">
                                          <input
                                            type="text"
                                            inputMode="decimal"
                                            value={draftValue}
                                            disabled={saving}
                                            onChange={(e) =>
                                              setDraftValue(member._id, day.date, e.target.value)
                                            }
                                            className="w-16 rounded-md border border-border bg-background px-2 py-1 text-right font-mono text-xs tabular-nums text-foreground"
                                            placeholder={formatHoursMinutes(maxAllowance)}
                                            title={`Hours to allow, H:MM (max ${formatHoursMinutes(maxAllowance)})`}
                                            aria-label={`Allowed hours for ${day.date}`}
                                          />
                                          <button
                                            type="button"
                                            disabled={saving || parsedDraft == null}
                                            onClick={() => {
                                              if (parsedDraft == null) return;
                                              void setDayAllowance(
                                                member._id,
                                                day.date,
                                                Math.min(maxAllowance, parsedDraft)
                                              );
                                            }}
                                            className="rounded-md bg-emerald-700 px-2 py-1 text-xs font-medium text-white hover:bg-emerald-600 disabled:opacity-50"
                                          >
                                            {saving ? (
                                              <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
                                            ) : (
                                              "Save"
                                            )}
                                          </button>
                                          <button
                                            type="button"
                                            disabled={saving}
                                            onClick={() =>
                                              setDraftValue(member._id, day.date, "0:00")
                                            }
                                            className="rounded-md border border-border px-2 py-1 text-xs font-medium text-muted-foreground hover:bg-surface disabled:opacity-50"
                                            title="Set allowed to 0"
                                          >
                                            0
                                          </button>
                                          <button
                                            type="button"
                                            disabled={saving}
                                            onClick={() =>
                                              setDraftValue(
                                                member._id,
                                                day.date,
                                                formatHoursMinutes(maxAllowance)
                                              )
                                            }
                                            className="rounded-md border border-border px-2 py-1 text-xs font-medium text-muted-foreground hover:bg-surface disabled:opacity-50"
                                            title="Allow full day excess"
                                          >
                                            Full
                                          </button>
                                          {day.allowedExcessHours != null && (
                                            <button
                                              type="button"
                                              disabled={saving}
                                              onClick={() =>
                                                void setDayAllowance(member._id, day.date, "clear")
                                              }
                                              className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs font-medium text-muted-foreground hover:bg-surface disabled:opacity-50"
                                              title="Restore default (full excess counts)"
                                            >
                                              <RotateCcw className="h-3 w-3" aria-hidden />
                                              Reset
                                            </button>
                                          )}
                                        </div>
                                      ) : (
                                        <span className="block text-right text-xs text-muted-foreground">
                                          —
                                        </span>
                                      )}
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                            <tfoot className="border-t border-border bg-background/60">
                              <tr>
                                <td className="px-3 py-2.5 font-medium text-foreground" colSpan={3}>
                                  Month total
                                </td>
                                <td className="px-3 py-2.5" />
                                <td className="px-3 py-2.5 text-right font-mono tabular-nums font-semibold text-emerald-700">
                                  {formatSignedExcess(member.displayExcessHour)}
                                </td>
                                <td className="px-3 py-2.5 text-right text-xs text-muted-foreground">
                                  raw {formatSignedExcess(member.rawExcessHour)}
                                </td>
                              </tr>
                            </tfoot>
                          </table>
                        </div>
                      )}

                      {(member.changeLogs ?? []).length > 0 && (
                        <div className="mt-4 rounded-lg border border-border bg-background/50">
                          <div className="flex items-center gap-2 border-b border-border px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                            <History className="h-3.5 w-3.5" aria-hidden />
                            Change history ({monthYear})
                          </div>
                          <ul className="divide-y divide-border/70">
                            {(member.changeLogs ?? []).map((entry, idx) => (
                              <li
                                key={`${entry.date}-${entry.changedAt}-${idx}`}
                                className="px-3 py-2.5 text-sm"
                              >
                                <div className="flex flex-col gap-1.5 sm:flex-row sm:items-start sm:justify-between">
                                  <div className="min-w-0 space-y-1">
                                    <div>
                                      <span className="font-medium text-foreground">
                                        {formatDateLabel(entry.date)}
                                      </span>
                                      <span className="ml-2 font-mono text-xs tabular-nums text-muted-foreground">
                                        {formatChangeSummary(entry)}
                                      </span>
                                    </div>
                                    <PresenceInfo
                                      typeOfPresence={entry.typeOfPresence}
                                      missedEntry={entry.missedEntry}
                                      compact
                                    />
                                  </div>
                                  <div className="shrink-0 text-xs text-muted-foreground sm:text-right">
                                    <div>{entry.changedByEmail}</div>
                                    <div>{formatChangeTimestamp(entry.changedAt)}</div>
                                  </div>
                                </div>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        <p className="flex items-start gap-2 text-xs text-muted-foreground">
          <Clock className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
          Days you have not changed keep their full calculated excess. Enter allowed time as H:MM
          (e.g. 1:30), same as elsewhere in summaries. Use 0 / Full shortcuts, or Reset to clear
          your change.
        </p>
      </div>
    </section>
  );
}
