'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, Save, Shield, UserPlus, X } from 'lucide-react';
import {
  EMPLOYEE_MANAGEMENT_TAB_IDS,
  HR_CONSOLE_SECTION_IDS,
  type EmployeeManagementTabId,
  type HrAccessLevel,
  type HrConsoleSectionId,
  fullEditDefaults,
} from '@/lib/hrConsolePermissionUtils';
import { ALLOWED_HR_ADMIN_EMAILS } from '@/lib/hrAllowedAdminEmails';
import { hrCredentialsInit } from '@/lib/hrAuthHeaders';

const SECTION_LABELS: Record<HrConsoleSectionId, string> = {
  upload: 'Attendance Upload',
  summary: 'Attendance Summary',
  employee: 'Employee Month View',
  employees: 'Employees',
  employeeMasterUpload: 'Employee Master Upload',
  teamAccess: 'Team Access',
  requests: 'Requests',
  holidays: 'Holiday Management',
  backup: 'Database Backup',
  leave: 'Leave Management',
  fines: 'Fine Management',
  articleCredits: 'Article Credits',
  invalid: 'Invalid Attendance',
  misExceptions: 'MIS Exceptions',
  clientPlaces: 'Client Places',
  accessControl: 'Access control (this page)',
  settings: 'Settings',
};

const TAB_LABELS: Record<EmployeeManagementTabId, string> = {
  basic: 'Basic Info',
  schedule: 'Schedule',
  extended: 'Extended',
  bank: 'Bank Details',
  salary: 'Salary & Leave',
  history: 'History',
};

const LEVEL_OPTIONS: { value: HrAccessLevel; label: string }[] = [
  { value: 'none', label: 'Hidden' },
  { value: 'view', label: 'View only' },
  { value: 'edit', label: 'View & edit' },
];

function mapsFromRow(row: Record<string, unknown> | null | undefined): {
  sections: Record<HrConsoleSectionId, HrAccessLevel>;
  employeeTabs: Record<EmployeeManagementTabId, HrAccessLevel>;
} {
  const base = fullEditDefaults();
  if (!row) return base;
  const secRaw = row.sections as Record<string, unknown> | undefined;
  const tabRaw = row.employeeTabs as Record<string, unknown> | undefined;
  const sections = { ...base.sections };
  const employeeTabs = { ...base.employeeTabs };
  if (secRaw && typeof secRaw === 'object') {
    for (const id of HR_CONSOLE_SECTION_IDS) {
      if (Object.prototype.hasOwnProperty.call(secRaw, id)) {
        const v = secRaw[id];
        if (v === 'none' || v === 'view' || v === 'edit') sections[id] = v;
      }
    }
  }
  if (tabRaw && typeof tabRaw === 'object') {
    for (const id of EMPLOYEE_MANAGEMENT_TAB_IDS) {
      if (Object.prototype.hasOwnProperty.call(tabRaw, id)) {
        const v = tabRaw[id];
        if (v === 'none' || v === 'view' || v === 'edit') employeeTabs[id] = v;
      }
    }
  }
  return { sections, employeeTabs };
}

interface HrConsoleAccessSectionProps {
  onSaved?: () => void;
}

export const HrConsoleAccessSection: React.FC<HrConsoleAccessSectionProps> = ({ onSaved }) => {
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

  return (
    <section className="rounded-md border border-blue-200/65 bg-panel p-5 shadow-sm sm:p-6">
      <header className="mb-6 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-medium text-blue-800">
            <Shield className="h-3.5 w-3.5" aria-hidden />
            HR console
          </div>
          <h2 className="text-xl font-semibold text-slate-900">Access control</h2>
          <p className="mt-1 max-w-3xl text-sm text-slate-600">
            Add @asija.in addresses that may sign in to this HR console, then choose an operator and set which sidebar
            areas they can see or edit. For Employees, set each tab (Basic, Schedule, Bank, etc.) separately.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void save()}
          disabled={saving || loading}
          className="inline-flex items-center justify-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Save
        </button>
      </header>

      {error && (
        <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>
      )}
      {message && (
        <div className="mb-4 rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          {message}
        </div>
      )}

      <div className="mb-6 space-y-4 rounded-lg border border-slate-200 bg-slate-50/80 p-4">
        <div>
          <h3 className="text-sm font-semibold text-slate-900">Who may log in (HR OTP)</h3>
          <p className="mt-1 text-xs text-slate-600">
            Built-in accounts are always allowed. You can add more @asija.in addresses here (stored in the database).
            For bulk or infra-managed addresses, your deploy can also set the server env{' '}
            <code className="rounded bg-white px-1 py-0.5 text-[11px] text-slate-800">HR_ALLOWED_ADMIN_EMAILS</code>{' '}
            (comma-separated).
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <div className="min-w-0 flex-1">
            <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">
              Add login email
            </label>
            <input
              type="email"
              value={newAllowEmail}
              onChange={(e) => setNewAllowEmail(e.target.value)}
              placeholder="name@asija.in"
              disabled={allowlistBusy || loading}
              className="w-full max-w-md rounded-lg border border-blue-200/65 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            />
          </div>
          <button
            type="button"
            onClick={() => void addAllowlistEmail()}
            disabled={allowlistBusy || loading || !newAllowEmail.trim()}
            className="inline-flex shrink-0 items-center justify-center gap-2 rounded-md border border-blue-200 bg-white px-3 py-2 text-sm font-medium text-blue-800 shadow-sm transition-colors hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {allowlistBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
            Add email
          </button>
        </div>
        {dbOnlyExtraEmails.length > 0 && (
          <div>
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">Added in database</p>
            <ul className="flex flex-wrap gap-2">
              {dbOnlyExtraEmails.map((em) => (
                <li
                  key={em}
                  className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs text-slate-800"
                >
                  <span>{em}</span>
                  <button
                    type="button"
                    onClick={() => void removeAllowlistEmail(em)}
                    disabled={allowlistBusy}
                    className="rounded p-0.5 text-slate-500 hover:bg-red-50 hover:text-red-700 disabled:opacity-40"
                    title="Remove from allowlist"
                  >
                    <X className="h-3.5 w-3.5" aria-hidden />
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <div className="mb-6">
        <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">HR operator email</label>
        <select
          value={selectedEmail}
          onChange={(e) => {
            setSelectedEmail(e.target.value);
            setMessage(null);
            setError(null);
          }}
          disabled={loading || allowedOperatorEmails.length === 0}
          className="w-full max-w-md rounded-lg border border-blue-200/65 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 disabled:opacity-60"
        >
          {allowedOperatorEmails.map((em) => (
            <option key={em} value={em}>
              {em}
            </option>
          ))}
        </select>
        {!selectedRow && (
          <p className="mt-2 text-xs text-slate-500">
            No saved row yet for this email — defaults apply until you save.
          </p>
        )}
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-slate-600">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading…
        </div>
      ) : (
        <div className="grid gap-8 lg:grid-cols-2">
          <div>
            <h3 className="mb-3 text-sm font-semibold text-slate-900">Sidebar sections</h3>
            <div className="max-h-[480px] space-y-2 overflow-y-auto pr-1">
              {HR_CONSOLE_SECTION_IDS.map((id) => (
                <div
                  key={id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
                >
                  <span className="text-slate-800">{SECTION_LABELS[id]}</span>
                  <select
                    value={sections[id]}
                    onChange={(e) => setSectionLevel(id, e.target.value as HrAccessLevel)}
                    className="rounded border border-slate-200 bg-slate-50 px-2 py-1 text-xs"
                  >
                    {LEVEL_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          </div>
          <div>
            <h3 className="mb-3 text-sm font-semibold text-slate-900">Employees screen — tabs</h3>
            <p className="mb-3 text-xs text-slate-500">
              Applies when the operator opens Employees. Hidden tabs are not shown; view-only is read-only and cannot
              save those fields.
            </p>
            <div className="space-y-2">
              {EMPLOYEE_MANAGEMENT_TAB_IDS.map((id) => (
                <div
                  key={id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
                >
                  <span className="text-slate-800">{TAB_LABELS[id]}</span>
                  <select
                    value={employeeTabs[id]}
                    onChange={(e) => setTabLevel(id, e.target.value as HrAccessLevel)}
                    disabled={sections.employees === 'none'}
                    className="rounded border border-slate-200 bg-slate-50 px-2 py-1 text-xs disabled:opacity-50"
                  >
                    {LEVEL_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </section>
  );
};
