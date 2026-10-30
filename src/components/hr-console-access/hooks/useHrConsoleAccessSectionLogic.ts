'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { type EmployeeManagementTabId, type HrAccessLevel, type HrConsoleSectionId, fullEditDefaults } from '@/lib/hrConsolePermissionUtils';
import { ALLOWED_HR_ADMIN_EMAILS } from '@/lib/hrAllowedAdminEmails';
import { hrCredentialsInit } from '@/lib/hrAuthHeaders';
import type { HrConsoleAccessSectionProps } from '../types';
import { mapsFromRow } from '../utils/hrConsoleAccessUtils';

export function useHrConsoleAccessSectionLogic({ onSaved }: HrConsoleAccessSectionProps) {
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [allowedOperatorEmails, setAllowedOperatorEmails] = useState<string[]>([...ALLOWED_HR_ADMIN_EMAILS]);
  const [dbOnlyExtraEmails, setDbOnlyExtraEmails] = useState<string[]>([]);
  const [selectedEmail, setSelectedEmail] = useState<string>(ALLOWED_HR_ADMIN_EMAILS[0]);
  const [newAllowEmail, setNewAllowEmail] = useState('');
  const [allowlistBusy, setAllowlistBusy] = useState(false);
  const [sections, setSections] = useState<Record<HrConsoleSectionId, HrAccessLevel>>(fullEditDefaults().sections);
  const [employeeTabs, setEmployeeTabs] = useState<Record<EmployeeManagementTabId, HrAccessLevel>>(
    fullEditDefaults().employeeTabs
  );
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const selectedRow = useMemo(
    () => rows.find((r) => String(r.operatorEmail || '').toLowerCase() === selectedEmail) || null,
    [rows, selectedEmail]
  );

  const fetchRows = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/hr-console-permissions', hrCredentialsInit({ cache: 'no-store' }));
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || 'Failed to load');
      }
      setRows(Array.isArray(json.data) ? json.data : []);
      const allowed = Array.isArray(json.allowedOperatorEmails)
        ? (json.allowedOperatorEmails as string[])
        : [...ALLOWED_HR_ADMIN_EMAILS];
      const dbOnly = Array.isArray(json.dbOnlyExtraEmails) ? (json.dbOnlyExtraEmails as string[]) : [];
      setAllowedOperatorEmails(allowed);
      setDbOnlyExtraEmails(dbOnly);
      setSelectedEmail((prev) => (allowed.includes(prev) ? prev : allowed[0] || ''));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchRows();
  }, [fetchRows]);

  useEffect(() => {
    const { sections: s, employeeTabs: t } = mapsFromRow(selectedRow);
    setSections(s);
    setEmployeeTabs(t);
  }, [selectedRow]);

  const setSectionLevel = (id: HrConsoleSectionId, value: HrAccessLevel) => {
    setSections((prev) => ({ ...prev, [id]: value }));
  };

  const setTabLevel = (id: EmployeeManagementTabId, value: HrAccessLevel) => {
    setEmployeeTabs((prev) => ({ ...prev, [id]: value }));
  };

  const syncAllowlistFromJson = (json: {
    allowedOperatorEmails?: string[];
    dbOnlyExtraEmails?: string[];
  }) => {
    const allowed = Array.isArray(json.allowedOperatorEmails)
      ? json.allowedOperatorEmails
      : [...ALLOWED_HR_ADMIN_EMAILS];
    const dbOnly = Array.isArray(json.dbOnlyExtraEmails) ? json.dbOnlyExtraEmails : [];
    setAllowedOperatorEmails(allowed);
    setDbOnlyExtraEmails(dbOnly);
    setSelectedEmail((prev) => (allowed.includes(prev) ? prev : allowed[0] || ''));
  };

  const addAllowlistEmail = async () => {
    setAllowlistBusy(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch('/api/hr-allowed-admin-emails', hrCredentialsInit({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: newAllowEmail.trim() }),
      }));
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || 'Could not add email');
      }
      syncAllowlistFromJson(json);
      setNewAllowEmail('');
      setMessage('Login email added to the allowlist. They can request an OTP on the next sign-in.');
      onSaved?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not add email');
    } finally {
      setAllowlistBusy(false);
    }
  };

  const removeAllowlistEmail = async (email: string) => {
    setAllowlistBusy(true);
    setError(null);
    setMessage(null);
    try {
      const q = new URLSearchParams({ email });
      const res = await fetch(`/api/hr-allowed-admin-emails?${q.toString()}`, hrCredentialsInit({
        method: 'DELETE',
      }));
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || 'Could not remove email');
      }
      syncAllowlistFromJson(json);
      setMessage('Email removed from the database allowlist.');
      onSaved?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not remove email');
    } finally {
      setAllowlistBusy(false);
    }
  };

  const save = async () => {
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch('/api/hr-console-permissions', hrCredentialsInit({
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          operatorEmail: selectedEmail,
          sections,
          employeeTabs,
        }),
      }));
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || 'Save failed');
      }
      setMessage('Permissions saved.');
      await fetchRows();
      onSaved?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  return {
    allowedOperatorEmails,
    dbOnlyExtraEmails,
    selectedEmail,
    setSelectedEmail,
    newAllowEmail,
    setNewAllowEmail,
    allowlistBusy,
    sections,
    employeeTabs,
    loading,
    saving,
    error,
    setError,
    message,
    setMessage,
    selectedRow,
    setSectionLevel,
    setTabLevel,
    addAllowlistEmail,
    removeAllowlistEmail,
    save,
  } as const;
}
