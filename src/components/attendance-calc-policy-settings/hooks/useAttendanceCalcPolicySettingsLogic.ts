'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { hrCredentialsInit } from '@/lib/hrAuthHeaders';
import { BUILTIN_ATTENDANCE_CALC_POLICY, describeAttendanceCalcPolicy, resolveAttendanceCalcPolicy, resolveInUseVersion, type AttendanceCalcPolicy, type AttendanceCalcPolicyVersion } from '@/lib/attendanceCalcPolicy';

export function useAttendanceCalcPolicySettingsLogic() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [versions, setVersions] = useState<AttendanceCalcPolicyVersion[]>([]);
  const [today, setToday] = useState('');
  const [draft, setDraft] = useState<AttendanceCalcPolicy>(BUILTIN_ATTENDANCE_CALC_POLICY);
  const [effectiveFrom, setEffectiveFrom] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);

  const applyPayload = useCallback((nextVersions: AttendanceCalcPolicyVersion[], nextToday: string) => {
    setVersions(nextVersions);
    setToday(nextToday);
    setDraft(resolveAttendanceCalcPolicy(nextVersions, nextToday));
    setEffectiveFrom('');
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/hr-console-settings/attendance-calc', hrCredentialsInit());
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || 'Failed to load rules');
      applyPayload(
        Array.isArray(json.data?.versions) ? json.data.versions : [],
        String(json.data?.today || '')
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load rules');
    } finally {
      setLoading(false);
    }
  }, [applyPayload]);

  useEffect(() => {
    void load();
  }, [load]);

  const inUseVersion = useMemo(() => resolveInUseVersion(versions, today), [versions, today]);
  const inUsePolicy = useMemo(
    () => resolveAttendanceCalcPolicy(versions, today),
    [versions, today]
  );
  const inUseSentences = useMemo(() => describeAttendanceCalcPolicy(inUsePolicy), [inUsePolicy]);

  const history = useMemo(() => {
    const saved = [...versions].sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom));
    return saved;
  }, [versions]);

  const setField = <K extends keyof AttendanceCalcPolicy>(key: K, value: AttendanceCalcPolicy[K]) => {
    setDraft((prev) => ({ ...prev, [key]: value }));
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch(
        '/api/hr-console-settings/attendance-calc',
        hrCredentialsInit({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...draft, effectiveFrom }),
        })
      );
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || 'Failed to save rules');
      applyPayload(
        Array.isArray(json.data?.versions) ? json.data.versions : [],
        String(json.data?.today || today)
      );
      setMessage('Saved. Days on or after that date use this version. Earlier days keep the previous one.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save rules');
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: string) => {
    if (!window.confirm('Remove this scheduled version? Days will keep the rule that comes before it.')) return;
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch(
        `/api/hr-console-settings/attendance-calc?id=${encodeURIComponent(id)}`,
        hrCredentialsInit({ method: 'DELETE' })
      );
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || 'Failed to remove version');
      applyPayload(
        Array.isArray(json.data?.versions) ? json.data.versions : [],
        String(json.data?.today || today)
      );
      setMessage('Scheduled version removed.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove version');
    } finally {
      setSaving(false);
    }
  };

  const previousFor = (version: AttendanceCalcPolicyVersion): AttendanceCalcPolicy => {
    const older = versions
      .filter((row) => row.effectiveFrom < version.effectiveFrom)
      .sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom))[0];
    return older ?? BUILTIN_ATTENDANCE_CALC_POLICY;
  };

  return {
    loading,
    saving,
    error,
    message,
    versions,
    today,
    draft,
    effectiveFrom,
    setEffectiveFrom,
    openId,
    setOpenId,
    inUseVersion,
    inUseSentences,
    history,
    setField,
    save,
    remove,
    previousFor,
  } as const;
}
