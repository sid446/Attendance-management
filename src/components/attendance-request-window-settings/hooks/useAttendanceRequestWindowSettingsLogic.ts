'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { hrCredentialsInit } from '@/lib/hrAuthHeaders';
import { DEFAULT_REQUEST_WINDOW, type RequestWindowConfig } from '@/lib/attendanceRequestWindow';
import type { SettingsPayload, UserListItem, TeamOverrideRow, EmployeeOverrideRow } from '../types';

export function useAttendanceRequestWindowSettingsLogic() {
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

  return {
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
  } as const;
}
