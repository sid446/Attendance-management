'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { hrCredentialsInit } from '@/lib/hrAuthHeaders';
import type { PresenceCreditKind, PresenceCreditRuleLike, PresenceCreditScope } from '@/lib/presenceCredit';
import type { Person } from '../types';

export function usePresenceCreditSettingsLogic() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [rules, setRules] = useState<PresenceCreditRuleLike[]>([]);
  const [teams, setTeams] = useState<string[]>([]);
  const [people, setPeople] = useState<Person[]>([]);
  const [kind, setKind] = useState<PresenceCreditKind>('wfh');
  const [scope, setScope] = useState<PresenceCreditScope>('everyone');
  const [credit, setCredit] = useState('0.5');
  const [effectiveFrom, setEffectiveFrom] = useState('');
  const [team, setTeam] = useState('');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [personQuery, setPersonQuery] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/hr-console-settings/presence-credit', hrCredentialsInit());
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || 'Failed to load rules');
      setRules(Array.isArray(json.data?.rules) ? json.data.rules : []);
      setTeams(Array.isArray(json.data?.teams) ? json.data.teams : []);
      setPeople(Array.isArray(json.data?.people) ? json.data.people : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load rules');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const filteredPeople = useMemo(() => {
    const q = personQuery.trim().toLowerCase();
    if (!q) return people.slice(0, 40);
    return people
      .filter((p) => {
        const hay = `${p.name} ${p.team || ''} ${p.employeeCode || ''} ${p.odId || ''}`.toLowerCase();
        return hay.includes(q);
      })
      .slice(0, 40);
  }, [people, personQuery]);

  const togglePerson = (id: string) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const addRule = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch(
        '/api/hr-console-settings/presence-credit',
        hrCredentialsInit({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            kind,
            scope,
            credit: Number(credit),
            effectiveFrom,
            team,
            userIds: selectedIds,
          }),
        })
      );
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || 'Failed to save rule');
      setMessage('Rule saved. Days above this limit were brought down to it.');
      setSelectedIds([]);
      setPersonQuery('');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save rule');
    } finally {
      setSaving(false);
    }
  };

  const removeRule = async (id?: string) => {
    if (!id) return;
    setError(null);
    setMessage(null);
    try {
      const res = await fetch(
        `/api/hr-console-settings/presence-credit?id=${encodeURIComponent(id)}`,
        hrCredentialsInit({ method: 'DELETE' })
      );
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || 'Failed to delete rule');
      setRules((prev) => prev.filter((rule) => rule._id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete rule');
    }
  };

  return {
    loading,
    saving,
    error,
    message,
    rules,
    teams,
    people,
    kind,
    setKind,
    scope,
    setScope,
    credit,
    setCredit,
    effectiveFrom,
    setEffectiveFrom,
    team,
    setTeam,
    selectedIds,
    personQuery,
    setPersonQuery,
    filteredPeople,
    togglePerson,
    addRule,
    removeRule,
  } as const;
}
