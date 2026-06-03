"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Clock, Loader2, Save, Trash2 } from "lucide-react";
import { EmployeeSummaryMonthPicker } from "@/components/EmployeeSummaryMonthPicker";
import { formatHoursMinutes } from "@/lib/attendanceSummaryMetrics";

interface TeamMemberRow {
  _id: string;
  name: string;
  odId: string;
  employeeCode: string;
  rawExcessHour: number;
  allowedExcessHours: number | null;
  displayExcessHour: number;
}

interface ManageExcessHourAllowanceSectionProps {
  viewerUserId: string;
}

function formatSignedExcess(val: number): string {
  const sign = val > 0 ? "+" : val < 0 ? "−" : "";
  return `${sign}${formatHoursMinutes(Math.abs(val))}`;
}

export function ManageExcessHourAllowanceSection({
  viewerUserId,
}: ManageExcessHourAllowanceSectionProps) {
  const [monthYear, setMonthYear] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [members, setMembers] = useState<TeamMemberRow[]>([]);
  const [draftCaps, setDraftCaps] = useState<Record<string, string>>({});
  const [searchTerm, setSearchTerm] = useState("");

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
      const drafts: Record<string, string> = {};
      rows.forEach((row) => {
        drafts[row._id] =
          row.allowedExcessHours != null ? String(row.allowedExcessHours) : "";
      });
      setDraftCaps(drafts);
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

  const saveCap = async (employeeId: string) => {
    const raw = draftCaps[employeeId]?.trim();
    setSavingId(employeeId);
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
          ...(raw === ""
            ? { clear: true }
            : { allowedExcessHours: Number(raw) }),
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || "Failed to save");
      }
      setMessage(`Saved allowance for ${members.find((m) => m._id === employeeId)?.name || "employee"}.`);
      await fetchData();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSavingId(null);
    }
  };

  const clearCap = async (employeeId: string) => {
    setSavingId(employeeId);
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
          clear: true,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || "Failed to clear");
      }
      setMessage("Allowance cleared — full calculated excess applies.");
      await fetchData();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to clear");
    } finally {
      setSavingId(null);
    }
  };

  return (
    <section className="rounded-xl border border-border bg-surface shadow-[inset_0_0_0_1px_rgba(147,197,253,0.18)]">
      <header className="border-b border-border bg-background/60 px-4 py-4 sm:px-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold tracking-tight text-foreground">
              Allowed excess hours
            </h2>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
              Set the maximum positive excess hours counted for your team each month.
              If unset, the full calculated excess is used everywhere.
            </p>
          </div>
          <EmployeeSummaryMonthPicker
            monthYear={monthYear}
            onMonthYearChange={setMonthYear}
            disabled={loading || savingId !== null}
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
            No team members found for this month.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="border-b border-border bg-background/80 text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-3 py-2.5">Employee</th>
                  <th className="px-3 py-2.5 text-right">Calculated excess</th>
                  <th className="px-3 py-2.5 text-right">Allowed cap (hrs)</th>
                  <th className="px-3 py-2.5 text-right">Counts as</th>
                  <th className="px-3 py-2.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredMembers.map((member) => {
                  const draft = draftCaps[member._id] ?? "";
                  const draftNum = draft === "" ? null : Number(draft);
                  const previewCountsAs =
                    member.rawExcessHour <= 0
                      ? member.rawExcessHour
                      : draftNum != null && Number.isFinite(draftNum)
                        ? Math.min(member.rawExcessHour, Math.max(0, draftNum))
                        : member.rawExcessHour;

                  return (
                    <tr key={member._id} className="border-b border-border/70">
                      <td className="px-3 py-3">
                        <div className="font-medium text-foreground">{member.name}</div>
                        <div className="text-xs text-muted-foreground">{member.odId || member.employeeCode}</div>
                      </td>
                      <td className="px-3 py-3 text-right font-mono tabular-nums text-foreground">
                        {formatSignedExcess(member.rawExcessHour)}
                      </td>
                      <td className="px-3 py-3 text-right">
                        <input
                          type="number"
                          min={0}
                          step={0.25}
                          value={draft}
                          onChange={(e) =>
                            setDraftCaps((prev) => ({ ...prev, [member._id]: e.target.value }))
                          }
                          placeholder="No cap"
                          className="w-28 rounded-md border border-border bg-background px-2 py-1.5 text-right font-mono text-sm"
                        />
                      </td>
                      <td className="px-3 py-3 text-right font-mono tabular-nums text-emerald-700">
                        {formatSignedExcess(previewCountsAs)}
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex justify-end gap-1.5">
                          <button
                            type="button"
                            disabled={savingId === member._id}
                            onClick={() => void saveCap(member._id)}
                            className="inline-flex items-center gap-1 rounded-md bg-emerald-700 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-emerald-600 disabled:opacity-50"
                          >
                            {savingId === member._id ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                            ) : (
                              <Save className="h-3.5 w-3.5" aria-hidden />
                            )}
                            Save
                          </button>
                          {member.allowedExcessHours != null && (
                            <button
                              type="button"
                              disabled={savingId === member._id}
                              onClick={() => void clearCap(member._id)}
                              className="inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1.5 text-xs font-medium text-muted-foreground hover:bg-surface disabled:opacity-50"
                              title="Remove cap"
                            >
                              <Trash2 className="h-3.5 w-3.5" aria-hidden />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <p className="flex items-start gap-2 text-xs text-muted-foreground">
          <Clock className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
          Caps apply only to positive excess. Deficit hours are not changed. The
          &quot;Counts as&quot; value is what appears in summary tables and exports.
        </p>
      </div>
    </section>
  );
}
