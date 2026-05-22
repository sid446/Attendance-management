'use client';

import React from 'react';
import { Calendar } from 'lucide-react';
import type { DateRangeGroup, RequestsAdminActionsProps } from '../../types';
import { formatStatusLabel, getStatusBlockColor, getStatusIcon } from '../../utils/requestStatus';

export interface DateRangeRequestBlockProps extends RequestsAdminActionsProps {
  rangeGroup: DateRangeGroup;
}

const formatDateRange = (startDate: string, endDate: string) => {
  const start = new Date(startDate);
  const end = new Date(endDate);
  if (start.toDateString() === end.toDateString()) {
    return start.toLocaleDateString('en-GB');
  }
  return `${start.toLocaleDateString('en-GB')} - ${end.toLocaleDateString('en-GB')}`;
};

export const DateRangeRequestBlock: React.FC<DateRangeRequestBlockProps> = ({
  rangeGroup,
  isAdminView = false,
  hrAdminHighlight = false,
  processingRequest,
  openApprovalModal,
}) => {
  const blockHr = hrAdminHighlight && rangeGroup.status === 'PendingHr';

  return (
    <div
      className={`mb-4 rounded-lg border p-4 shadow-sm ${blockHr ? 'border-rose-400 bg-rose-50 ring-1 ring-rose-200' : getStatusBlockColor(rangeGroup.status)}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <Calendar className="h-4 w-4 shrink-0 text-slate-500" aria-hidden />
            <span className="font-medium text-slate-900">
              {rangeGroup.userName}
              {rangeGroup.designation && (
                <span className="ml-1 text-sm font-normal text-slate-600">({rangeGroup.designation})</span>
              )}
            </span>
            <span className="text-sm text-slate-600">via {rangeGroup.partnerName}</span>
          </div>

          <div className="mb-2">
            <span className="font-medium text-slate-700">Date range: </span>
            <span className="text-slate-900">{formatDateRange(rangeGroup.startDate, rangeGroup.endDate)}</span>
            <span className="ml-2 text-sm text-slate-600">
              ({rangeGroup.dates.length} {rangeGroup.dates.length === 1 ? 'day' : 'days'})
            </span>
          </div>

          <div className="mb-2">
            <span className="font-medium text-slate-700">Requested: </span>
            <span className="text-slate-900">{rangeGroup.requestedStatus}</span>
            {rangeGroup.startTime && rangeGroup.endTime && (
              <span className="ml-2 text-sm text-slate-600">
                ({rangeGroup.startTime} - {rangeGroup.endTime})
              </span>
            )}
          </div>

          {rangeGroup.reason && (
            <div className="mb-2">
              <span className="font-medium text-slate-700">Reason: </span>
              <span className="text-slate-900">{rangeGroup.reason}</span>
            </div>
          )}

          {rangeGroup.status === 'PendingHr' && (
            <div className="mb-2 rounded-md border border-rose-200 bg-rose-100/80 px-3 py-2 text-sm text-rose-900">
              Partner approved — <strong>HR approval required</strong> (attendance date outside the current or previous
              calendar month, IST). Final approval updates attendance.
            </div>
          )}

          {rangeGroup.partnerRemarks && (
            <div className="mb-2">
              <span className="font-medium text-slate-700">Partner remarks: </span>
              <span className="text-slate-900">{rangeGroup.partnerRemarks}</span>
            </div>
          )}

          {(rangeGroup.approvedBy || rangeGroup.rejectedBy) && (
            <div className="mb-2">
              <span className="font-medium text-slate-700">
                {rangeGroup.status === 'Approved' ? 'Approved' : 'Rejected'} by:{' '}
              </span>
              <span className="text-slate-900">
                {rangeGroup.approvedBy || rangeGroup.rejectedBy}
                {(rangeGroup.approvedAt || rangeGroup.rejectedAt) && (
                  <span className="ml-2 text-xs text-slate-500">
                    on {new Date(rangeGroup.approvedAt || rangeGroup.rejectedAt!).toLocaleDateString('en-GB')}{' '}
                    {new Date(rangeGroup.approvedAt || rangeGroup.rejectedAt!).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                )}
              </span>
            </div>
          )}

          <div className="text-xs text-slate-500">
            Requested on {new Date(rangeGroup.createdAt).toLocaleDateString('en-GB')}{' '}
            {new Date(rangeGroup.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </div>
        </div>

        <div className="flex shrink-0 flex-col items-end gap-2 sm:flex-row sm:items-center">
          <div className="flex items-center gap-2">
            {getStatusIcon(rangeGroup.status, 'md')}
            <span
              className={`text-sm font-medium ${
                rangeGroup.status === 'Approved'
                  ? 'text-emerald-800'
                  : rangeGroup.status === 'Rejected'
                    ? 'text-rose-800'
                    : rangeGroup.status === 'PendingHr'
                      ? 'text-rose-800'
                      : 'text-amber-800'
              }`}
            >
              {formatStatusLabel(rangeGroup.status)}
            </span>
          </div>
          {isAdminView && (rangeGroup.status === 'Pending' || rangeGroup.status === 'PendingHr') && (
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => openApprovalModal?.(rangeGroup.ids[0], 'approve')}
                disabled={processingRequest === rangeGroup.ids[0]}
                className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 disabled:opacity-50"
              >
                {processingRequest === rangeGroup.ids[0] ? 'Processing...' : 'Approve'}
              </button>
              <button
                type="button"
                onClick={() => openApprovalModal?.(rangeGroup.ids[0], 'reject')}
                disabled={processingRequest === rangeGroup.ids[0]}
                className="rounded-md bg-rose-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-rose-700 focus:outline-none focus:ring-2 focus:ring-rose-500/40 disabled:opacity-50"
              >
                {processingRequest === rangeGroup.ids[0] ? 'Processing...' : 'Reject'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
