'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { CalendarClock, Loader2, Plus, Save, Trash2 } from 'lucide-react';
import { hrCredentialsInit } from '@/lib/hrAuthHeaders';
import { DEFAULT_REQUEST_WINDOW, type RequestWindowConfig } from '@/lib/attendanceRequestWindow';

type TeamOverrideRow = {
  partnerName: string;
  previousMonthCutoffDay?: number;
  currentMonthPastDays?: number;
  futureMonthsAhead?: number;
};

type EmployeeOverrideRow = {
  userId: string;
  userName?: string;
  previousMonthCutoffDay?: number;
  currentMonthPastDays?: number;
  futureMonthsAhead?: number;
};

type SettingsPayload = {
  global: RequestWindowConfig;
  teamOverrides: TeamOverrideRow[];
  employeeOverrides: EmployeeOverrideRow[];
};

type UserListItem = {
  _id: string;
  name: string;
  odId?: string;
  workingUnderPartner?: string;
};

function numInput(
  value: number | undefined,
  fallback: number,
  onChange: (v: number) => void
) {
  return (
    <input
      type="number"
      min={0}
      value={value ?? fallback}
      onChange={(e) => onChange(Number(e.target.value))}
      className="w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-900"
    />
  );
}

function cutoffInput(
  value: number | undefined,
  fallback: number,
  onChange: (v: number) => void
) {
  return (
    <input
      type="number"
      min={1}
      max={31}
      value={value ?? fallback}
      onChange={(e) => onChange(Number(e.target.value))}
      className="w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-900"
    />
  );
}

export const AttendanceRequestWindowSettings: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [settings, setSettings] = useState<SettingsPayload>({
    global: { ...DEFAULT_REQUEST_WINDOW },
    teamOverrides: [],
    employeeOverrides: [],
  });
  const [allUsers, setAllUsers] = useState<UserListItem[]>([]);
  const [newTeamPartner, setNewTeamPartner] = useState('');
  const [newEmployeeId, setNewEmployeeId] = useState('');

  const partnerOptions = useMemo(() => {
    const names = new Set<string>();
    for (const u of allUsers) {
      const p = String(u.workingUnderPartner || '').trim();
      if (p) names.add(p);
    }
    for (const t of settings.teamOverrides) {
      if (t.partnerName) names.add(t.partnerName);
    }
    return Array.from(names).sort((a, b) => a.localeCompare(b));
  }, [allUsers, settings.teamOverrides]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [settingsRes, usersRes] = await Promise.all([
        fetch('/api/hr-console-settings/request-window', hrCredentialsInit()),
        fetch('/api/users?listOnly=1', hrCredentialsInit()),
      ]);
      const settingsJson = await settingsRes.json();
      const usersJson = await usersRes.json();
      if (!settingsRes.ok || !settingsJson.success) {
        throw new Error(settingsJson.error || 'Failed to load settings');
      }
      setSettings(settingsJson.data);
      if (usersJson.success && Array.isArray(usersJson.data)) {
        setAllUsers(usersJson.data);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const save = async () => {
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch(
        '/api/hr-console-settings/request-window',
        hrCredentialsInit({
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(settings),
        })
      );
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || 'Failed to save');
      }
      setSettings(json.data);
      setMessage('Request window settings saved.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const updateGlobal = (patch: Partial<RequestWindowConfig>) => {
    setSettings((s) => ({ ...s, global: { ...s.global, ...patch } }));
  };

  const addTeamOverride = () => {
    const partnerName = newTeamPartner.trim();
    if (!partnerName) return;
    if (settings.teamOverrides.some((t) => t.partnerName === partnerName)) {
      setError('This work partner already has an override.');
      return;
    }
    setSettings((s) => ({
      ...s,
      teamOverrides: [
        ...s.teamOverrides,
        { partnerName, ...DEFAULT_REQUEST_WINDOW },
      ],
    }));
    setNewTeamPartner('');
    setError(null);
  };

  const removeTeamOverride = (partnerName: string) => {
    setSettings((s) => ({
      ...s,
      teamOverrides: s.teamOverrides.filter((t) => t.partnerName !== partnerName),
    }));
  };

  const updateTeamOverride = (partnerName: string, patch: Partial<TeamOverrideRow>) => {
    setSettings((s) => ({
      ...s,
      teamOverrides: s.teamOverrides.map((t) =>
        t.partnerName === partnerName ? { ...t, ...patch } : t
      ),
    }));
  };

  const addEmployeeOverride = () => {
    const userId = newEmployeeId.trim();
    if (!userId) return;
    if (settings.employeeOverrides.some((e) => e.userId === userId)) {
      setError('This employee already has an override.');
      return;
    }
    const user = allUsers.find((u) => u._id === userId);
    setSettings((s) => ({
      ...s,
      employeeOverrides: [
        ...s.employeeOverrides,
        {
          userId,
          userName: user?.name || '',
          ...DEFAULT_REQUEST_WINDOW,
        },
      ],
    }));
    setNewEmployeeId('');
    setError(null);
  };

  const removeEmployeeOverride = (userId: string) => {
    setSettings((s) => ({
      ...s,
      employeeOverrides: s.employeeOverrides.filter((e) => e.userId !== userId),
    }));
  };

  const updateEmployeeOverride = (userId: string, patch: Partial<EmployeeOverrideRow>) => {
    setSettings((s) => ({
      ...s,
      employeeOverrides: s.employeeOverrides.map((e) =>
        e.userId === userId ? { ...e, ...patch } : e
      ),
    }));
  };

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
