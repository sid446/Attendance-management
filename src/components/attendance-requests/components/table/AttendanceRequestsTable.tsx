'use client';

import React from 'react';
import type { AttendanceRequest, DateRangeGroup, RequestsAdminActionsProps } from '../../types';
import { formatStatusLabel, getStatusBadgeColor, getStatusIcon } from '../../utils/requestStatus';

export interface AttendanceRequestsTableProps extends RequestsAdminActionsProps {
  rangeGroups: DateRangeGroup[];
  individualRequests: AttendanceRequest[];
}

export const AttendanceRequestsTable: React.FC<AttendanceRequestsTableProps> = ({
  rangeGroups,
  individualRequests,
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
          {rangeGroups.map((group) => (
            <tr key={`range-${group.ids.join('-')}`} className={`transition-colors ${pendingHrRow(group.status)}`}>
              <td className={tdCls}>
                <div>
                  <div className="font-medium text-slate-900">{group.userName}</div>
                  <div className="text-xs text-slate-500">{group.designation || 'Employee'}</div>
                </div>
              </td>
              <td className={tdCls}>
                <div className="text-slate-800">
                  {new Date(group.startDate).toLocaleDateString('en-GB')} –{' '}
                  {new Date(group.endDate).toLocaleDateString('en-GB')}
                </div>
              </td>
              <td className={tdCls}>
                <span className="font-medium text-slate-900">{group.requestedStatus}</span>
              </td>
              <td className={tdCls}>
                <span className="text-slate-600">
                  {group.startTime && group.endTime ? `${group.startTime} - ${group.endTime}` : '—'}
                </span>
              </td>
              <td className={tdCls}>
                <span className="block max-w-xs truncate text-slate-600" title={group.reason}>
                  {group.reason || '—'}
                </span>
              </td>
              <td className={tdCls}>
                <div
                  className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${getStatusBadgeColor(group.status)}`}
                >
                  {getStatusIcon(group.status)}
                  {formatStatusLabel(group.status)}
                </div>
                {group.status === 'PendingHr' && (
                  <div className="mt-1 max-w-xs text-xs leading-snug text-rose-800">
                    Partner approved — HR required (date outside current/previous month, IST).
                  </div>
                )}
              </td>
              <td className={tdCls}>
                <span className="text-slate-600">{group.approvedBy || group.rejectedBy || '—'}</span>
              </td>
              <td className={tdCls}>
                {group.approvedAt || group.rejectedAt ? (
                  <div className="text-slate-600">
                    <div>{new Date(group.approvedAt || group.rejectedAt!).toLocaleDateString('en-GB')}</div>
                    <div className="text-xs text-slate-500">
                      {new Date(group.approvedAt || group.rejectedAt!).toLocaleTimeString([], {
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
                <span className="text-slate-600">{group.approvedByEmail || group.rejectedByEmail || '—'}</span>
              </td>
              <td className={tdCls}>
                <span className="text-slate-600">
                  {group.hrValue || (group.status === 'PendingHr' ? group.partnerProposedValue : '') || '—'}
                </span>
              </td>
              <td className={tdCls}>
                <span className="text-slate-600">{group.partnerName}</span>
              </td>
              <td className={tdCls}>
                <div className="text-slate-600">
                  <div>{new Date(group.createdAt).toLocaleDateString('en-GB')}</div>
                  <div className="text-xs text-slate-500">
                    {new Date(group.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </div>
                </div>
              </td>
              {isAdminView && (
                <td className={tdCls}>
                  {group.status === 'Pending' || group.status === 'PendingHr' ? (
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => openApprovalModal?.(group.ids, 'approve')}
                        disabled={processingRequest === group.ids[0]}
                        className="rounded-md bg-emerald-600 px-2 py-1 text-xs font-medium text-white transition-colors hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 disabled:opacity-50"
                      >
                        {processingRequest === group.ids[0] ? '…' : 'Approve'}
                      </button>
                      <button
                        type="button"
                        onClick={() => openApprovalModal?.(group.ids, 'reject')}
                        disabled={processingRequest === group.ids[0]}
                        className="rounded-md bg-rose-600 px-2 py-1 text-xs font-medium text-white transition-colors hover:bg-rose-700 focus:outline-none focus:ring-2 focus:ring-rose-500/40 disabled:opacity-50"
                      >
                        {processingRequest === group.ids[0] ? '…' : 'Reject'}
                      </button>
                    </div>
                  ) : null}
                </td>
              )}
            </tr>
          ))}

          {individualRequests.map((request) => (
            <tr key={request._id} className={`transition-colors ${pendingHrRow(request.status)}`}>
              <td className={tdCls}>
                <div>
                  <div className="font-medium text-slate-900">{request.userName}</div>
                  <div className="text-xs text-slate-500">{request.userId?.designation || 'Employee'}</div>
                </div>
              </td>
              <td className={tdCls}>
                <div className="text-slate-800">{new Date(request.date).toLocaleDateString('en-GB')}</div>
              </td>
              <td className={tdCls}>
                <span className="font-medium text-slate-900">{request.requestedStatus}</span>
              </td>
              <td className={tdCls}>
                <span className="text-slate-600">
                  {request.startTime && request.endTime ? `${request.startTime} - ${request.endTime}` : '—'}
                </span>
              </td>
              <td className={tdCls}>
                <span className="block max-w-xs truncate text-slate-600" title={request.reason}>
                  {request.reason || '—'}
                </span>
              </td>
              <td className={tdCls}>
                <div
                  className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${getStatusBadgeColor(request.status)}`}
                >
                  {getStatusIcon(request.status)}
                  {formatStatusLabel(request.status)}
                </div>
                {request.status === 'PendingHr' && (
                  <div className="mt-1 max-w-xs text-xs leading-snug text-rose-800">
                    Partner approved — HR required (date outside current/previous month, IST).
                  </div>
                )}
              </td>
              <td className={tdCls}>
                <span className="text-slate-600">{request.approvedBy || request.rejectedBy || '—'}</span>
              </td>
              <td className={tdCls}>
                {request.approvedAt || request.rejectedAt ? (
                  <div className="text-slate-600">
                    <div>{new Date(request.approvedAt || request.rejectedAt!).toLocaleDateString('en-GB')}</div>
                    <div className="text-xs text-slate-500">
                      {new Date(request.approvedAt || request.rejectedAt!).toLocaleTimeString([], {
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
                <span className="text-slate-600">{request.approvedByEmail || request.rejectedByEmail || '—'}</span>
              </td>
              <td className={tdCls}>
                <span className="text-slate-600">
                  {request.hrValue || (request.status === 'PendingHr' ? request.partnerProposedValue : '') || '—'}
                </span>
              </td>
              <td className={tdCls}>
                <span className="text-slate-600">{request.partnerName}</span>
              </td>
              <td className={tdCls}>
                <div className="text-slate-600">
                  <div>{new Date(request.createdAt).toLocaleDateString('en-GB')}</div>
                  <div className="text-xs text-slate-500">
                    {new Date(request.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </div>
                </div>
              </td>
              {isAdminView && (
                <td className={tdCls}>
                  {request.status === 'Pending' || request.status === 'PendingHr' ? (
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => openApprovalModal?.(request._id, 'approve')}
                        disabled={processingRequest === request._id}
                        className="rounded-md bg-emerald-600 px-2 py-1 text-xs font-medium text-white transition-colors hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 disabled:opacity-50"
                      >
                        {processingRequest === request._id ? '…' : 'Approve'}
                      </button>
                      <button
                        type="button"
                        onClick={() => openApprovalModal?.(request._id, 'reject')}
                        disabled={processingRequest === request._id}
                        className="rounded-md bg-rose-600 px-2 py-1 text-xs font-medium text-white transition-colors hover:bg-rose-700 focus:outline-none focus:ring-2 focus:ring-rose-500/40 disabled:opacity-50"
                      >
                        {processingRequest === request._id ? '…' : 'Reject'}
                      </button>
                    </div>
                  ) : null}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};
