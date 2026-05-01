import React, { useState, useEffect } from 'react';
import { Clock, CheckCircle, XCircle, AlertCircle, RefreshCw, Calendar, Download, Table, LayoutGrid } from 'lucide-react';
import * as XLSX from 'xlsx';

interface AttendanceRequest {
  _id: string;
  userId: {
    _id: string;
    name: string;
    email: string;
    designation?: string;
  };
  userName: string;
  partnerName: string;
  date: string;
  monthYear: string;
  requestedStatus: string;
  originalStatus: string;
  reason?: string;
  partnerRemarks?: string;
  status: 'Pending' | 'Approved' | 'Rejected';
  startTime?: string;
  endTime?: string;
  approvedBy?: string;
  approvedByEmail?: string;
  approvedAt?: string;
  rejectedBy?: string;
  rejectedByEmail?: string;
  rejectedAt?: string;
  hrRemarks?: string;
  hrValue?: string; // HR value when approved by HR
  createdAt: string;
  updatedAt: string;
}

interface DateRangeGroup {
  userName: string;
  userId: string;
  designation?: string;
  partnerName: string;
  requestedStatus: string;
  reason?: string;
  partnerRemarks?: string;
  status: 'Pending' | 'Approved' | 'Rejected';
  dates: string[];
  startDate: string;
  endDate: string;
  startTime?: string;
  endTime?: string;
  approvedBy?: string;
  approvedByEmail?: string;
  approvedAt?: string;
  rejectedBy?: string;
  rejectedByEmail?: string;
  rejectedAt?: string;
  hrValue?: string;
  hrRemarks?: string;
  createdAt: string;
  ids: string[]; // Array of request IDs for this range
}

interface AttendanceRequestsSectionProps {
  userId?: string;
  partnerName?: string;
  isEmployeeView?: boolean;
  isAdminView?: boolean;
  userRole?: 'HR' | 'Partner';
  onRequestUpdate?: () => void;
}

const REQUESTS_WORKFLOW_STEPS = ['Set filters', 'Table or cards', 'Export or act on pending'] as const;

// Component for displaying a range of consecutive dates as a single block
const DateRangeRequestBlock: React.FC<{
  rangeGroup: DateRangeGroup;
  isAdminView?: boolean;
  onApproveReject?: (requestId: string | string[], action: 'approve' | 'reject', remarks?: string) => void;
  processingRequest?: string | null;
  openApprovalModal?: (requestId: string | string[], action: 'approve' | 'reject') => void;
}> = ({ rangeGroup, isAdminView = false, onApproveReject, processingRequest, openApprovalModal }) => {
  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'Approved':
        return <CheckCircle className="h-5 w-5 text-emerald-600" aria-hidden />;
      case 'Rejected':
        return <XCircle className="h-5 w-5 text-rose-600" aria-hidden />;
      case 'Pending':
        return <Clock className="h-5 w-5 text-amber-600" aria-hidden />;
      default:
        return <AlertCircle className="h-5 w-5 text-slate-500" aria-hidden />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Approved':
        return 'border-emerald-200 bg-emerald-50';
      case 'Rejected':
        return 'border-rose-200 bg-rose-50';
      case 'Pending':
        return 'border-amber-200 bg-amber-50';
      default:
        return 'border-slate-200 bg-slate-50';
    }
  };

  const formatDateRange = (startDate: string, endDate: string) => {
    const start = new Date(startDate);
    const end = new Date(endDate);

    if (start.toDateString() === end.toDateString()) {
      return start.toLocaleDateString('en-GB');
    }

    return `${start.toLocaleDateString('en-GB')} - ${end.toLocaleDateString('en-GB')}`;
  };

  return (
    <div className={`mb-4 rounded-lg border p-4 shadow-sm ${getStatusColor(rangeGroup.status)}`}>
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

          {rangeGroup.partnerRemarks && (
            <div className="mb-2">
              <span className="font-medium text-slate-700">Partner remarks: </span>
              <span className="text-slate-900">{rangeGroup.partnerRemarks}</span>
            </div>
          )}

          {(rangeGroup.approvedBy || rangeGroup.rejectedBy) && (
            <div className="mb-2">
              <span className="font-medium text-slate-700">
                {rangeGroup.status === 'Approved' ? 'Approved' : 'Rejected'} by: </span>
              <span className="text-slate-900">
                {rangeGroup.approvedBy || rangeGroup.rejectedBy}
                {(rangeGroup.approvedAt || rangeGroup.rejectedAt) && (
                  <span className="ml-2 text-xs text-slate-500">
                    on {new Date(rangeGroup.approvedAt || rangeGroup.rejectedAt!).toLocaleDateString('en-GB')} {new Date(rangeGroup.approvedAt || rangeGroup.rejectedAt!).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                )}
              </span>
            </div>
          )}

          <div className="text-xs text-slate-500">
            Requested on {new Date(rangeGroup.createdAt).toLocaleDateString('en-GB')} {new Date(rangeGroup.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </div>
        </div>

        <div className="flex shrink-0 flex-col items-end gap-2 sm:flex-row sm:items-center">
          <div className="flex items-center gap-2">
            {getStatusIcon(rangeGroup.status)}
            <span
              className={`text-sm font-medium ${
                rangeGroup.status === 'Approved'
                  ? 'text-emerald-800'
                  : rangeGroup.status === 'Rejected'
                    ? 'text-rose-800'
                    : 'text-amber-800'
              }`}
            >
              {rangeGroup.status}
            </span>
          </div>
          {isAdminView && rangeGroup.status === 'Pending' && (
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => openApprovalModal && openApprovalModal(rangeGroup.ids[0], 'approve')}
                disabled={processingRequest === rangeGroup.ids[0]}
                className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 disabled:opacity-50"
              >
                {processingRequest === rangeGroup.ids[0] ? 'Processing...' : 'Approve'}
              </button>
              <button
                type="button"
                onClick={() => openApprovalModal && openApprovalModal(rangeGroup.ids[0], 'reject')}
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
// Function to group requests into ranges based on creation time proximity
const groupRequestsIntoRanges = (requests: AttendanceRequest[]): {
  rangeGroups: DateRangeGroup[];
  individualRequests: AttendanceRequest[];
} => {
  const rangeGroups: DateRangeGroup[] = [];
  const individualRequests: AttendanceRequest[] = [];

  // Group requests by user, status, reason, and partner
  const groupedByCriteria = new Map<string, AttendanceRequest[]>();

  requests.forEach(request => {
    // Include request.status (Pending/Approved/Rejected) in the key to avoid mixing them
    const key = `${request.userId._id}-${request.requestedStatus}-${request.status}-${request.reason || ''}-${request.partnerName}`;
    if (!groupedByCriteria.has(key)) {
      groupedByCriteria.set(key, []);
    }
    groupedByCriteria.get(key)!.push(request);
  });

  // For each group, check if they were created within a short time window (indicating range request)
  groupedByCriteria.forEach(requests => {
    if (requests.length === 1) {
      // Single request - treat as individual
      individualRequests.push(requests[0]);
      return;
    }

    // Sort by creation time
    requests.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

    // Check if requests were created within 5 minutes of each other (indicating range request)
    const timeWindow = 5 * 60 * 1000; // 5 minutes in milliseconds
    const ranges: AttendanceRequest[][] = [];
    let currentRange: AttendanceRequest[] = [requests[0]];

    for (let i = 1; i < requests.length; i++) {
      const prevTime = new Date(currentRange[currentRange.length - 1].createdAt).getTime();
      const currentTime = new Date(requests[i].createdAt).getTime();
      const timeDiff = currentTime - prevTime;

      if (timeDiff <= timeWindow) {
        // Part of the same range request
        currentRange.push(requests[i]);
      } else {
        // Different request, start new range
        ranges.push(currentRange);
        currentRange = [requests[i]];
      }
    }
    ranges.push(currentRange);

    // Convert ranges to DateRangeGroup objects
    ranges.forEach(range => {
      if (range.length === 1) {
        // Single day in range - treat as individual
        individualRequests.push(range[0]);
      } else {
        // Multiple days from same range request - create range group
        const firstRequest = range[0];
        const lastRequest = range[range.length - 1];

        // Sort range by date for proper start/end dates
        range.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

        rangeGroups.push({
          userName: firstRequest.userName,
          userId: firstRequest.userId._id,
          designation: firstRequest.userId.designation,
          partnerName: firstRequest.partnerName,
          requestedStatus: firstRequest.requestedStatus,
          reason: firstRequest.reason,
          partnerRemarks: firstRequest.partnerRemarks,
          status: firstRequest.status,
          dates: range.map(r => r.date),
          startDate: range[0].date,
          endDate: range[range.length - 1].date,
          startTime: firstRequest.startTime,
          endTime: firstRequest.endTime,
          approvedBy: firstRequest.approvedBy,
          approvedByEmail: firstRequest.approvedByEmail,
          approvedAt: firstRequest.approvedAt,
          rejectedBy: firstRequest.rejectedBy,
          rejectedByEmail: firstRequest.rejectedByEmail,
          rejectedAt: firstRequest.rejectedAt,
          hrValue: firstRequest.hrValue,
          hrRemarks: firstRequest.hrRemarks,
          createdAt: firstRequest.createdAt,
          ids: range.map(r => r._id)
        });
      }
    });
  });

  return { rangeGroups, individualRequests };
};

// Table View Component
const AttendanceRequestsTable: React.FC<{
  rangeGroups: DateRangeGroup[];
  individualRequests: AttendanceRequest[];
  getStatusIcon: (status: string) => React.ReactNode;
  getStatusColor: (status: string) => string;
  isAdminView?: boolean;
  onApproveReject?: (requestId: string | string[], action: 'approve' | 'reject', remarks?: string) => void;
  processingRequest?: string | null;
  openApprovalModal?: (requestId: string | string[], action: 'approve' | 'reject') => void;
}> = ({ rangeGroups, individualRequests, getStatusIcon, getStatusColor, isAdminView = false, onApproveReject, processingRequest, openApprovalModal }) => {
  const thCls =
    'border-b border-slate-200 px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-500';
  const tdCls = 'border-b border-slate-200 px-4 py-3 align-top';
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
            <tr key={`range-${group.ids.join('-')}`} className="transition-colors hover:bg-slate-50/80">
              <td className={tdCls}>
                <div>
                  <div className="font-medium text-slate-900">{group.userName}</div>
                  <div className="text-xs text-slate-500">{group.designation || 'Employee'}</div>
                </div>
              </td>
              <td className={tdCls}>
                <div className="text-slate-800">
                  {new Date(group.startDate).toLocaleDateString('en-GB')} – {new Date(group.endDate).toLocaleDateString('en-GB')}
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
                  className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${getStatusColor(group.status)}`}
                >
                  {getStatusIcon(group.status)}
                  {group.status}
                </div>
              </td>
              <td className={tdCls}>
                <span className="text-slate-600">{group.approvedBy || group.rejectedBy || '—'}</span>
              </td>
              <td className={tdCls}>
                {group.approvedAt || group.rejectedAt ? (
                  <div className="text-slate-600">
                    <div>{new Date(group.approvedAt || group.rejectedAt!).toLocaleDateString('en-GB')}</div>
                    <div className="text-xs text-slate-500">{new Date(group.approvedAt || group.rejectedAt!).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
                  </div>
                ) : (
                  <span className="text-slate-400">—</span>
                )}
              </td>
              <td className={tdCls}>
                <span className="text-slate-600">{group.approvedByEmail || group.rejectedByEmail || '—'}</span>
              </td>
              <td className={tdCls}>
                <span className="text-slate-600">{group.hrValue || '—'}</span>
              </td>
              <td className={tdCls}>
                <span className="text-slate-600">{group.partnerName}</span>
              </td>
              <td className={tdCls}>
                <div className="text-slate-600">
                  <div>{new Date(group.createdAt).toLocaleDateString('en-GB')}</div>
                  <div className="text-xs text-slate-500">{new Date(group.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
                </div>
              </td>
              {isAdminView && (
                <td className={tdCls}>
                  {group.status === 'Pending' && (
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => openApprovalModal && openApprovalModal(group.ids, 'approve')}
                        disabled={processingRequest === group.ids[0]}
                        className="rounded-md bg-emerald-600 px-2 py-1 text-xs font-medium text-white transition-colors hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 disabled:opacity-50"
                      >
                        {processingRequest === group.ids[0] ? '…' : 'Approve'}
                      </button>
                      <button
                        type="button"
                        onClick={() => openApprovalModal && openApprovalModal(group.ids, 'reject')}
                        disabled={processingRequest === group.ids[0]}
                        className="rounded-md bg-rose-600 px-2 py-1 text-xs font-medium text-white transition-colors hover:bg-rose-700 focus:outline-none focus:ring-2 focus:ring-rose-500/40 disabled:opacity-50"
                      >
                        {processingRequest === group.ids[0] ? '…' : 'Reject'}
                      </button>
                    </div>
                  )}
                </td>
              )}
            </tr>
          ))}

          {individualRequests.map((request) => (
            <tr key={request._id} className="transition-colors hover:bg-slate-50/80">
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
                  className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${getStatusColor(request.status)}`}
                >
                  {getStatusIcon(request.status)}
                  {request.status}
                </div>
              </td>
              <td className={tdCls}>
                <span className="text-slate-600">{request.approvedBy || request.rejectedBy || '—'}</span>
              </td>
              <td className={tdCls}>
                {request.approvedAt || request.rejectedAt ? (
                  <div className="text-slate-600">
                    <div>{new Date(request.approvedAt || request.rejectedAt!).toLocaleDateString('en-GB')}</div>
                    <div className="text-xs text-slate-500">{new Date(request.approvedAt || request.rejectedAt!).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
                  </div>
                ) : (
                  <span className="text-slate-400">—</span>
                )}
              </td>
              <td className={tdCls}>
                <span className="text-slate-600">{request.approvedByEmail || request.rejectedByEmail || '—'}</span>
              </td>
              <td className={tdCls}>
                <span className="text-slate-600">{request.hrValue || '—'}</span>
              </td>
              <td className={tdCls}>
                <span className="text-slate-600">{request.partnerName}</span>
              </td>
              <td className={tdCls}>
                <div className="text-slate-600">
                  <div>{new Date(request.createdAt).toLocaleDateString('en-GB')}</div>
                  <div className="text-xs text-slate-500">{new Date(request.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
                </div>
              </td>
              {isAdminView && (
                <td className={tdCls}>
                  {request.status === 'Pending' && (
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => openApprovalModal && openApprovalModal(request._id, 'approve')}
                        disabled={processingRequest === request._id}
                        className="rounded-md bg-emerald-600 px-2 py-1 text-xs font-medium text-white transition-colors hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 disabled:opacity-50"
                      >
                        {processingRequest === request._id ? '…' : 'Approve'}
                      </button>
                      <button
                        type="button"
                        onClick={() => openApprovalModal && openApprovalModal(request._id, 'reject')}
                        disabled={processingRequest === request._id}
                        className="rounded-md bg-rose-600 px-2 py-1 text-xs font-medium text-white transition-colors hover:bg-rose-700 focus:outline-none focus:ring-2 focus:ring-rose-500/40 disabled:opacity-50"
                      >
                        {processingRequest === request._id ? '…' : 'Reject'}
                      </button>
                    </div>
                  )}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export const AttendanceRequestsSection: React.FC<AttendanceRequestsSectionProps> = ({
  userId,
  partnerName,
  isEmployeeView = false,
  isAdminView = false,
  userRole = 'Partner',
  onRequestUpdate
}) => {
  const [requests, setRequests] = useState<AttendanceRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'Pending' | 'Approved' | 'Rejected'>('all');
  const [monthFilter, setMonthFilter] = useState<string>('all');
  const [leaveTypeFilter, setLeaveTypeFilter] = useState<string>('all');
  const [viewMode, setViewMode] = useState<'cards' | 'table'>('table');
  const [processingRequest, setProcessingRequest] = useState<string | null>(null);
  const [showApprovalModal, setShowApprovalModal] = useState(false);
  const [approvalAction, setApprovalAction] = useState<'approve' | 'reject'>('approve');
  const [selectedRequestId, setSelectedRequestId] = useState<string | string[] | null>(null);
  const [approvalRemarks, setApprovalRemarks] = useState('');
  const [approvalValue, setApprovalValue] = useState('');
  // For value cap logic
  const [approvalValueError, setApprovalValueError] = useState<string | null>(null);
  const [modalProcessing, setModalProcessing] = useState(false);

  // Helper function to check if request type has fixed value (no editing allowed)
  const isFixedValueType = (requestedStatus: string): boolean => {
    const status = requestedStatus.toLowerCase();
    return status.includes('half') || status.includes('leave') || requestedStatus === 'On leave';
  };

  // Helper function to get default value based on request type
  const getDefaultValueForType = (requestedStatus: string): string => {
    const status = requestedStatus.toLowerCase();
    if (status.includes('half')) {
      return '0.5';
    }
    if (status.includes('leave') || requestedStatus === 'On leave') {
      return ''; // No value needed for leave
    }
    if (status.includes('wfh')) {
      return '0.75';
    }
    if (status.includes('outstation')) {
      return '1.2';
    }
    return '1';
  };

  // Helper function to get max value for a request type
  const getMaxValueForType = (requestedStatus: string): number | null => {
    const status = requestedStatus.toLowerCase();
    if (status.includes('wfh')) {
      return 0.75;
    }
    if (status.includes('outstation')) {
      return 1.2;
    }
    return null;
  };

  const fetchRequests = async () => {
    try {
      setLoading(true);
      setError(null);

      const params = new URLSearchParams();
      if (userId) params.append('userId', userId);
      if (partnerName) params.append('partnerName', partnerName);

      const response = await fetch(`/api/employee/request-correction?${params}`);
      const result = await response.json();

      if (result.success) {
        setRequests(result.data);
      } else {
        setError(result.error || 'Failed to fetch requests');
      }
    } catch (err) {
      setError('Failed to fetch requests');
    } finally {
      setLoading(false);
    }
  };

  const handleApproveReject = async (requestId: string | string[], action: 'approve' | 'reject', remarks?: string, value?: string) => {
    const requestIds = Array.isArray(requestId) ? requestId : [requestId];
    const processingId = Array.isArray(requestId) ? requestId[0] : requestId; // Use first ID for UI state

    setProcessingRequest(processingId as string);
    try {
      let response;

      if (requestIds.length > 1) {
        // Use bulk action for multiple requests (ranged requests)
        response = await fetch('/api/partner/bulk-action', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            action,
            ids: requestIds,
            remark: remarks,
            value: value ? parseFloat(value) : undefined,
            approvedBy: 'HR',
            approvedByEmail: 'hr@asija.in'
          }),
        });
      } else {
        // Use single approve for individual requests
        response = await fetch('/api/employee/approve', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            requestId: requestIds[0],
            action,
            remarks,
            value,
            approvedBy: 'HR',
            approvedByEmail: 'hr@asija.in'
          }),
        });
      }

      const result = await response.json();

      if (result.success) {
        // Refresh the requests
        await fetchRequests();
        if (onRequestUpdate) {
          onRequestUpdate();
        }
      } else {
        setError(result.error || 'Failed to process request');
      }
    } catch (err) {
      setError('Failed to process request');
    } finally {
      setProcessingRequest(null);
    }
  };

  const openApprovalModal = (requestId: string | string[], action: 'approve' | 'reject') => {
    setSelectedRequestId(requestId);
    setApprovalAction(action);
    setApprovalRemarks('');
    setApprovalValueError(null);
    
    // Pre-set default value based on request type
    if (action === 'approve') {
      const reqIds = Array.isArray(requestId) ? requestId : [requestId];
      const req = requests.find(r => r._id === reqIds[0]);
      if (req) {
        setApprovalValue(getDefaultValueForType(req.requestedStatus));
      } else {
        setApprovalValue('');
      }
    } else {
      setApprovalValue('');
    }
    
    setShowApprovalModal(true);
  };

  const closeApprovalModal = () => {
    setShowApprovalModal(false);
    setSelectedRequestId(null);
    setApprovalRemarks('');
    setApprovalValue('');
    setApprovalValueError(null);
  };

  const handleModalSubmit = async () => {
    if (!selectedRequestId) return;
    if (modalProcessing) return;
    setModalProcessing(true);

    // Value cap logic for approval
    if (approvalAction === 'approve') {
      // Find the request(s) being approved
      let reqs: AttendanceRequest[] = [];
      if (Array.isArray(selectedRequestId)) {
        reqs = requests.filter(r => selectedRequestId.includes(r._id));
      } else {
        const req = requests.find(r => r._id === selectedRequestId);
        if (req) reqs = [req];
      }
      // Only check if value is entered
      if (approvalValue) {
        let maxVal = null;
        let status = reqs[0]?.requestedStatus || '';
        if (status === 'WFH - weekdays' || status === 'WFH - weekoff') {
          maxVal = 0.75;
        } else if (status === 'Present - outstation') {
          maxVal = 1.2;
        }
        if (maxVal !== null) {
          const valNum = parseFloat(approvalValue);
          if (isNaN(valNum) || valNum > maxVal) {
            setApprovalValueError(`Max value for ${status} is ${maxVal}`);
            return;
          }
        }
      }
    }

    setApprovalValueError(null);
    
    // Determine the value to send
    let valueToSend = approvalValue;
    if (approvalAction === 'approve') {
      const reqIds = Array.isArray(selectedRequestId) ? selectedRequestId : [selectedRequestId];
      const req = requests.find(r => r._id === reqIds[0]);
      if (req) {
        // For half-day, always use 0.5
        if (req.requestedStatus.toLowerCase().includes('half')) {
          valueToSend = '0.5';
        }
        // For leave, don't send value
        else if (isFixedValueType(req.requestedStatus)) {
          valueToSend = '';
        }
      }
    }
    
    try {
      await handleApproveReject(selectedRequestId, approvalAction, approvalRemarks, valueToSend);
      setShowApprovalModal(false);
      setSelectedRequestId(null);
    } finally {
      setModalProcessing(false);
    }
  };

  // Approval Modal UI (improved, always rendered)
  const renderApprovalModal = () => {
    if (!showApprovalModal) return null;
    const modalTitleId = 'attendance-request-approval-title';
    return (
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-3 backdrop-blur-sm"
        onClick={closeApprovalModal}
        role="presentation"
      >
        <div
          className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-lg border border-blue-200/65 bg-panel shadow-xl"
          onClick={(e) => e.stopPropagation()}
          role="dialog"
          aria-modal="true"
          aria-labelledby={modalTitleId}
        >
          <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-4 py-3">
            <span id={modalTitleId} className="text-lg font-semibold text-slate-900">
              {approvalAction === 'approve' ? 'Approve request' : 'Reject request'}
            </span>
            <button
              type="button"
              onClick={closeApprovalModal}
              className="rounded-md p-1 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800"
              aria-label="Close"
            >
              <span className="text-xl leading-none" aria-hidden>
                &times;
              </span>
            </button>
          </div>
          <div className="space-y-4 p-4">
            <div>
              <label htmlFor="approval-remarks" className="mb-1 block text-sm font-medium text-slate-700">
                Remarks
              </label>
              <textarea
                id="approval-remarks"
                className="w-full rounded-md border border-blue-200/65 bg-panel p-2 text-sm text-slate-900 shadow-sm placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                rows={3}
                value={approvalRemarks}
                onChange={(e) => setApprovalRemarks(e.target.value)}
                placeholder={approvalAction === 'approve' ? 'Approval remarks (optional)' : 'Reason for rejection'}
              />
            </div>
            {approvalAction === 'approve' && (() => {
              // Get the current request to check its type
              let req: AttendanceRequest | undefined = undefined;
              if (selectedRequestId) {
                if (Array.isArray(selectedRequestId)) {
                  req = requests.find(r => r._id === selectedRequestId[0]);
                } else {
                  req = requests.find(r => r._id === selectedRequestId);
                }
              }
              
              // Don't show value input for On leave
              if (req && isFixedValueType(req.requestedStatus)) {
                // For half-day, show fixed value display
                if (req.requestedStatus.toLowerCase().includes('half')) {
                  return (
                    <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
                      <span className="text-sm text-slate-600">Attendance value: </span>
                      <span className="text-sm font-medium text-slate-900">0.5 days</span>
                      <span className="ml-2 text-xs text-slate-500">(fixed for half-day)</span>
                    </div>
                  );
                }
                // For On leave, no value needed
                return (
                  <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
                    <span className="text-sm text-slate-600">No attendance value required for leave requests</span>
                  </div>
                );
              }
              
              // Show value input for WFH and outstation
              const maxVal = req ? getMaxValueForType(req.requestedStatus) : null;
              
              return (
                <div>
                  <label htmlFor="approval-value" className="mb-1 block text-sm font-medium text-slate-700">
                    Value {maxVal ? <span className="font-normal text-slate-500">(max: {maxVal})</span> : <span className="font-normal text-slate-500">(if applicable)</span>}
                  </label>
                  <input
                    id="approval-value"
                    type="number"
                    step="0.01"
                    min="0"
                    max={maxVal || undefined}
                    className={`w-full rounded-md border bg-panel p-2 text-sm text-slate-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 ${
                      approvalValueError ? 'border-red-500 focus:border-red-500' : 'border-slate-200 focus:border-blue-500'
                    }`}
                    value={approvalValue}
                    onChange={(e) => {
                      let val = e.target.value;
                      if (maxVal && parseFloat(val) > maxVal) {
                        val = maxVal.toString();
                      }
                      setApprovalValue(val);
                      setApprovalValueError(null);
                    }}
                    placeholder={maxVal ? `0.00 - ${maxVal}` : 'Enter value (optional)'}
                  />
                  {approvalValueError && (
                    <div className="mt-1 text-xs text-red-800" role="alert">
                      {approvalValueError}
                    </div>
                  )}
                  {maxVal && <div className="mt-1 text-xs text-amber-800">Max value allowed: {maxVal}</div>}
                </div>
              );
            })()}
            <div className="mt-4 flex justify-end gap-2 border-t border-slate-200 pt-4">
              <button
                onClick={closeApprovalModal}
                className="rounded-md border border-blue-200/65 bg-panel px-4 py-2 text-sm font-medium text-slate-800 shadow-sm transition-colors hover:bg-slate-50"
                type="button"
              >
                Cancel
              </button>
              <button
                onClick={handleModalSubmit}
                disabled={modalProcessing}
                className={`rounded-md px-4 py-2 text-sm font-semibold text-white transition-colors focus:outline-none focus:ring-2 ${
                  approvalAction === 'approve'
                    ? 'bg-emerald-600 hover:bg-emerald-700 focus:ring-emerald-500/40'
                    : 'bg-rose-600 hover:bg-rose-700 focus:ring-rose-500/40'
                } ${modalProcessing ? 'cursor-not-allowed opacity-60' : ''}`}
                type="button"
              >
                {modalProcessing ? 'Processing...' : approvalAction === 'approve' ? 'Approve' : 'Reject'}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  };

  useEffect(() => {
    fetchRequests();
  }, [userId, partnerName]);

  const exportToExcel = async () => {
    const { rangeGroups, individualRequests } = groupRequestsIntoRanges(requests);
    const filteredRangeGroups = rangeGroups.filter(group =>
      (filter === 'all' || group.status === filter) &&
      (monthFilter === 'all' || group.dates.some(date => {
        const requestDate = new Date(date);
        const monthYear = `${requestDate.getFullYear()}-${String(requestDate.getMonth() + 1).padStart(2, '0')}`;
        return monthYear === monthFilter;
      })) &&
      (leaveTypeFilter === 'all' || group.requestedStatus === leaveTypeFilter)
    );
    const filteredIndividualRequests = individualRequests.filter(request =>
      (filter === 'all' || request.status === filter) &&
      (monthFilter === 'all' || request.monthYear === monthFilter) &&
      (leaveTypeFilter === 'all' || request.requestedStatus === leaveTypeFilter)
    );

    // Import ExcelJS dynamically
    const ExcelJS = (await import('exceljs')).default;
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Attendance Requests');

    // Define columns
    worksheet.columns = [
      { header: 'Employee Name', key: 'employeeName', width: 25 },
      { header: 'Designation', key: 'designation', width: 20 },
      { header: 'Partner', key: 'partner', width: 20 },
      { header: 'Start Date', key: 'startDate', width: 15 },
      { header: 'End Date', key: 'endDate', width: 15 },
      { header: 'Days', key: 'days', width: 8 },
      { header: 'Requested Status', key: 'requestedStatus', width: 25 },
      { header: 'Time (Start)', key: 'startTime', width: 12 },
      { header: 'Time (End)', key: 'endTime', width: 12 },
      { header: 'Reason', key: 'reason', width: 35 },
      { header: 'Status', key: 'status', width: 12 },
      { header: 'Action By', key: 'actionBy', width: 20 },
      { header: 'Processed Date', key: 'processedDate', width: 15 },
      { header: 'Processed Time', key: 'processedTime', width: 15 },
      { header: 'Approver Email', key: 'email', width: 30 },
      { header: 'HR Value', key: 'hrValue', width: 10 },
      { header: 'Submitted Date', key: 'submittedDate', width: 15 },
      { header: 'Submitted Time', key: 'submittedTime', width: 15 },
      { header: 'Partner Remarks', key: 'partnerRemarks', width: 35 },
      { header: 'HR Remarks', key: 'hrRemarks', width: 35 },
    ];

    // Add data
    const addRequestRow = (item: any) => {
      const isRange = !!item.dates;
      worksheet.addRow({
        employeeName: item.userName,
        designation: item.designation || (item.userId?.designation) || 'Employee',
        partner: item.partnerName,
        startDate: new Date(isRange ? item.startDate : item.date).toLocaleDateString('en-GB'),
        endDate: new Date(isRange ? item.endDate : item.date).toLocaleDateString('en-GB'),
        days: isRange ? item.dates.length : 1,
        requestedStatus: item.requestedStatus,
        startTime: item.startTime || '',
        endTime: item.endTime || '',
        reason: item.reason || '',
        status: item.status,
        actionBy: item.approvedBy || item.rejectedBy || '-',
        processedDate: (item.approvedAt || item.rejectedAt) ? new Date(item.approvedAt || item.rejectedAt).toLocaleDateString('en-GB') : '-',
        processedTime: (item.approvedAt || item.rejectedAt) ? new Date(item.approvedAt || item.rejectedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '-',
        email: item.approvedByEmail || item.rejectedByEmail || '',
        hrValue: item.hrValue || '',
        submittedDate: new Date(item.createdAt).toLocaleDateString('en-GB'),
        submittedTime: new Date(item.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        partnerRemarks: item.partnerRemarks || '',
        hrRemarks: item.hrRemarks || ''
      });
    };

    filteredRangeGroups.forEach(addRequestRow);
    filteredIndividualRequests.forEach(addRequestRow);

    // Styling
    // 1. Add title row
    const titleText = `Attendance Requests Report - Generated on ${new Date().toLocaleDateString('en-GB')} ${new Date().toLocaleTimeString()}`;
    worksheet.spliceRows(1, 0, [titleText]);
    worksheet.mergeCells(1, 1, 1, worksheet.columns.length);
    worksheet.getRow(1).font = { bold: true, size: 14, color: { argb: 'FFFFFFFF' } };
    worksheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E40AF' } }; // Blue-800
    worksheet.getRow(1).alignment = { vertical: 'middle', horizontal: 'center' };
    worksheet.getRow(1).height = 35;

    // 2. Style Header Row (now row 2)
    const headerRow = worksheet.getRow(2);
    headerRow.height = 25;
    headerRow.eachCell((cell) => {
      cell.font = { bold: true, size: 11, color: { argb: 'FFFFFFFF' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF3B82F6' } }; // Blue-500
      cell.alignment = { vertical: 'middle', horizontal: 'center' };
      cell.border = {
        top: { style: 'thin', color: { argb: 'FF000000' } },
        bottom: { style: 'thin', color: { argb: 'FF000000' } },
        left: { style: 'thin', color: { argb: 'FF000000' } },
        right: { style: 'thin', color: { argb: 'FF000000' } }
      };
    });

    // 3. Style Data Rows
    worksheet.eachRow((row, rowNumber) => {
      if (rowNumber <= 2) return;

      const isEven = rowNumber % 2 === 0;
      row.eachCell((cell, colNumber) => {
        cell.font = { size: 10 };
        cell.alignment = { 
          vertical: 'middle', 
          horizontal: (colNumber <= 3 || colNumber >= 19) ? 'left' : 'center' 
        };
        if (isEven) {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } }; // Slate-100
        }
        cell.border = {
          top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
          bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
          left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
          right: { style: 'thin', color: { argb: 'FFE2E8F0' } }
        };

        // Status column coloring (Col 11)
        if (colNumber === 11) {
          const val = cell.value?.toString();
          if (val === 'Approved') cell.font = { color: { argb: 'FF059669' }, bold: true };
          if (val === 'Rejected') cell.font = { color: { argb: 'FFDC2626' }, bold: true };
          if (val === 'Pending') cell.font = { color: { argb: 'FFD97706' }, bold: true };
        }
      });
    });

    // Auto-save/download
    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Attendance_Requests_${new Date().toISOString().split('T')[0]}.xlsx`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
  };

  // Group requests into ranges and filter
  const { rangeGroups, individualRequests } = groupRequestsIntoRanges(requests);

  const filteredRangeGroups = rangeGroups.filter(group =>
    (filter === 'all' || group.status === filter) &&
    (monthFilter === 'all' || group.dates.some(date => {
      const requestDate = new Date(date);
      const monthYear = `${requestDate.getFullYear()}-${String(requestDate.getMonth() + 1).padStart(2, '0')}`;
      return monthYear === monthFilter;
    })) &&
    (leaveTypeFilter === 'all' || group.requestedStatus === leaveTypeFilter)
  );

  const filteredIndividualRequests = individualRequests.filter(request =>
    (filter === 'all' || request.status === filter) &&
    (monthFilter === 'all' || request.monthYear === monthFilter) &&
    (leaveTypeFilter === 'all' || request.requestedStatus === leaveTypeFilter)
  );

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'Approved':
        return <CheckCircle className="h-4 w-4 text-emerald-600" aria-hidden />;
      case 'Rejected':
        return <XCircle className="h-4 w-4 text-rose-600" aria-hidden />;
      case 'Pending':
        return <Clock className="h-4 w-4 text-amber-600" aria-hidden />;
      default:
        return <AlertCircle className="h-4 w-4 text-slate-500" aria-hidden />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Approved':
        return 'border-emerald-200 bg-emerald-50 text-emerald-900';
      case 'Rejected':
        return 'border-rose-200 bg-rose-50 text-rose-900';
      case 'Pending':
        return 'border-amber-200 bg-amber-50 text-amber-900';
      default:
        return 'border-slate-200 bg-slate-50 text-slate-800';
    }
  };

  const selectCls =
    'rounded-md border border-blue-200/65 bg-panel px-3 py-2 text-sm text-slate-800 shadow-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20';

  if (loading) {
    return (
      <section
        className="rounded-xl border border-blue-200/65 bg-panel p-6 shadow-sm"
        aria-busy="true"
        aria-label="Loading attendance requests"
      >
        <div className="flex items-center justify-center gap-2 py-12 text-slate-600">
          <RefreshCw className="h-6 w-6 animate-spin text-blue-600" aria-hidden />
          <span role="status">Loading requests…</span>
        </div>
      </section>
    );
  }

  return (
    <section
      className="rounded-xl border border-blue-200/65 bg-panel p-6 shadow-sm"
      aria-labelledby="attendance-requests-heading"
    >
      <header className="mb-5 space-y-3">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <h1 id="attendance-requests-heading" className="text-xl font-semibold text-slate-900">
              {isEmployeeView ? 'My attendance requests' : 'Attendance requests'}
            </h1>
            <p className="mt-1 max-w-2xl text-sm text-slate-600">
              {isEmployeeView
                ? 'Track the status of your attendance correction requests.'
                : 'Review and manage employee attendance correction requests.'}
            </p>
            <ol className="mt-3 flex list-none flex-wrap gap-2 text-xs text-slate-700" aria-label="Requests workflow">
              {REQUESTS_WORKFLOW_STEPS.map((t, i) => (
                <li
                  key={t}
                  className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-slate-50 px-2 py-1"
                >
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-blue-600 text-[10px] font-bold text-white">
                    {i + 1}
                  </span>
                  {t}
                </li>
              ))}
            </ol>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="sr-only">View layout</span>
            <div className="inline-flex rounded-md border border-blue-200/65 bg-panel p-0.5 shadow-sm" role="group" aria-label="View layout">
          <button
            type="button"
            onClick={() => setViewMode('cards')}
            className={`rounded-md p-2 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500/30 ${
              viewMode === 'cards'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
            }`}
            title="Card view"
          >
            <LayoutGrid className="h-4 w-4" aria-hidden />
          </button>
          <button
            type="button"
            onClick={() => setViewMode('table')}
            className={`rounded-md p-2 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500/30 ${
              viewMode === 'table'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
            }`}
            title="Table view"
          >
            <Table className="h-4 w-4" aria-hidden />
          </button>
            </div>
          <select
            value={monthFilter}
            onChange={(e) => setMonthFilter(e.target.value)}
            className={selectCls}
            aria-label="Filter by month"
          >
            <option value="all">All Months</option>
            {Array.from(new Set(requests.map(r => r.monthYear)))
              .sort()
              .reverse()
              .map(monthYear => {
                const [year, month] = monthYear.split('-');
                const monthName = new Date(parseInt(year), parseInt(month) - 1).toLocaleString('default', { month: 'long' });
                return (
                  <option key={monthYear} value={monthYear}>
                    {monthName} {year}
                  </option>
                );
              })}
          </select>
          <select
            value={leaveTypeFilter}
            onChange={(e) => setLeaveTypeFilter(e.target.value)}
            className={selectCls}
            aria-label="Filter by request type"
          >
            <option value="all">All Leave Types</option>
            {Array.from(new Set(requests.map(r => r.requestedStatus)))
              .sort()
              .map(leaveType => (
                <option key={leaveType} value={leaveType}>
                  {leaveType}
                </option>
              ))}
          </select>
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value as any)}
            className={selectCls}
            aria-label="Filter by status"
          >
            <option value="all">All Status</option>
            <option value="Pending">Pending</option>
            <option value="Approved">Approved</option>
            <option value="Rejected">Rejected</option>
          </select>
          <button
            type="button"
            onClick={exportToExcel}
            className="inline-flex items-center gap-2 rounded-md border border-blue-200/65 bg-panel px-3 py-2 text-sm font-medium text-slate-800 shadow-sm transition-colors hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            title="Export to Excel"
          >
            <Download className="h-4 w-4 text-slate-500" aria-hidden />
            Export Excel
          </button>
        </div>
        </div>
      </header>

      {error && (
        <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900" role="alert">
          {error}
        </div>
      )}

      {filteredRangeGroups.length === 0 && filteredIndividualRequests.length === 0 ? (
        <div className="py-10 text-center">
          <AlertCircle className="mx-auto mb-3 h-12 w-12 text-slate-400" aria-hidden />
          <p className="text-slate-600">
            {filter === 'all' && monthFilter === 'all' && leaveTypeFilter === 'all'
              ? 'No attendance requests found'
              : 'No requests found for selected filters'}
          </p>
        </div>
      ) : viewMode === 'table' ? (
        <AttendanceRequestsTable
          rangeGroups={filteredRangeGroups}
          individualRequests={filteredIndividualRequests}
          getStatusIcon={getStatusIcon}
          getStatusColor={getStatusColor}
          isAdminView={isAdminView}
          onApproveReject={handleApproveReject}
          processingRequest={processingRequest}
          openApprovalModal={openApprovalModal}
        />
      ) : (
        <div className="space-y-3">
          {filteredRangeGroups.map((rangeGroup) => (
            <DateRangeRequestBlock
              key={`range-${rangeGroup.ids.join('-')}`}
              rangeGroup={rangeGroup}
              isAdminView={isAdminView}
              onApproveReject={handleApproveReject}
              processingRequest={processingRequest}
              openApprovalModal={openApprovalModal}
            />
          ))}

          {/* Render individual requests */}
          {filteredIndividualRequests.map((request) => (
            <div
              key={request._id}
              className="rounded-lg border border-blue-200/65 bg-panel p-4 shadow-sm transition-colors hover:border-slate-300 hover:bg-slate-50/60"
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
                      <> • {request.startTime} - {request.endTime}</>
                    )}
                  </p>
                </div>

                <div
                  className={`flex shrink-0 items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium ${getStatusColor(request.status)}`}
                >
                  {getStatusIcon(request.status)}
                  {request.status}
                </div>
              </div>

              {request.reason && (
                <div className="mb-3">
                  <p className="mb-1 text-xs font-medium text-slate-600">Reason</p>
                  <p className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800">
                    {request.reason}
                  </p>
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
                        on {new Date(request.approvedAt || request.rejectedAt!).toLocaleDateString('en-GB', {
                          year: 'numeric',
                          month: '2-digit',
                          day: '2-digit',
                        }) + ' ' + new Date(request.approvedAt || request.rejectedAt!).toLocaleTimeString([], {
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

              {isAdminView && request.status === 'Pending' && (
                <div className="mt-3 flex gap-2 border-t border-slate-200 pt-3">
                  <button
                    type="button"
                    onClick={() => openApprovalModal(request._id, 'approve')}
                    disabled={processingRequest === request._id}
                    className="flex-1 rounded-md bg-emerald-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 disabled:opacity-50"
                  >
                    {processingRequest === request._id ? 'Processing...' : 'Approve'}
                  </button>
                  <button
                    type="button"
                    onClick={() => openApprovalModal(request._id, 'reject')}
                    disabled={processingRequest === request._id}
                    className="flex-1 rounded-md bg-rose-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-rose-700 focus:outline-none focus:ring-2 focus:ring-rose-500/40 disabled:opacity-50"
                  >
                    {processingRequest === request._id ? 'Processing...' : 'Reject'}
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Approval Modal (improved, always rendered) */}
      {renderApprovalModal()}
    </section>
  );
};