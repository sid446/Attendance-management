'use client';

import React from 'react';
import type { RequestDisplayRow, RequestsAdminActionsProps } from '../../types';
import { formatStatusLabel, getStatusBadgeColor, getStatusIcon } from '../../utils/requestStatus';

export interface AttendanceRequestsTableProps extends RequestsAdminActionsProps {
  sortedRequestRows: RequestDisplayRow[];
}

function formatAttendanceRequestDate(dateStr: string): string {
  const iso = String(dateStr || '').split('T')[0];
  const d = new Date(`${iso}T12:00:00`);
  if (Number.isNaN(d.getTime())) {
    const fallback = new Date(dateStr);
    if (Number.isNaN(fallback.getTime())) return String(dateStr || '');
    return fallback.toLocaleDateString('en-IN', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  }
  return d.toLocaleDateString('en-IN', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export const AttendanceRequestsTable: React.FC<AttendanceRequestsTableProps> = ({
  sortedRequestRows,
  isAdminView = false,
  hrAdminHighlight = false,
  processingRequest,
  openApprovalModal,
}) => {
  const thCls =
    'border-b border-slate-200 px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-500';
  const tdCls = 'border-b border-slate-200 px-4 py-3 align-top';
  const pendingHrRow = (status: string) =>
    hrAdminHighlight && status === 'PendingHr' ? 'bg-rose-50 hover:bg-rose-100/80' : 'hover:bg-slate-50/80';

  return (
    <div className="overflow-x-auto rounded-md border border-blue-200/65 bg-panel">
      <table className="w-full min-w-[1100px] border-collapse text-left text-sm">
        <thead className="bg-slate-50">
          <tr>
            <th className={thCls}>Employee</th>
            <th className={thCls}>Date range</th>
            <th className={thCls}>Requested status</th>
            <th className={thCls}>Time</th>
            <th className={thCls}>Reason</th>
            <th className={thCls}>Status</th>
            <th className={thCls}>Action by</th>
            <th className={thCls}>Processed on</th>
            <th className={thCls}>Email</th>
            <th className={thCls}>Value</th>
            <th className={thCls}>Partner</th>
            <th className={thCls}>Submitted</th>
            {isAdminView && <th className={thCls}>Actions</th>}
          </tr>
        </thead>
        <tbody className="bg-panel">
          {sortedRequestRows.map((row) =>
            row.type === 'range' ? (
              <tr
                key={`range-${row.item.ids.join('-')}`}
                className={`transition-colors ${pendingHrRow(row.item.status)}`}
              >
                <td className={tdCls}>
                  <div>
                    <div className="font-medium text-slate-900">{row.item.userName}</div>
                    <div className="text-xs text-slate-500">{row.item.designation || 'Employee'}</div>
                  </div>
                </td>
                <td className={tdCls}>
                  <div className="text-slate-800">
                    {formatAttendanceRequestDate(row.item.startDate)} –{' '}
                    {formatAttendanceRequestDate(row.item.endDate)}
                  </div>
                </td>
                <td className={tdCls}>
                  <span className="font-medium text-slate-900">{row.item.requestedStatus}</span>
                </td>
                <td className={tdCls}>
                  <span className="text-slate-600">
                    {row.item.startTime && row.item.endTime
                      ? `${row.item.startTime} - ${row.item.endTime}`
                      : '—'}
                  </span>
                </td>
                <td className={tdCls}>
                  <span className="block max-w-xs truncate text-slate-600" title={row.item.reason}>
                    {row.item.reason || '—'}
                  </span>
                </td>
                <td className={tdCls}>
                  <div
                    className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${getStatusBadgeColor(row.item.status)}`}
                  >
                    {getStatusIcon(row.item.status)}
                    {formatStatusLabel(row.item.status)}
                  </div>
                  {row.item.status === 'PendingHr' && (
                    <div className="mt-1 max-w-xs text-xs leading-snug text-rose-800">
                      Partner approved — HR required (date outside current/previous month, IST).
                    </div>
                  )}
                </td>
                <td className={tdCls}>
                  <span className="text-slate-600">{row.item.approvedBy || row.item.rejectedBy || '—'}</span>
                </td>
                <td className={tdCls}>
                  {row.item.approvedAt || row.item.rejectedAt ? (
                    <div className="text-slate-600">
                      <div>{new Date(row.item.approvedAt || row.item.rejectedAt!).toLocaleDateString('en-GB')}</div>
                      <div className="text-xs text-slate-500">
                        {new Date(row.item.approvedAt || row.item.rejectedAt!).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </div>
                    </div>
                  ) : (
                    <span className="text-slate-400">—</span>
                  )}
                </td>
                <td className={tdCls}>
                  <span className="text-slate-600">
                    {row.item.approvedByEmail || row.item.rejectedByEmail || '—'}
                  </span>
                </td>
                <td className={tdCls}>
                  <span className="text-slate-600">
                    {row.item.hrValue ||
                      (row.item.status === 'PendingHr' ? row.item.partnerProposedValue : '') ||
                      '—'}
                  </span>
                </td>
                <td className={tdCls}>
                  <span className="text-slate-600">{row.item.partnerName}</span>
                </td>
                <td className={tdCls}>
                  <div className="text-slate-600">
                    <div>{new Date(row.item.createdAt).toLocaleDateString('en-GB')}</div>
                    <div className="text-xs text-slate-500">
                      {new Date(row.item.createdAt).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </div>
                  </div>
                </td>
                {isAdminView && (
                  <td className={tdCls}>
                    {row.item.status === 'Pending' || row.item.status === 'PendingHr' ? (
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => openApprovalModal?.(row.item.ids, 'approve')}
                          disabled={processingRequest === row.item.ids[0]}
                          className="rounded-md bg-emerald-600 px-2 py-1 text-xs font-medium text-white transition-colors hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 disabled:opacity-50"
                        >
                          {processingRequest === row.item.ids[0] ? '…' : 'Approve'}
                        </button>
                        <button
                          type="button"
                          onClick={() => openApprovalModal?.(row.item.ids, 'reject')}
                          disabled={processingRequest === row.item.ids[0]}
                          className="rounded-md bg-rose-600 px-2 py-1 text-xs font-medium text-white transition-colors hover:bg-rose-700 focus:outline-none focus:ring-2 focus:ring-rose-500/40 disabled:opacity-50"
                        >
                          {processingRequest === row.item.ids[0] ? '…' : 'Reject'}
                        </button>
                      </div>
                    ) : null}
                  </td>
                )}
              </tr>
            ) : (
              <tr
                key={row.item._id}
                className={`transition-colors ${pendingHrRow(row.item.status)}`}
              >
                <td className={tdCls}>
                  <div>
                    <div className="font-medium text-slate-900">{row.item.userName}</div>
                    <div className="text-xs text-slate-500">{row.item.userId?.designation || 'Employee'}</div>
                  </div>
                </td>
                <td className={tdCls}>
                  <div className="text-slate-800">{formatAttendanceRequestDate(row.item.date)}</div>
                </td>
                <td className={tdCls}>
                  <span className="font-medium text-slate-900">{row.item.requestedStatus}</span>
                </td>
                <td className={tdCls}>
                  <span className="text-slate-600">
                    {row.item.startTime && row.item.endTime
                      ? `${row.item.startTime} - ${row.item.endTime}`
                      : '—'}
                  </span>
                </td>
                <td className={tdCls}>
                  <span className="block max-w-xs truncate text-slate-600" title={row.item.reason}>
                    {row.item.reason || '—'}
                  </span>
                </td>
                <td className={tdCls}>
                  <div
                    className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${getStatusBadgeColor(row.item.status)}`}
                  >
                    {getStatusIcon(row.item.status)}
                    {formatStatusLabel(row.item.status)}
                  </div>
                  {row.item.status === 'PendingHr' && (
                    <div className="mt-1 max-w-xs text-xs leading-snug text-rose-800">
                      Partner approved — HR required (date outside current/previous month, IST).
                    </div>
                  )}
                </td>
                <td className={tdCls}>
                  <span className="text-slate-600">{row.item.approvedBy || row.item.rejectedBy || '—'}</span>
                </td>
                <td className={tdCls}>
                  {row.item.approvedAt || row.item.rejectedAt ? (
                    <div className="text-slate-600">
                      <div>{new Date(row.item.approvedAt || row.item.rejectedAt!).toLocaleDateString('en-GB')}</div>
                      <div className="text-xs text-slate-500">
                        {new Date(row.item.approvedAt || row.item.rejectedAt!).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </div>
                    </div>
                  ) : (
                    <span className="text-slate-400">—</span>
                  )}
                </td>
                <td className={tdCls}>
                  <span className="text-slate-600">
                    {row.item.approvedByEmail || row.item.rejectedByEmail || '—'}
                  </span>
                </td>
                <td className={tdCls}>
                  <span className="text-slate-600">
                    {row.item.hrValue ||
                      (row.item.status === 'PendingHr' ? row.item.partnerProposedValue : '') ||
                      '—'}
                  </span>
                </td>
                <td className={tdCls}>
                  <span className="text-slate-600">{row.item.partnerName}</span>
                </td>
                <td className={tdCls}>
                  <div className="text-slate-600">
                    <div>{new Date(row.item.createdAt).toLocaleDateString('en-GB')}</div>
                    <div className="text-xs text-slate-500">
                      {new Date(row.item.createdAt).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </div>
                  </div>
                </td>
                {isAdminView && (
                  <td className={tdCls}>
                    {row.item.status === 'Pending' || row.item.status === 'PendingHr' ? (
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => openApprovalModal?.(row.item._id, 'approve')}
                          disabled={processingRequest === row.item._id}
                          className="rounded-md bg-emerald-600 px-2 py-1 text-xs font-medium text-white transition-colors hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 disabled:opacity-50"
                        >
                          {processingRequest === row.item._id ? '…' : 'Approve'}
                        </button>
                        <button
                          type="button"
                          onClick={() => openApprovalModal?.(row.item._id, 'reject')}
                          disabled={processingRequest === row.item._id}
                          className="rounded-md bg-rose-600 px-2 py-1 text-xs font-medium text-white transition-colors hover:bg-rose-700 focus:outline-none focus:ring-2 focus:ring-rose-500/40 disabled:opacity-50"
                        >
                          {processingRequest === row.item._id ? '…' : 'Reject'}
                        </button>
                      </div>
                    ) : null}
                  </td>
                )}
              </tr>
            )
          )}
        </tbody>
      </table>
    </div>
  );
};
