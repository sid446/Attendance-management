import React, { useEffect, useMemo, useState } from 'react';
import { Loader2, Save, ShieldCheck, Trash2, Users } from 'lucide-react';
import { User } from '@/types/ui';

interface TeamAttendanceAccessSectionProps {
  allUsers: User[];
}

interface TeamAttendanceAccessRule {
  _id?: string;
  viewerUserId: string | User | { _id: string; name?: string; email?: string };
  includeOwnTeam: boolean;
  extraUserIds?: Array<string | User | { _id: string; name?: string }>;
  extraPartnerNames?: string[];
  isActive: boolean;
}

function getEntityId(value: unknown): string {
  if (!value) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'object' && '_id' in value) {
    return String((value as { _id?: unknown })._id || '');
  }
  return '';
}

function normalizeName(value: unknown): string {
  return String(value || '').replace(/[.\s]/g, '').toLowerCase();
}

export const TeamAttendanceAccessSection: React.FC<TeamAttendanceAccessSectionProps> = ({ allUsers }) => {
  const [rules, setRules] = useState<TeamAttendanceAccessRule[]>([]);
  const [selectedViewerId, setSelectedViewerId] = useState('');
  const [includeOwnTeam, setIncludeOwnTeam] = useState(true);
  const [isActive, setIsActive] = useState(true);
  const [extraUserIds, setExtraUserIds] = useState<string[]>([]);
  const [extraPartnerNames, setExtraPartnerNames] = useState<string[]>([]);
  const [viewerSearchTerm, setViewerSearchTerm] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const activeUsers = useMemo(
    () => allUsers.filter((user) => user && user._id && user.isActive !== false),
    [allUsers]
  );

  const partnerNames = useMemo(() => {
    const names = new Set<string>();
    activeUsers.forEach((user) => {
      const name = String(user.workingUnderPartner || '').trim();
      if (name) names.add(name);
    });
    return Array.from(names).sort((a, b) => a.localeCompare(b));
  }, [activeUsers]);

  const selectedViewer = useMemo(
    () => activeUsers.find((user) => user._id === selectedViewerId) || null,
    [activeUsers, selectedViewerId]
  );

  const selectedRule = useMemo(
    () => rules.find((rule) => getEntityId(rule.viewerUserId) === selectedViewerId) || null,
    [rules, selectedViewerId]
  );

  const viewerOptions = useMemo(() => {
    const term = viewerSearchTerm.trim().toLowerCase();
    const filtered = activeUsers.filter((user) => {
      if (!term) return true;
      return (
        String(user.name || '').toLowerCase().includes(term) ||
        String(user.employeeCode || '').toLowerCase().includes(term) ||
        String(user.odId || '').toLowerCase().includes(term) ||
        String(user.email || '').toLowerCase().includes(term)
      );
    });

    if (selectedViewer && !filtered.some((user) => user._id === selectedViewer._id)) {
      return [selectedViewer, ...filtered];
    }

    return filtered;
  }, [activeUsers, selectedViewer, viewerSearchTerm]);

  const filteredUsers = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    return activeUsers.filter((user) => {
      if (!term) return true;
      return (
        String(user.name || '').toLowerCase().includes(term) ||
        String(user.employeeCode || '').toLowerCase().includes(term) ||
        String(user.odId || '').toLowerCase().includes(term)
      );
    });
  }, [activeUsers, searchTerm]);

  const previewUsers = useMemo(() => {
    if (!selectedViewer || !isActive) return [];
    const visible = new Map<string, User>();
    const selectedViewerName = normalizeName(selectedViewer.name);

    if (includeOwnTeam) {
      activeUsers.forEach((user) => {
        if (user._id !== selectedViewerId && normalizeName(user.workingUnderPartner) === selectedViewerName) {
          visible.set(user._id, user);
        }
      });
    }

    activeUsers.forEach((user) => {
      if (extraUserIds.includes(user._id)) {
        visible.set(user._id, user);
      }
      if (
        user._id !== selectedViewerId &&
        user.workingUnderPartner &&
        extraPartnerNames.some((partner) => normalizeName(partner) === normalizeName(user.workingUnderPartner))
      ) {
        visible.set(user._id, user);
      }
    });

    if (!extraUserIds.includes(selectedViewerId)) {
      visible.delete(selectedViewerId);
    }

    return Array.from(visible.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [activeUsers, extraPartnerNames, extraUserIds, includeOwnTeam, isActive, selectedViewer, selectedViewerId]);

  const fetchRules = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/team-attendance-access', { cache: 'no-store' });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || 'Failed to fetch access rules');
      }
      setRules(Array.isArray(json.data) ? json.data : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch access rules');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchRules();
  }, []);

  useEffect(() => {
    if (!selectedViewerId && activeUsers.length > 0) {
      setSelectedViewerId(activeUsers[0]._id);
    }
  }, [activeUsers, selectedViewerId]);

  useEffect(() => {
    if (!selectedViewerId) return;
    if (!selectedRule) {
      setIncludeOwnTeam(true);
      setIsActive(true);
      setExtraUserIds([]);
      setExtraPartnerNames([]);
      return;
    }

    setIncludeOwnTeam(selectedRule.includeOwnTeam !== false);
    setIsActive(selectedRule.isActive !== false);
    setExtraUserIds((selectedRule.extraUserIds || []).map(getEntityId).filter(Boolean));
    setExtraPartnerNames(selectedRule.extraPartnerNames || []);
  }, [selectedRule, selectedViewerId]);

  const toggleUser = (userId: string) => {
    setExtraUserIds((prev) =>
      prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId]
    );
  };

  const togglePartner = (partnerName: string) => {
    setExtraPartnerNames((prev) =>
      prev.includes(partnerName) ? prev.filter((name) => name !== partnerName) : [...prev, partnerName]
    );
  };

  const saveRule = async () => {
    if (!selectedViewerId) return;
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch('/api/team-attendance-access', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          viewerUserId: selectedViewerId,
          includeOwnTeam,
          extraUserIds,
          extraPartnerNames,
          isActive,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || 'Failed to save access rule');
      }
      setMessage('Access rule saved.');
      await fetchRules();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save access rule');
    } finally {
      setSaving(false);
    }
  };

  const deleteRule = async () => {
    if (!selectedViewerId || !selectedRule) return;
    if (!window.confirm('Remove this custom team attendance access rule?')) return;
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch('/api/team-attendance-access', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ viewerUserId: selectedViewerId }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || 'Failed to delete access rule');
      }
      setMessage('Custom access rule removed.');
      await fetchRules();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete access rule');
    } finally {
      setSaving(false);
    }
  };

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
            Control who can view extra employees in the employee dashboard Team Attendance tab without changing attendance approver emails.
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
            <div className="mb-3 flex items-center justify-between gap-3">
              <h3 className="text-sm font-semibold text-slate-900">Extra Employees</h3>
              <span className="rounded-full bg-slate-100 px-2 py-1 text-xs text-slate-600">{extraUserIds.length} selected</span>
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
                  <span className="text-xs text-slate-600">Show {selectedViewer.name}&apos;s own row in the Team Attendance list for this viewer.</span>
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
    </section>
  );
};
