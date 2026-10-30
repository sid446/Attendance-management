"use client";

import { ChevronDown, ChevronRight, Clock, Download, History, Loader2, RotateCcw } from "lucide-react";
import { EmployeeSummaryMonthPicker } from "@/components/employee-summary-month-picker";
import { formatHoursMinutes, parseHoursMinutes, parseSignedHoursMinutes } from "@/lib/attendanceSummaryMetrics";
import type { ManageExcessHourAllowanceSectionProps } from './types';
import { formatSignedExcess, formatDateLabel, allowanceClass, allowanceLabel, formatChangeSummary, formatChangeTimestamp } from './utils';
import { PresenceInfo } from './components';
import { useManageExcessHourAllowanceSectionLogic } from './hooks';

export function ManageExcessHourAllowanceSection({
  viewerUserId,
}: ManageExcessHourAllowanceSectionProps) {
  const {
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
  } = useManageExcessHourAllowanceSectionLogic({ viewerUserId });

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
              attendance approver. All days in the month are listed and can be edited. For days
              with calculated excess or deficit, set how many hours count (0 up to that day&apos;s
              amount). On zero days, enter a manual + or − value. Reset restores the default.
            </p>
          </div>
          <EmployeeSummaryMonthPicker
            monthYear={monthYear}
            onMonthYearChange={setMonthYear}
            disabled={loading || savingKey !== null || exporting}
          />
          {!loading && filteredMembers.length > 0 && (
            <button
              type="button"
              disabled={exporting || savingKey !== null}
              onClick={() => void handleExport(filteredMembers)}
              className="inline-flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-sm font-medium text-foreground hover:bg-surface disabled:opacity-50"
            >
              {exporting ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              ) : (
                <Download className="h-4 w-4" aria-hidden />
              )}
              Export all
            </button>
          )}
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
                      <div className="mb-3 flex justify-end">
                        <button
                          type="button"
                          disabled={exporting || savingKey !== null}
                          onClick={() => void handleExport([member])}
                          className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-2.5 py-1.5 text-xs font-medium text-foreground hover:bg-surface disabled:opacity-50"
                        >
                          {exporting ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                          ) : (
                            <Download className="h-3.5 w-3.5" aria-hidden />
                          )}
                          Export sheet
                        </button>
                      </div>
                      <div className="overflow-x-auto rounded-lg border border-border">
                        <table className="w-full min-w-[1020px] text-left text-sm">
                          <thead className="border-b border-border bg-background/80 text-xs uppercase tracking-wide text-muted-foreground">
                            <tr>
                              <th className="px-3 py-2.5">Date</th>
                              <th className="px-3 py-2.5">Presence</th>
                              <th className="px-3 py-2.5">In</th>
                              <th className="px-3 py-2.5">Out</th>
                              <th className="px-3 py-2.5 text-right">Day excess</th>
                              <th className="px-3 py-2.5">Allowance</th>
                              <th className="px-3 py-2.5 text-right">Counts as</th>
                              <th className="px-3 py-2.5">Remarks</th>
                              <th className="px-3 py-2.5 text-right">Set allowed</th>
                            </tr>
                          </thead>
                          <tbody>
                            {member.days.map((day) => {
                              const rowKey = `${member._id}:${day.date}`;
                              const saving = savingKey === rowKey;
                              const isZeroDay = day.rawExcessHour === 0;
                              const draftValue = getDraftValue(member._id, day);
                              const remarkValue = getDraftRemark(member._id, day);
                              const parsedDraft = isZeroDay
                                ? parseSignedHoursMinutes(draftValue)
                                : parseHoursMinutes(draftValue);
                              const maxAllowance = Math.abs(day.rawExcessHour);

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
                                    <td className="px-3 py-2.5 font-mono text-xs tabular-nums text-foreground">
                                      {day.checkIn || "—"}
                                    </td>
                                    <td className="px-3 py-2.5 font-mono text-xs tabular-nums text-foreground">
                                      {day.checkOut || "—"}
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
                                      <div className="flex min-w-[180px] items-start gap-1">
                                        <input
                                          type="text"
                                          value={remarkValue}
                                          disabled={saving}
                                          onChange={(e) =>
                                            setDraftRemarkValue(member._id, day.date, e.target.value)
                                          }
                                          maxLength={500}
                                          className="min-w-0 flex-1 rounded-md border border-border bg-background px-2 py-1 text-xs text-foreground"
                                          placeholder="Add remark…"
                                          aria-label={`Remark for ${day.date}`}
                                        />
                                        <button
                                          type="button"
                                          disabled={saving}
                                          onClick={() =>
                                            void setDayAllowance(member._id, day.date, null, {
                                              remarkOnly: true,
                                              remark: remarkValue,
                                            })
                                          }
                                          className="shrink-0 rounded-md border border-border px-2 py-1 text-[10px] font-medium text-muted-foreground hover:bg-surface disabled:opacity-50"
                                          title="Save remark"
                                        >
                                          {saving ? (
                                            <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
                                          ) : (
                                            "Save"
                                          )}
                                        </button>
                                      </div>
                                    </td>
                                    <td className="px-3 py-2.5">
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
                                          placeholder={isZeroDay ? "0:00" : formatHoursMinutes(maxAllowance)}
                                          title={
                                            isZeroDay
                                              ? "Hours to count (+ or − H:MM, e.g. 1:30 or -0:45)"
                                              : `Hours to count, H:MM (max ${formatHoursMinutes(maxAllowance)})`
                                          }
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
                                              isZeroDay
                                                ? parsedDraft
                                                : Math.min(maxAllowance, parsedDraft),
                                              { remark: remarkValue }
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
                                          title="Set counts-as to 0"
                                        >
                                          0
                                        </button>
                                        {!isZeroDay && (
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
                                            title="Count full day excess/deficit"
                                          >
                                            Full
                                          </button>
                                        )}
                                        {day.allowedExcessHours != null && (
                                          <button
                                            type="button"
                                            disabled={saving}
                                            onClick={() =>
                                              void setDayAllowance(member._id, day.date, "clear")
                                            }
                                            className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs font-medium text-muted-foreground hover:bg-surface disabled:opacity-50"
                                            title="Restore default"
                                          >
                                            <RotateCcw className="h-3 w-3" aria-hidden />
                                            Reset
                                          </button>
                                        )}
                                      </div>
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                            <tfoot className="border-t border-border bg-background/60">
                              <tr>
                                <td className="px-3 py-2.5 font-medium text-foreground" colSpan={5}>
                                  Month total
                                </td>
                                <td className="px-3 py-2.5" />
                                <td className="px-3 py-2.5 text-right font-mono tabular-nums font-semibold text-emerald-700">
                                  {formatSignedExcess(member.displayExcessHour)}
                                </td>
                                <td className="px-3 py-2.5" />
                                <td className="px-3 py-2.5 text-right text-xs text-muted-foreground">
                                  raw {formatSignedExcess(member.rawExcessHour)}
                                </td>
                              </tr>
                            </tfoot>
                          </table>
                        </div>

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
          All calendar days are shown and editable. For calculated excess/deficit, enter how many
          hours count as H:MM (0 up to that day&apos;s amount). On zero days, use + or − H:MM for a
          manual value. Use 0 / Full shortcuts where applicable, or Reset to clear your change.
        </p>
      </div>
    </section>
  );
}
