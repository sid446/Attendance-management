'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Check, Loader2, RefreshCw, X } from 'lucide-react';
import { employeeCredentialsInit } from '@/lib/employeeCredentialsInit';
import type { EmployeeAttendanceRequest } from '@/types/employeeAttendanceRequest';

type TeamRequestRow = EmployeeAttendanceRequest & {
  userName?: string;
  originalCheckin?: string;
  originalCheckout?: string;
};

interface TeamAttendanceRequestsSectionProps {
  monthYear: string;
  onActionComplete?: () => void;
}

function formatDateTime(value?: string | Date): string {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('en-IN');
}

function getDefaultApproveValue(requestedStatus: string): string {
  const status = requestedStatus.toLowerCase();
  if (status.includes('half')) return '0.5';
  if (status.includes('leave') || requestedStatus === 'On leave') return '';
  if (status.includes('wfh')) return '0.75';
  if (
    status.includes('outstation') ||
    status.includes('client place') ||
    status.includes('clientplace') ||
    status.includes('onsite') ||
    status.includes('os-p')
  ) {
    return '1.2';
  }
  return '1';
}

function resolveApproveValue(requestedStatus: string, raw: string): number | undefined {
  const status = requestedStatus.toLowerCase();
  if (status.includes('leave') || requestedStatus === 'On leave') return undefined;
  const trimmed = raw.trim().replace(',', '.');
  let n = trimmed === '' ? NaN : parseFloat(trimmed);
  if (!Number.isFinite(n)) {
    const def = getDefaultApproveValue(requestedStatus);
    n = def === '' ? NaN : parseFloat(def);
  }
  return Number.isFinite(n) ? n : undefined;
}

export function TeamAttendanceRequestsSection({
  monthYear,
  onActionComplete,
}: TeamAttendanceRequestsSectionProps) {
  const [view, setView] = useState<'pending' | 'history'>('pending');
  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<TeamRequestRow[]>([]);
  const [history, setHistory] = useState<TeamRequestRow[]>([]);
  const [remarks, setRemarks] = useState<Record<string, string>>({});
  const [values, setValues] = useState<Record<string, string>>({});

  const loadRequests = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [pendingRes, historyRes] = await Promise.all([
        fetch('/api/employee/team-attendance-requests?status=Pending', employeeCredentialsInit({ cache: 'no-store' })),
        fetch(
          `/api/employee/team-attendance-requests?monthYear=${encodeURIComponent(monthYear)}`,
          employeeCredentialsInit({ cache: 'no-store' })
        ),
      ]);
      const pendingJson = await pendingRes.json();
      const historyJson = await historyRes.json();

      if (!pendingJson.success) throw new Error(pendingJson.error || 'Failed to load pending requests');
      if (!historyJson.success) throw new Error(historyJson.error || 'Failed to load request history');

      const mapRow = (row: Record<string, unknown>): TeamRequestRow => {
        const userRef = row.userId as { name?: string } | undefined;
        return {
          _id: String(row._id || ''),
          date: String(row.date || ''),
          requestedStatus: String(row.requestedStatus || ''),
          requestType: row.requestType as TeamRequestRow['requestType'],
          originalStatus: row.originalStatus ? String(row.originalStatus) : undefined,
          reason: row.reason ? String(row.reason) : undefined,
          startTime: row.startTime ? String(row.startTime) : undefined,
          endTime: row.endTime ? String(row.endTime) : undefined,
          status: row.status as TeamRequestRow['status'],
          partnerName: row.partnerName ? String(row.partnerName) : undefined,
          partnerRemarks: row.partnerRemarks ? String(row.partnerRemarks) : undefined,
          partnerApprovedAt: row.partnerApprovedAt ? String(row.partnerApprovedAt) : undefined,
          partnerProposedValue: row.partnerProposedValue ? String(row.partnerProposedValue) : undefined,
          hrRemarks: row.hrRemarks ? String(row.hrRemarks) : undefined,
          hrValue: row.hrValue ? String(row.hrValue) : undefined,
          approvedBy: row.approvedBy ? String(row.approvedBy) : undefined,
          approvedByEmail: row.approvedByEmail ? String(row.approvedByEmail) : undefined,
          approvedAt: row.approvedAt ? String(row.approvedAt) : undefined,
          rejectedBy: row.rejectedBy ? String(row.rejectedBy) : undefined,
          rejectedByEmail: row.rejectedByEmail ? String(row.rejectedByEmail) : undefined,
          rejectedAt: row.rejectedAt ? String(row.rejectedAt) : undefined,
          createdAt: row.createdAt ? String(row.createdAt) : undefined,
          updatedAt: row.updatedAt ? String(row.updatedAt) : undefined,
          userName: row.userName ? String(row.userName) : userRef?.name,
          originalCheckin: row.originalCheckin ? String(row.originalCheckin) : undefined,
          originalCheckout: row.originalCheckout ? String(row.originalCheckout) : undefined,
        };
      };

      const pendingRows = (Array.isArray(pendingJson.data) ? pendingJson.data : []).map(mapRow);
      const historyRows = (Array.isArray(historyJson.data) ? historyJson.data : []).map(mapRow);
      setPending(pendingRows);
      setHistory(historyRows);

      const nextRemarks: Record<string, string> = {};
      const nextValues: Record<string, string> = {};
      pendingRows.forEach((row: TeamRequestRow) => {
        nextRemarks[row._id] = 'Done';
        nextValues[row._id] = getDefaultApproveValue(row.requestedStatus);
      });
      setRemarks(nextRemarks);
      setValues(nextValues);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load requests');
      setPending([]);
      setHistory([]);
    } finally {
      setLoading(false);
    }
  }, [monthYear]);

  useEffect(() => {
    void loadRequests();
  }, [loadRequests]);

  const sortedHistory = useMemo(
    () =>
      [...history].sort((a, b) => {
        const ad = new Date(a.date).getTime();
        const bd = new Date(b.date).getTime();
        if (ad !== bd) return bd - ad;
        return String(b.createdAt || '').localeCompare(String(a.createdAt || ''));
      }),
    [history]
  );

  const handleAction = async (row: TeamRequestRow, action: 'approve' | 'reject') => {
    if (processingId) return;
    setProcessingId(row._id);
    setError(null);
    try {
      const res = await fetch(
        '/api/partner/bulk-action',
        employeeCredentialsInit({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action,
            ids: [row._id],
            remark: remarks[row._id] || (action === 'approve' ? 'Approved' : 'Rejected'),
            value:
              action === 'approve'
                ? resolveApproveValue(row.requestedStatus, values[row._id] || getDefaultApproveValue(row.requestedStatus))
                : undefined,
          }),
        })
      );
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || `Failed to ${action} request`);
      }
      await loadRequests();
      onActionComplete?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : `Failed to ${action} request`);
    } finally {
      setProcessingId(null);
    }
  };

  return (
    <section className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="inline-flex rounded-lg border border-border bg-background p-0.5" role="tablist" aria-label="Request views">
          <button
            type="button"
            role="tab"
            aria-selected={view === 'pending'}
            onClick={() => setView('pending')}
            className={`rounded-md px-3 py-2 text-sm font-medium transition-colors ${
              view === 'pending' ? 'bg-surface text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            Pending ({pending.length})
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={view === 'history'}
            onClick={() => setView('history')}
            className={`rounded-md px-3 py-2 text-sm font-medium transition-colors ${
              view === 'history' ? 'bg-surface text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            This month
          </button>
        </div>
        <button
          type="button"
          onClick={() => void loadRequests()}
          disabled={loading}
          className="inline-flex items-center gap-2 rounded-md border border-border bg-background px-3 py-2 text-sm font-medium text-foreground hover:bg-surface/70 disabled:opacity-60"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          Refresh
        </button>
      </div>

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>
      )}

      {loading ? (
        <div className="flex items-center justify-center gap-2 rounded-xl border border-border bg-surface py-16 text-sm text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
          Loading requests…
        </div>
      ) : view === 'pending' ? (
        pending.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border py-12 text-center text-sm text-muted-foreground">
            No pending requests from your visible team.
          </div>
        ) : (
          <div className="space-y-3">
            {pending.map((row) => (
              <article key={row._id} className="rounded-xl border border-border bg-surface p-4 sm:p-5">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0 space-y-1">
                    <p className="text-sm font-semibold text-foreground">{row.userName || 'Employee'}</p>
                    <p className="text-xs text-muted-foreground">
                      {row.date} · {row.requestedStatus}
                    </p>
                    {row.reason && <p className="text-sm text-foreground">{row.reason}</p>}
                    {(row.startTime || row.endTime) && (
                      <p className="text-xs text-muted-foreground">
                        Requested time: {[row.startTime, row.endTime].filter(Boolean).join(' – ')}
                      </p>
                    )}
                    {(row.originalCheckin || row.originalCheckout) && (
                      <p className="text-xs text-muted-foreground">
                        Original punch: {row.originalCheckin || '—'} – {row.originalCheckout || '—'}
                      </p>
                    )}
                    <p className="text-[11px] text-muted-foreground">Raised {formatDateTime(row.createdAt)}</p>
                  </div>
                  <div className="flex w-full shrink-0 flex-col gap-2 sm:w-72">
                    <input
                      type="text"
                      value={remarks[row._id] || ''}
                      onChange={(e) => setRemarks((prev) => ({ ...prev, [row._id]: e.target.value }))}
                      placeholder="Remark"
                      className="rounded-lg border border-border bg-background px-3 py-2 text-sm"
                    />
                    {!row.requestedStatus.toLowerCase().includes('leave') && row.requestedStatus !== 'On leave' && (
                      <input
                        type="text"
                        value={values[row._id] || ''}
                        onChange={(e) => setValues((prev) => ({ ...prev, [row._id]: e.target.value }))}
                        placeholder="Value"
                        className="rounded-lg border border-border bg-background px-3 py-2 text-sm"
                      />
                    )}
                    <div className="flex gap-2">
                      <button
                        type="button"
                        disabled={processingId === row._id}
                        onClick={() => void handleAction(row, 'approve')}
                        className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-md bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-60"
                      >
                        {processingId === row._id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                        Approve
                      </button>
                      <button
                        type="button"
                        disabled={processingId === row._id}
                        onClick={() => void handleAction(row, 'reject')}
                        className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-md border border-red-200 bg-white px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-60"
                      >
                        <X className="h-4 w-4" />
                        Reject
                      </button>
                    </div>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )
      ) : sortedHistory.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border py-12 text-center text-sm text-muted-foreground">
          No requests for {monthYear} from your visible team.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border bg-surface">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-border bg-background/60 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-3 py-2.5">Employee</th>
                <th className="px-3 py-2.5">Date</th>
                <th className="px-3 py-2.5">Requested</th>
                <th className="px-3 py-2.5">Status</th>
                <th className="px-3 py-2.5">Decision by</th>
                <th className="px-3 py-2.5">Decision email</th>
                <th className="px-3 py-2.5">Decision on</th>
                <th className="px-3 py-2.5">Remark</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {sortedHistory.map((row) => {
                const decisionBy =
                  row.status === 'Approved'
                    ? row.approvedBy
                    : row.status === 'Rejected'
                      ? row.rejectedBy
                      : row.status === 'PendingHr'
                        ? row.partnerName
                        : '—';
                const decisionEmail =
                  row.status === 'Approved'
                    ? row.approvedByEmail
                    : row.status === 'Rejected'
                      ? row.rejectedByEmail
                      : '—';
                const decisionAt =
                  row.status === 'Approved'
                    ? row.approvedAt
                    : row.status === 'Rejected'
                      ? row.rejectedAt
                      : row.status === 'PendingHr'
                        ? row.partnerApprovedAt
                        : undefined;
                const remark = row.partnerRemarks || row.hrRemarks || row.reason || '—';

                return (
                  <tr key={row._id} className="bg-surface/50">
                    <td className="px-3 py-2.5 font-medium text-foreground">{row.userName || '—'}</td>
                    <td className="px-3 py-2.5 whitespace-nowrap text-muted-foreground">{row.date}</td>
                    <td className="px-3 py-2.5 text-foreground">{row.requestedStatus}</td>
                    <td className="px-3 py-2.5">
                      <span className="rounded-full border border-border px-2 py-0.5 text-xs">{row.status}</span>
                    </td>
                    <td className="px-3 py-2.5 text-foreground">{decisionBy || '—'}</td>
                    <td className="px-3 py-2.5 text-muted-foreground">{decisionEmail || '—'}</td>
                    <td className="px-3 py-2.5 whitespace-nowrap text-muted-foreground">{formatDateTime(decisionAt)}</td>
                    <td className="max-w-xs px-3 py-2.5 text-muted-foreground">{remark}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
