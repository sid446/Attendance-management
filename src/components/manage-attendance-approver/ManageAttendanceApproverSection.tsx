"use client";

import { Loader2, Save, UserCog, Users } from "lucide-react";
import type { ManageAttendanceApproverSectionProps } from './types';
import { findOptionByLoginEmail, displayLoginEmail } from './utils';
import { useManageAttendanceApproverSectionLogic } from './hooks';

export function ManageAttendanceApproverSection({
  viewerUserId,
}: ManageAttendanceApproverSectionProps) {
  const {
    loading,
    savingId,
    error,
    message,
    members,
    groups,
    approverPickList,
    draftEmails,
    setDraftEmails,
    searchTerm,
    setSearchTerm,
    filteredMembers,
    pickListByLoginEmail,
    handleSelectApprover,
    handleSave,
  } = useManageAttendanceApproverSectionLogic({ viewerUserId });

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 rounded-xl border border-border bg-surface px-4 py-12 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
        Loading attendance approvers…
      </div>
    );
  }

  if (members.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-surface px-4 py-12 text-center text-sm text-muted-foreground">
        No employees work under you as partner. This section is for people whose{" "}
        <strong className="text-foreground">Work Partner</strong> is your name.
      </div>
    );
  }

  return (
    <section className="space-y-6">
      <div>
        <div className="flex items-center gap-2">
          <UserCog className="h-5 w-5 text-muted-foreground" aria-hidden />
          <h2 className="text-lg font-semibold text-foreground">Manage attendance approver</h2>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          Attendance email must be the approver&apos;s login email (e.g. Tanya&apos;s
          attendance email <strong className="font-normal">anand@asija.in</strong> matches the
          user whose <strong className="font-normal">Email</strong> is anand@asija.in).
        </p>
      </div>

      {error && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          {error}
        </div>
      )}
      {message && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          {message}
        </div>
      )}

      <div className="rounded-xl border border-border bg-surface p-4 sm:p-5">
        <div className="mb-4 flex items-center gap-2">
          <Users className="h-4 w-4 text-muted-foreground" aria-hidden />
          <h3 className="text-sm font-semibold text-foreground">By approver</h3>
        </div>
        <div className="space-y-3">
          {groups.map((group) => (
            <div
              key={`${group.approverUserId || "unknown"}-${group.approverEmail}`}
              className="rounded-lg border border-border bg-background p-3"
            >
              <div className="mb-2">
                <p className="text-sm font-medium text-foreground">{group.approverName}</p>
                <p className="font-mono text-[11px] text-muted-foreground">{group.approverEmail}</p>
                {!group.approverUserId && (
                  <p className="mt-1 text-[11px] text-amber-700">
                    No employee found with login email {group.approverEmail}.
                  </p>
                )}
              </div>
              <ul className="flex flex-wrap gap-2">
                {group.members.map((member) => (
                  <li
                    key={member._id}
                    className="rounded-full border border-border bg-surface px-2.5 py-1 text-xs text-foreground"
                  >
                    {member.name}
                    {member.odId ? ` (${member.odId})` : ""}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-xl border border-border bg-surface p-4 sm:p-5">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h3 className="text-sm font-semibold text-foreground">Edit approver</h3>
            <p className="mt-1 text-xs text-muted-foreground">
              Pick an approver — their login email is saved as this employee&apos;s attendance email.
            </p>
          </div>
          <input
            type="search"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search team member…"
            className="w-full max-w-xs rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground"
          />
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-2 py-2 font-medium">Employee</th>
                <th className="px-2 py-2 font-medium">Current approver</th>
                <th className="px-2 py-2 font-medium">Assign approver</th>
                <th className="px-2 py-2 font-medium">Attendance email</th>
                <th className="px-2 py-2 font-medium" />
              </tr>
            </thead>
            <tbody>
              {filteredMembers.map((member) => {
                const draft = draftEmails[member._id] ?? member.attendanceEmail;
                const resolved = pickListByLoginEmail.get(draft.toLowerCase());
                const selectedId = findOptionByLoginEmail(approverPickList, draft)?._id || "";
                const dirty = draft.trim() !== (member.attendanceEmail || "").trim();

                const approverLabel =
                  member.resolvedApprover?.userId && member.resolvedApprover.name
                    ? member.resolvedApprover.name
                    : resolved?.name;

                return (
                  <tr key={member._id} className="border-b border-border/70 align-top">
                    <td className="px-2 py-3">
                      <p className="font-medium text-foreground">{member.name}</p>
                      <p className="font-mono text-[11px] text-muted-foreground">
                        {member.employeeCode || member.odId || member.email}
                      </p>
                    </td>
                    <td className="px-2 py-3 text-muted-foreground">
                      {approverLabel ? (
                        <>
                          <p className="text-foreground">{approverLabel}</p>
                          <p className="font-mono text-[11px]">{draft}</p>
                        </>
                      ) : (
                        <p className="font-mono text-[11px]">{member.attendanceEmail || "—"}</p>
                      )}
                    </td>
                    <td className="px-2 py-3">
                      <select
                        value={selectedId}
                        onChange={(e) => handleSelectApprover(member._id, e.target.value)}
                        className="w-full min-w-[180px] rounded-lg border border-border bg-background px-2 py-1.5 text-sm text-foreground"
                      >
                        <option value="">Select employee…</option>
                        {approverPickList.map((option) => (
                          <option key={option._id} value={option._id}>
                            {option.name} ({displayLoginEmail(option)})
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-2 py-3">
                      <input
                        type="email"
                        value={draft}
                        onChange={(e) =>
                          setDraftEmails((prev) => ({
                            ...prev,
                            [member._id]: e.target.value,
                          }))
                        }
                        className="w-full min-w-[200px] rounded-lg border border-border bg-background px-2 py-1.5 text-sm text-foreground"
                      />
                    </td>
                    <td className="px-2 py-3">
                      <button
                        type="button"
                        disabled={!dirty || savingId === member._id}
                        onClick={() => void handleSave(member)}
                        className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-2.5 py-1.5 text-xs font-medium text-foreground hover:bg-surface/70 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {savingId === member._id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                        ) : (
                          <Save className="h-3.5 w-3.5" aria-hidden />
                        )}
                        Save
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
