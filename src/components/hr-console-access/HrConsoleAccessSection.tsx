'use client';

import React from 'react';
import { Loader2, Save, Shield, UserPlus, X } from 'lucide-react';
import { EMPLOYEE_MANAGEMENT_TAB_IDS, HR_CONSOLE_SECTION_IDS, type HrAccessLevel } from '@/lib/hrConsolePermissionUtils';
import type { HrConsoleAccessSectionProps } from './types';
import { SECTION_LABELS, LEVEL_OPTIONS, TAB_LABELS } from './constants';
import { useHrConsoleAccessSectionLogic } from './hooks';

export const HrConsoleAccessSection: React.FC<HrConsoleAccessSectionProps> = ({ onSaved }) => {
  const {
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
  } = useHrConsoleAccessSectionLogic({ onSaved });

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
