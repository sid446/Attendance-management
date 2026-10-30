'use client';

import { Check, Loader2, RefreshCw, X } from 'lucide-react';
import type { TeamAttendanceRequestsSectionProps } from './types';
import { formatDateTime } from './utils';
import { useTeamAttendanceRequestsSectionLogic } from './hooks';

export function TeamAttendanceRequestsSection({
  monthYear,
  onActionComplete,
}: TeamAttendanceRequestsSectionProps) {
  const {
    view,
    setView,
    loading,
    processingId,
    error,
    pending,
    remarks,
    setRemarks,
    values,
    setValues,
    loadRequests,
    sortedHistory,
    handleAction,
  } = useTeamAttendanceRequestsSectionLogic({ monthYear, onActionComplete });

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
