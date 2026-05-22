'use client';

import React from 'react';
import type { AttendanceRequest, RequestsAdminActionsProps } from '../../types';
import { formatStatusLabel, getStatusBadgeColor, getStatusIcon } from '../../utils/requestStatus';

export interface IndividualRequestCardProps extends RequestsAdminActionsProps {
  request: AttendanceRequest;
}

export const IndividualRequestCard: React.FC<IndividualRequestCardProps> = ({
  request,
  isAdminView = false,
  hrAdminHighlight = false,
  processingRequest,
  openApprovalModal,
}) => {
  const cardHr = hrAdminHighlight && request.status === 'PendingHr';

  return (
    <div
      className={`rounded-lg border p-4 shadow-sm transition-colors ${
        cardHr
          ? 'border-rose-400 bg-rose-50 ring-1 ring-rose-200 hover:border-rose-500'
          : 'border-blue-200/65 bg-panel hover:border-slate-300 hover:bg-slate-50/60'
      }`}
    >
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex flex-wrap items-center gap-2">
            <h3 className="font-medium text-slate-900">{request.userName}</h3>
            <span className="text-xs text-slate-400" aria-hidden>
              •
            </span>
            <span className="text-xs text-slate-600">{request.userId?.designation || 'Employee'}</span>
          </div>
          <p className="text-sm text-slate-700">
            Requested: <span className="font-medium text-slate-900">{request.requestedStatus}</span>
            {request.originalStatus && (
              <>
                {' '}
                from <span className="text-slate-600">{request.originalStatus}</span>
              </>
            )}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            Date: {new Date(request.date).toLocaleDateString('en-GB')}
            {request.startTime && request.endTime && (
              <>
                {' '}
                • {request.startTime} - {request.endTime}
              </>
            )}
          </p>
        </div>

        <div
          className={`flex shrink-0 items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium ${getStatusBadgeColor(request.status)}`}
        >
          {getStatusIcon(request.status)}
          {formatStatusLabel(request.status)}
        </div>
      </div>

      {request.status === 'PendingHr' && (
        <div className="mb-3 rounded-md border border-rose-200 bg-rose-100/80 px-3 py-2 text-sm text-rose-900">
          Partner approved — <strong>HR approval required</strong> (attendance date outside the current or previous
          calendar month, IST).
        </div>
      )}

      {request.reason && (
        <div className="mb-3">
          <p className="mb-1 text-xs font-medium text-slate-600">Reason</p>
          <p className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800">{request.reason}</p>
        </div>
      )}

      {request.partnerRemarks && request.status !== 'Pending' && (
        <div className="mb-3">
          <p className="mb-1 text-xs font-medium text-slate-600">Partner remarks</p>
          <p className="rounded-md border border-slate-200 border-l-4 border-l-emerald-500 bg-slate-50 px-3 py-2 text-sm text-slate-800">
            {request.partnerRemarks}
          </p>
        </div>
      )}

      {(request.approvedBy || request.rejectedBy) && (
        <div className="mb-3">
          <p className="mb-1 text-xs font-medium text-slate-600">
            {request.status === 'Approved' ? 'Approved' : 'Rejected'} by
          </p>
          <p className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800">
            {request.approvedBy || request.rejectedBy}
            {(request.approvedAt || request.rejectedAt) && (
              <span className="ml-2 text-xs text-slate-500">
                on{' '}
                {new Date(request.approvedAt || request.rejectedAt!).toLocaleDateString('en-GB', {
                  year: 'numeric',
                  month: '2-digit',
                  day: '2-digit',
                }) +
                  ' ' +
                  new Date(request.approvedAt || request.rejectedAt!).toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
              </span>
            )}
          </p>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
        <span>Partner: {request.partnerName}</span>
        <span>Submitted: {new Date(request.createdAt).toLocaleDateString('en-GB')}</span>
      </div>

      {isAdminView && (request.status === 'Pending' || request.status === 'PendingHr') && (
        <div className="mt-3 flex gap-2 border-t border-slate-200 pt-3">
          <button
            type="button"
            onClick={() => openApprovalModal?.(request._id, 'approve')}
            disabled={processingRequest === request._id}
            className="flex-1 rounded-md bg-emerald-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 disabled:opacity-50"
          >
            {processingRequest === request._id ? 'Processing...' : 'Approve'}
          </button>
          <button
            type="button"
            onClick={() => openApprovalModal?.(request._id, 'reject')}
            disabled={processingRequest === request._id}
            className="flex-1 rounded-md bg-rose-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-rose-700 focus:outline-none focus:ring-2 focus:ring-rose-500/40 disabled:opacity-50"
          >
            {processingRequest === request._id ? 'Processing...' : 'Reject'}
          </button>
        </div>
      )}
    </div>
  );
};
