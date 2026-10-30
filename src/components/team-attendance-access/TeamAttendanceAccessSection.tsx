import React from 'react';
import { Loader2, Save, ShieldCheck, Trash2, Users, UserPlus, X } from 'lucide-react';
import type { TeamAttendanceAccessSectionProps } from './types';
import { useTeamAttendanceAccessSectionLogic } from './hooks';

export const TeamAttendanceAccessSection: React.FC<TeamAttendanceAccessSectionProps> = ({ allUsers }) => {
  const {
    selectedViewerId,
    setSelectedViewerId,
    includeOwnTeam,
    setIncludeOwnTeam,
    canApproveRequests,
    setCanApproveRequests,
    canApproveSelf,
    setCanApproveSelf,
    isActive,
    setIsActive,
    extraUserIds,
    extraPartnerNames,
    viewerSearchTerm,
    setViewerSearchTerm,
    searchTerm,
    setSearchTerm,
    loading,
    saving,
    error,
    setError,
    message,
    setMessage,
    showGrantAllConfirm,
    setShowGrantAllConfirm,
    activeUsers,
    partnerNames,
    selectedViewer,
    selectedRule,
    viewerOptions,
    filteredUsers,
    previewUsers,
    toggleUser,
    applyGrantAllActive,
    togglePartner,
    saveRule,
    deleteRule,
  } = useTeamAttendanceAccessSectionLogic({ allUsers });

  return (
    <section className="rounded-md border border-blue-200/65 bg-panel p-5 shadow-sm sm:p-6">
      <header className="mb-6 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-medium text-blue-800">
            <ShieldCheck className="h-3.5 w-3.5" aria-hidden />
            Dashboard permissions
          </div>
          <h2 className="text-xl font-semibold text-slate-900">Team Attendance Access</h2>
          <p className="mt-1 max-w-3xl text-sm text-slate-600">
            Control who can view extra employees in the employee dashboard Team Attendance tab. Tick “Can approve their requests” if this viewer should also review and approve those people’s attendance requests. Include viewer (self) only shows their own row — they still cannot approve their own attendance unless “Can approve own attendance” is also ticked.
          </p>
        </div>
        <button
          type="button"
          onClick={saveRule}
          disabled={saving || !selectedViewerId}
          className="inline-flex items-center justify-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Save Access
        </button>
      </header>

      {error && <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>}
      {message && <div className="mb-4 rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{message}</div>}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,360px)_1fr]">
        <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-4">
          <div>
            <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">
              Viewer
            </label>
            <input
              type="text"
              value={viewerSearchTerm}
              onChange={(e) => setViewerSearchTerm(e.target.value)}
              placeholder="Search viewer by name, code, OD ID, or email..."
              className="mb-2 w-full rounded-lg border border-blue-200/65 bg-panel px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            />
            <select
              value={selectedViewerId}
              onChange={(e) => {
                setSelectedViewerId(e.target.value);
                setViewerSearchTerm('');
                setSearchTerm('');
                setMessage(null);
                setError(null);
              }}
              className="w-full rounded-lg border border-blue-200/65 bg-panel px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            >
              {viewerOptions.map((user) => (
                <option key={user._id} value={user._id}>
                  {user.name} {user.employeeCode ? `(${user.employeeCode})` : ''}
                </option>
              ))}
              {viewerOptions.length === 0 && <option value="">No matching employees</option>}
            </select>
          </div>

          <label className="flex items-start gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
              className="mt-1 h-4 w-4 rounded border-slate-300"
            />
            <span>
              <span className="block font-medium text-slate-900">Access rule enabled</span>
              Disable this to hide the Team Attendance tab for this viewer.
            </span>
          </label>

          <label className="flex items-start gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={includeOwnTeam}
              onChange={(e) => setIncludeOwnTeam(e.target.checked)}
              disabled={!isActive}
              className="mt-1 h-4 w-4 rounded border-slate-300"
            />
            <span>
              <span className="block font-medium text-slate-900">Include own team</span>
              Employees whose Working Under Partner matches {selectedViewer?.name || 'this viewer'}.
            </span>
          </label>

          <label className="flex items-start gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={canApproveRequests}
              onChange={(e) => {
                const next = e.target.checked;
                setCanApproveRequests(next);
                if (!next) setCanApproveSelf(false);
              }}
              disabled={!isActive}
              className="mt-1 h-4 w-4 rounded border-slate-300"
            />
            <span>
              <span className="block font-medium text-slate-900">Can approve their requests</span>
              Allow this viewer to review and approve attendance requests for the team and employees they can see. This does not include their own attendance unless “Can approve own attendance” is also ticked. When unchecked, they can still view Team Attendance, but the request section stays hidden on their dashboard (unless they are the official attendance-email approver).
            </span>
          </label>

          <label className="flex items-start gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={canApproveSelf}
              onChange={(e) => setCanApproveSelf(e.target.checked)}
              disabled={!isActive || !canApproveRequests}
              className="mt-1 h-4 w-4 rounded border-slate-300"
            />
            <span>
              <span className="block font-medium text-slate-900">Can approve own attendance</span>
              Allow this viewer to approve their own attendance requests. Leave this unchecked to prevent self-approve even when Include viewer (self) is on.
            </span>
          </label>

          {selectedRule && (
            <button
              type="button"
              onClick={deleteRule}
              disabled={saving}
              className="inline-flex w-full items-center justify-center gap-2 rounded-md border border-red-200 bg-white px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-60"
            >
              <Trash2 className="h-4 w-4" />
              Remove Custom Rule
            </button>
          )}
        </div>

        <div className="grid gap-5 xl:grid-cols-2">
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <h3 className="mb-3 text-sm font-semibold text-slate-900">Extra Partners / Teams</h3>
            <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
              {partnerNames.map((partner) => (
                <label key={partner} className="flex items-center gap-2 rounded-md border border-slate-100 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50">
                  <input
                    type="checkbox"
                    checked={extraPartnerNames.includes(partner)}
                    onChange={() => togglePartner(partner)}
                    disabled={!isActive}
                    className="h-4 w-4 rounded border-slate-300"
                  />
                  {partner}
                </label>
              ))}
              {partnerNames.length === 0 && <p className="text-sm text-slate-500">No partner names found.</p>}
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <h3 className="text-sm font-semibold text-slate-900">Extra Employees</h3>
              <div className="flex items-center gap-2">
                <span className="rounded-full bg-slate-100 px-2 py-1 text-xs text-slate-600">{extraUserIds.length} selected</span>
                <button
                  type="button"
                  onClick={() => setShowGrantAllConfirm(true)}
                  disabled={!isActive || !selectedViewerId || activeUsers.length === 0}
                  className="inline-flex items-center gap-1.5 rounded-md border border-blue-200 bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-800 hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <UserPlus className="h-3.5 w-3.5" aria-hidden />
                  Grant all active
                </button>
              </div>
            </div>
            {selectedViewer && (
              <label className="mb-3 flex items-start gap-3 rounded-lg border border-blue-100 bg-blue-50/70 px-3 py-2.5 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={extraUserIds.includes(selectedViewerId)}
                  onChange={() => toggleUser(selectedViewerId)}
                  disabled={!isActive}
                  className="mt-0.5 h-4 w-4 rounded border-slate-300"
                />
                <span>
                  <span className="block font-medium text-slate-900">Include viewer (self)</span>
                  <span className="text-xs text-slate-600">Show {selectedViewer.name}&apos;s own row in the Team Attendance list. This is view-only unless “Can approve own attendance” is also ticked.</span>
                </span>
              </label>
            )}
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search employees..."
              className="mb-3 w-full rounded-lg border border-blue-200/65 bg-panel px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            />
            <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
              {filteredUsers.map((user) => (
                <label key={user._id} className="flex items-center gap-2 rounded-md border border-slate-100 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50">
                  <input
                    type="checkbox"
                    checked={extraUserIds.includes(user._id)}
                    onChange={() => toggleUser(user._id)}
                    disabled={!isActive}
                    className="h-4 w-4 rounded border-slate-300"
                  />
                  <span className="min-w-0">
                    <span className="block truncate font-medium text-slate-900">{user.name}</span>
                    <span className="block truncate text-xs text-slate-500">{user.employeeCode || user.odId || user.email}</span>
                  </span>
                </label>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="mt-5 rounded-xl border border-blue-200 bg-blue-50/60 p-4">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <Users className="h-4 w-4 text-blue-700" />
          <h3 className="text-sm font-semibold text-blue-950">
            Preview: {selectedViewer?.name || 'Selected viewer'} can view {previewUsers.length} employee{previewUsers.length === 1 ? '' : 's'}
            {isActive
              ? canApproveRequests
                ? extraUserIds.includes(selectedViewerId) && canApproveSelf
                  ? ' and can approve their requests, including their own'
                  : extraUserIds.includes(selectedViewerId)
                    ? ' and can approve their requests (except their own)'
                    : ' and can approve their requests'
                : ' (view only — cannot approve their requests)'
              : ''}
          </h3>
          {loading && <Loader2 className="h-4 w-4 animate-spin text-blue-700" />}
        </div>
        {previewUsers.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {previewUsers.slice(0, 80).map((user) => (
              <span key={user._id} className="rounded-full border border-blue-200 bg-white px-2.5 py-1 text-xs text-slate-700">
                {user.name}
              </span>
            ))}
            {previewUsers.length > 80 && <span className="text-xs text-slate-500">+{previewUsers.length - 80} more</span>}
          </div>
        ) : (
          <p className="text-sm text-blue-900">No employees are visible with the current settings.</p>
        )}
      </div>

      {showGrantAllConfirm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm"
          role="presentation"
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowGrantAllConfirm(false);
          }}
        >
          <div
            className="w-full max-w-md rounded-xl border border-blue-200/65 bg-panel shadow-xl"
            role="dialog"
            aria-modal="true"
            aria-labelledby="grant-all-title"
          >
            <div className="flex items-start justify-between border-b border-slate-200 bg-slate-50 px-4 py-3">
              <h3 id="grant-all-title" className="text-sm font-semibold text-slate-900">
                Grant all active members?
              </h3>
              <button
                type="button"
                onClick={() => setShowGrantAllConfirm(false)}
                className="rounded-md p-1 text-slate-500 hover:bg-slate-200 hover:text-slate-800"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="space-y-3 p-4 text-sm text-slate-700">
              <p>
                This will select every currently <strong>active</strong> employee (
                {activeUsers.length}) so{' '}
                <strong>{selectedViewer?.name || 'this viewer'}</strong> can see them in Team
                Attendance.
              </p>
              <p className="text-slate-600">
                Inactive employees are not included. This only updates the Extra Employees list —
                click <strong>Save Access</strong> afterwards to apply.
              </p>
            </div>
            <div className="flex flex-wrap justify-end gap-2 border-t border-slate-200 px-4 py-3">
              <button
                type="button"
                onClick={() => setShowGrantAllConfirm(false)}
                className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={applyGrantAllActive}
                className="inline-flex items-center gap-2 rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700"
              >
                <UserPlus className="h-4 w-4" aria-hidden />
                Select all active
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
};
