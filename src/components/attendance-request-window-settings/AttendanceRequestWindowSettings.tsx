'use client';

import React from 'react';
import { CalendarClock, Loader2, Plus, Save, Trash2 } from 'lucide-react';
import { DEFAULT_REQUEST_WINDOW } from '@/lib/attendanceRequestWindow';
import { cutoffInput, numInput } from './utils';
import { useAttendanceRequestWindowSettingsLogic } from './hooks';

export const AttendanceRequestWindowSettings: React.FC = () => {
  const {
    loading,
    saving,
    error,
    message,
    settings,
    allUsers,
    newTeamPartner,
    setNewTeamPartner,
    newEmployeeId,
    setNewEmployeeId,
    partnerOptions,
    save,
    updateGlobal,
    addTeamOverride,
    removeTeamOverride,
    updateTeamOverride,
    addEmployeeOverride,
    removeEmployeeOverride,
    updateEmployeeOverride,
  } = useAttendanceRequestWindowSettingsLogic();

  if (loading) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-4 py-8 text-sm text-slate-600">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
        Loading request window settings…
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <header>
        <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-violet-200 bg-violet-50 px-3 py-1 text-xs font-medium text-violet-900">
          <CalendarClock className="h-3.5 w-3.5" aria-hidden />
          Attendance requests
        </div>
        <h3 className="text-base font-semibold text-slate-900">Request date window</h3>
        <p className="mt-1 max-w-3xl text-sm text-slate-600">
          Control which dates employees can raise correction or future requests for. Overrides
          apply in order: <strong>employee</strong> → <strong>work partner team</strong> →{' '}
          <strong>global</strong> defaults (IST calendar).
        </p>
      </header>

      {error && (
        <div className="rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">
          {error}
        </div>
      )}
      {message && (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          {message}
        </div>
      )}

      <div className="rounded-lg border border-slate-200 bg-slate-50/80 p-4">
        <h4 className="text-sm font-semibold text-slate-900">Global defaults</h4>
        <p className="mt-1 text-xs text-slate-500">
          <strong>Cutoff day</strong>: the whole previous month can be requested up to and
          including this day of the current month (3 = deadline is the 3rd).{' '}
          <strong>Look-back</strong>: how many days back from today stay open inside the current
          month. <strong>Future months</strong>: future dates in the current month are always
          open, plus this many whole calendar months after it.
        </p>
        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          <label className="block text-xs font-medium text-slate-600">
            Previous-month cutoff (day)
            {cutoffInput(
              settings.global.previousMonthCutoffDay,
              DEFAULT_REQUEST_WINDOW.previousMonthCutoffDay,
              (v) => updateGlobal({ previousMonthCutoffDay: v })
            )}
          </label>
          <label className="block text-xs font-medium text-slate-600">
            Current-month look-back (days)
            {numInput(
              settings.global.currentMonthPastDays,
              DEFAULT_REQUEST_WINDOW.currentMonthPastDays,
              (v) => updateGlobal({ currentMonthPastDays: v })
            )}
          </label>
          <label className="block text-xs font-medium text-slate-600">
            Future months ahead
            {numInput(
              settings.global.futureMonthsAhead,
              DEFAULT_REQUEST_WINDOW.futureMonthsAhead,
              (v) => updateGlobal({ futureMonthsAhead: v })
            )}
          </label>
        </div>
      </div>

      <div className="rounded-lg border border-slate-200 p-4">
        <h4 className="text-sm font-semibold text-slate-900">Team overrides (Work Partner)</h4>
        <p className="mt-1 text-xs text-slate-500">
          Applies to all employees whose Working Under Partner matches.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <select
            value={newTeamPartner}
            onChange={(e) => setNewTeamPartner(e.target.value)}
            className="min-w-[12rem] rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
          >
            <option value="">Select work partner…</option>
            {partnerOptions.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={addTeamOverride}
            className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50"
          >
            <Plus className="h-4 w-4" aria-hidden />
            Add team
          </button>
        </div>
        {settings.teamOverrides.length > 0 && (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                  <th className="py-2 pr-3">Partner</th>
                  <th className="py-2 px-2">Cutoff day</th>
                  <th className="py-2 px-2">Look-back</th>
                  <th className="py-2 px-2">Future months</th>
                  <th className="py-2 pl-2" />
                </tr>
              </thead>
              <tbody>
                {settings.teamOverrides.map((row) => (
                  <tr key={row.partnerName} className="border-b border-slate-100">
                    <td className="py-2 pr-3 font-medium text-slate-800">{row.partnerName}</td>
                    <td className="py-2 px-2">
                      {cutoffInput(
                        row.previousMonthCutoffDay,
                        settings.global.previousMonthCutoffDay,
                        (v) => updateTeamOverride(row.partnerName, { previousMonthCutoffDay: v })
                      )}
                    </td>
                    <td className="py-2 px-2">
                      {numInput(
                        row.currentMonthPastDays,
                        settings.global.currentMonthPastDays,
                        (v) => updateTeamOverride(row.partnerName, { currentMonthPastDays: v })
                      )}
                    </td>
                    <td className="py-2 px-2">
                      {numInput(
                        row.futureMonthsAhead,
                        settings.global.futureMonthsAhead,
                        (v) => updateTeamOverride(row.partnerName, { futureMonthsAhead: v })
                      )}
                    </td>
                    <td className="py-2 pl-2 text-right">
                      <button
                        type="button"
                        onClick={() => removeTeamOverride(row.partnerName)}
                        className="rounded p-1.5 text-slate-500 hover:bg-rose-50 hover:text-rose-600"
                        title="Remove team override"
                      >
                        <Trash2 className="h-4 w-4" aria-hidden />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="rounded-lg border border-slate-200 p-4">
        <h4 className="text-sm font-semibold text-slate-900">Employee overrides</h4>
        <p className="mt-1 text-xs text-slate-500">Highest priority — for individual employees.</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <select
            value={newEmployeeId}
            onChange={(e) => setNewEmployeeId(e.target.value)}
            className="min-w-[16rem] max-w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
          >
            <option value="">Select employee…</option>
            {allUsers.map((u) => (
              <option key={u._id} value={u._id}>
                {u.name} ({u.odId || u._id})
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={addEmployeeOverride}
            className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50"
          >
            <Plus className="h-4 w-4" aria-hidden />
            Add employee
          </button>
        </div>
        {settings.employeeOverrides.length > 0 && (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                  <th className="py-2 pr-3">Employee</th>
                  <th className="py-2 px-2">Cutoff day</th>
                  <th className="py-2 px-2">Look-back</th>
                  <th className="py-2 px-2">Future months</th>
                  <th className="py-2 pl-2" />
                </tr>
              </thead>
              <tbody>
                {settings.employeeOverrides.map((row) => (
                  <tr key={row.userId} className="border-b border-slate-100">
                    <td className="py-2 pr-3 font-medium text-slate-800">
                      {row.userName || row.userId}
                    </td>
                    <td className="py-2 px-2">
                      {cutoffInput(
                        row.previousMonthCutoffDay,
                        settings.global.previousMonthCutoffDay,
                        (v) => updateEmployeeOverride(row.userId, { previousMonthCutoffDay: v })
                      )}
                    </td>
                    <td className="py-2 px-2">
                      {numInput(
                        row.currentMonthPastDays,
                        settings.global.currentMonthPastDays,
                        (v) => updateEmployeeOverride(row.userId, { currentMonthPastDays: v })
                      )}
                    </td>
                    <td className="py-2 px-2">
                      {numInput(
                        row.futureMonthsAhead,
                        settings.global.futureMonthsAhead,
                        (v) => updateEmployeeOverride(row.userId, { futureMonthsAhead: v })
                      )}
                    </td>
                    <td className="py-2 pl-2 text-right">
                      <button
                        type="button"
                        onClick={() => removeEmployeeOverride(row.userId)}
                        className="rounded p-1.5 text-slate-500 hover:bg-rose-50 hover:text-rose-600"
                        title="Remove employee override"
                      >
                        <Trash2 className="h-4 w-4" aria-hidden />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <button
        type="button"
        onClick={() => void save()}
        disabled={saving}
        className="inline-flex items-center gap-2 rounded-md bg-violet-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-violet-700 disabled:opacity-50"
      >
        {saving ? (
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
        ) : (
          <Save className="h-4 w-4" aria-hidden />
        )}
        Save request window settings
      </button>
    </div>
  );
};
