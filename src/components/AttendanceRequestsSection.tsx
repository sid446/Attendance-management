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
  createdAt: string;
  ids: string[]; // Array of request IDs for this range
}

interface AttendanceRequestsSectionProps {
  userId?: string;
  partnerName?: string;
  isEmployeeView?: boolean;
}

// Component for displaying a range of consecutive dates as a single block
const DateRangeRequestBlock: React.FC<{ rangeGroup: DateRangeGroup }> = ({ rangeGroup }) => {
  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'Approved':
        return <CheckCircle className="w-5 h-5 text-green-500" />;
      case 'Rejected':
        return <XCircle className="w-5 h-5 text-red-500" />;
      case 'Pending':
        return <Clock className="w-5 h-5 text-yellow-500" />;
      default:
        return <AlertCircle className="w-5 h-5 text-gray-500" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Approved':
        return 'border-green-200 bg-green-50';
      case 'Rejected':
        return 'border-red-200 bg-red-50';
      case 'Pending':
        return 'border-yellow-200 bg-yellow-50';
      default:
        return 'border-gray-200 bg-gray-50';
    }
  };

  const formatDateRange = (startDate: string, endDate: string) => {
    const start = new Date(startDate);
    const end = new Date(endDate);

    if (start.toDateString() === end.toDateString()) {
      return start.toLocaleDateString('en-US', {
        weekday: 'short',
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      });
    }

    return `${start.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric'
    })} - ${end.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    })}`;
  };

  return (
    <div className={`p-4 rounded-lg border-2 ${getStatusColor(rangeGroup.status)} mb-4`}>
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-2">
            <Calendar className="w-4 h-4 text-gray-600" />
            <span className="font-medium text-gray-900">
              {rangeGroup.userName}
              {rangeGroup.designation && (
                <span className="text-sm text-gray-600 ml-1">({rangeGroup.designation})</span>
              )}
            </span>
            <span className="text-sm text-gray-600">via {rangeGroup.partnerName}</span>
          </div>

          <div className="mb-2">
            <span className="font-medium text-gray-700">Date Range: </span>
            <span className="text-gray-900">{formatDateRange(rangeGroup.startDate, rangeGroup.endDate)}</span>
            <span className="text-sm text-gray-600 ml-2">
              ({rangeGroup.dates.length} {rangeGroup.dates.length === 1 ? 'day' : 'days'})
            </span>
          </div>

          <div className="mb-2">
            <span className="font-medium text-gray-700">Requested: </span>
            <span className="text-gray-900">{rangeGroup.requestedStatus}</span>
            {rangeGroup.startTime && rangeGroup.endTime && (
              <span className="text-sm text-gray-600 ml-2">
                ({rangeGroup.startTime} - {rangeGroup.endTime})
              </span>
            )}
          </div>

          {rangeGroup.reason && (
            <div className="mb-2">
              <span className="font-medium text-gray-700">Reason: </span>
              <span className="text-gray-900">{rangeGroup.reason}</span>
            </div>
          )}

          {rangeGroup.partnerRemarks && (
            <div className="mb-2">
              <span className="font-medium text-gray-700">Partner Remarks: </span>
              <span className="text-gray-900">{rangeGroup.partnerRemarks}</span>
            </div>
          )}

          <div className="text-xs text-gray-500">
            Requested on {new Date(rangeGroup.createdAt).toLocaleDateString('en-US', {
              year: 'numeric',
              month: 'short',
              day: 'numeric',
              hour: '2-digit',
              minute: '2-digit'
            })}
          </div>
        </div>

        <div className="flex items-center gap-2 ml-4">
          {getStatusIcon(rangeGroup.status)}
          <span className={`text-sm font-medium ${
            rangeGroup.status === 'Approved' ? 'text-green-700' :
            rangeGroup.status === 'Rejected' ? 'text-red-700' :
            'text-yellow-700'
          }`}>
            {rangeGroup.status}
          </span>
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
    const key = `${request.userId._id}-${request.requestedStatus}-${request.reason || ''}-${request.partnerName}`;
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
}> = ({ rangeGroups, individualRequests, getStatusIcon, getStatusColor }) => {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse">
        <thead>
          <tr className="bg-slate-800/50">
            <th className="px-4 py-3 text-left text-xs font-medium text-slate-300 uppercase tracking-wider border-b border-slate-700">
              Employee
            </th>
            <th className="px-4 py-3 text-left text-xs font-medium text-slate-300 uppercase tracking-wider border-b border-slate-700">
              Type
            </th>
            <th className="px-4 py-3 text-left text-xs font-medium text-slate-300 uppercase tracking-wider border-b border-slate-700">
              Date Range
            </th>
            <th className="px-4 py-3 text-left text-xs font-medium text-slate-300 uppercase tracking-wider border-b border-slate-700">
              Requested Status
            </th>
            <th className="px-4 py-3 text-left text-xs font-medium text-slate-300 uppercase tracking-wider border-b border-slate-700">
              Time
            </th>
            <th className="px-4 py-3 text-left text-xs font-medium text-slate-300 uppercase tracking-wider border-b border-slate-700">
              Reason
            </th>
            <th className="px-4 py-3 text-left text-xs font-medium text-slate-300 uppercase tracking-wider border-b border-slate-700">
              Status
            </th>
            <th className="px-4 py-3 text-left text-xs font-medium text-slate-300 uppercase tracking-wider border-b border-slate-700">
              Partner
            </th>
            <th className="px-4 py-3 text-left text-xs font-medium text-slate-300 uppercase tracking-wider border-b border-slate-700">
              Submitted
            </th>
          </tr>
        </thead>
        <tbody className="bg-slate-900/30">
          {/* Range Groups */}
          {rangeGroups.map((group) => (
            <tr key={`range-${group.ids.join('-')}`} className="hover:bg-slate-800/30 transition-colors">
              <td className="px-4 py-3 border-b border-slate-700">
                <div>
                  <div className="text-sm font-medium text-slate-200">{group.userName}</div>
                  <div className="text-xs text-slate-400">{group.designation || 'Employee'}</div>
                </div>
              </td>
              <td className="px-4 py-3 border-b border-slate-700">
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-900/40 text-blue-300 border border-blue-700/60">
                  Range ({group.dates.length} days)
                </span>
              </td>
              <td className="px-4 py-3 border-b border-slate-700">
                <div className="text-sm text-slate-200">
                  {new Date(group.startDate).toLocaleDateString()} - {new Date(group.endDate).toLocaleDateString()}
                </div>
              </td>
              <td className="px-4 py-3 border-b border-slate-700">
                <span className="text-sm text-slate-200 font-medium">{group.requestedStatus}</span>
              </td>
              <td className="px-4 py-3 border-b border-slate-700">
                <span className="text-sm text-slate-300">
                  {group.startTime && group.endTime ? `${group.startTime} - ${group.endTime}` : '-'}
                </span>
              </td>
              <td className="px-4 py-3 border-b border-slate-700">
                <span className="text-sm text-slate-300 max-w-xs truncate block" title={group.reason}>
                  {group.reason || '-'}
                </span>
              </td>
              <td className="px-4 py-3 border-b border-slate-700">
                <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${getStatusColor(group.status)}`}>
                  {getStatusIcon(group.status)}
                  {group.status}
                </div>
              </td>
              <td className="px-4 py-3 border-b border-slate-700">
                <span className="text-sm text-slate-300">{group.partnerName}</span>
              </td>
              <td className="px-4 py-3 border-b border-slate-700">
                <div className="text-sm text-slate-400">
                  <div>{new Date(group.createdAt).toLocaleDateString()}</div>
                  <div className="text-xs">{new Date(group.createdAt).toLocaleTimeString()}</div>
                </div>
              </td>
            </tr>
          ))}

          {/* Individual Requests */}
          {individualRequests.map((request) => (
            <tr key={request._id} className="hover:bg-slate-800/30 transition-colors">
              <td className="px-4 py-3 border-b border-slate-700">
                <div>
                  <div className="text-sm font-medium text-slate-200">{request.userName}</div>
                  <div className="text-xs text-slate-400">{request.userId?.designation || 'Employee'}</div>
                </div>
              </td>
              <td className="px-4 py-3 border-b border-slate-700">
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-900/40 text-gray-300 border border-gray-700/60">
                  Single Day
                </span>
              </td>
              <td className="px-4 py-3 border-b border-slate-700">
                <div className="text-sm text-slate-200">
                  {new Date(request.date).toLocaleDateString()}
                </div>
              </td>
              <td className="px-4 py-3 border-b border-slate-700">
                <span className="text-sm text-slate-200 font-medium">{request.requestedStatus}</span>
              </td>
              <td className="px-4 py-3 border-b border-slate-700">
                <span className="text-sm text-slate-300">
                  {request.startTime && request.endTime ? `${request.startTime} - ${request.endTime}` : '-'}
                </span>
              </td>
              <td className="px-4 py-3 border-b border-slate-700">
                <span className="text-sm text-slate-300 max-w-xs truncate block" title={request.reason}>
                  {request.reason || '-'}
                </span>
              </td>
              <td className="px-4 py-3 border-b border-slate-700">
                <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${getStatusColor(request.status)}`}>
                  {getStatusIcon(request.status)}
                  {request.status}
                </div>
              </td>
              <td className="px-4 py-3 border-b border-slate-700">
                <span className="text-sm text-slate-300">{request.partnerName}</span>
              </td>
              <td className="px-4 py-3 border-b border-slate-700">
                <div className="text-sm text-slate-400">
                  <div>{new Date(request.createdAt).toLocaleDateString()}</div>
                  <div className="text-xs">{new Date(request.createdAt).toLocaleTimeString()}</div>
                </div>
              </td>
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
  isEmployeeView = false
}) => {
  const [requests, setRequests] = useState<AttendanceRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'Pending' | 'Approved' | 'Rejected'>('all');
  const [viewMode, setViewMode] = useState<'cards' | 'table'>('table');

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

  useEffect(() => {
    fetchRequests();
  }, [userId, partnerName]);

  const exportToExcel = () => {
    const { rangeGroups, individualRequests } = groupRequestsIntoRanges(requests);
    const filteredRangeGroups = rangeGroups.filter(group =>
      filter === 'all' || group.status === filter
    );
    const filteredIndividualRequests = individualRequests.filter(request =>
      filter === 'all' || request.status === filter
    );

    const excelData: any[] = [];

    // Add range groups
    filteredRangeGroups.forEach(group => {
      excelData.push({
        'Employee Name': group.userName,
        'Designation': group.designation || 'Employee',
        'Partner': group.partnerName,
        'Start Date': new Date(group.startDate).toLocaleDateString(),
        'End Date': new Date(group.endDate).toLocaleDateString(),
        'Days': group.dates.length,
        'Requested Status': group.requestedStatus,
        'Start Time': group.startTime || '',
        'End Time': group.endTime || '',
        'Reason': group.reason || '',
        'Status': group.status,
        'Partner Remarks': group.partnerRemarks || '',
        'Submitted Date': new Date(group.createdAt).toLocaleDateString(),
        'Submitted Time': new Date(group.createdAt).toLocaleTimeString()
      });
    });

    // Add individual requests
    filteredIndividualRequests.forEach(request => {
      excelData.push({
        'Employee Name': request.userName,
        'Designation': request.userId?.designation || 'Employee',
        'Partner': request.partnerName,
        'Start Date': new Date(request.date).toLocaleDateString(),
        'End Date': new Date(request.date).toLocaleDateString(),
        'Days': 1,
        'Requested Status': request.requestedStatus,
        'Start Time': request.startTime || '',
        'End Time': request.endTime || '',
        'Reason': request.reason || '',
        'Status': request.status,
        'Partner Remarks': request.partnerRemarks || '',
        'Submitted Date': new Date(request.createdAt).toLocaleDateString(),
        'Submitted Time': new Date(request.createdAt).toLocaleTimeString()
      });
    });

    const worksheet = XLSX.utils.json_to_sheet(excelData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Attendance Requests');

    // Auto-size columns
    const colWidths = [
      { wch: 15 }, // Employee Name
      { wch: 12 }, // Designation
      { wch: 15 }, // Partner
      { wch: 12 }, // Start Date
      { wch: 12 }, // End Date
      { wch: 8 },  // Days
      { wch: 15 }, // Requested Status
      { wch: 10 }, // Start Time
      { wch: 10 }, // End Time
      { wch: 20 }, // Reason
      { wch: 10 }, // Status
      { wch: 20 }, // Partner Remarks
      { wch: 12 }, // Submitted Date
      { wch: 12 }  // Submitted Time
    ];
    worksheet['!cols'] = colWidths;

    const fileName = `attendance_requests_${new Date().toISOString().split('T')[0]}.xlsx`;
    XLSX.writeFile(workbook, fileName);
  };

  // Group requests into ranges and filter
  const { rangeGroups, individualRequests } = groupRequestsIntoRanges(requests);

  const filteredRangeGroups = rangeGroups.filter(group =>
    filter === 'all' || group.status === filter
  );

  const filteredIndividualRequests = individualRequests.filter(request =>
    filter === 'all' || request.status === filter
  );

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'Approved':
        return <CheckCircle className="w-4 h-4 text-emerald-400" />;
      case 'Rejected':
        return <XCircle className="w-4 h-4 text-rose-400" />;
      case 'Pending':
        return <Clock className="w-4 h-4 text-amber-400" />;
      default:
        return <AlertCircle className="w-4 h-4 text-slate-400" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Approved':
        return 'text-emerald-400 bg-emerald-950/40 border-emerald-700/60';
      case 'Rejected':
        return 'text-rose-400 bg-rose-950/40 border-rose-700/60';
      case 'Pending':
        return 'text-amber-400 bg-amber-950/40 border-amber-700/60';
      default:
        return 'text-slate-400 bg-slate-950/40 border-slate-700/60';
    }
  };

  if (loading) {
    return (
      <section className="bg-slate-900/60 border border-slate-800 rounded-xl shadow-sm p-6">
        <div className="flex items-center justify-center py-8">
          <RefreshCw className="w-6 h-6 text-slate-400 animate-spin" />
          <span className="ml-2 text-slate-400">Loading requests...</span>
        </div>
      </section>
    );
  }

  return (
    <section className="bg-slate-900/60 border border-slate-800 rounded-xl shadow-sm p-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-xl font-semibold text-slate-50">
            {isEmployeeView ? 'My Attendance Requests' : 'Attendance Requests'}
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            {isEmployeeView
              ? 'Track the status of your attendance correction requests'
              : 'Review and manage employee attendance correction requests'
            }
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setViewMode('cards')}
            className={`p-2 rounded-md transition-colors ${
              viewMode === 'cards'
                ? 'bg-emerald-600 text-white'
                : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
            }`}
            title="Card View"
          >
            <LayoutGrid className="w-4 h-4" />
          </button>
          <button
            onClick={() => setViewMode('table')}
            className={`p-2 rounded-md transition-colors ${
              viewMode === 'table'
                ? 'bg-emerald-600 text-white'
                : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
            }`}
            title="Table View"
          >
            <Table className="w-4 h-4" />
          </button>
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value as any)}
            className="px-3 py-2 bg-slate-800 border border-slate-700 rounded-md text-sm text-slate-200 focus:border-emerald-500 focus:outline-none"
          >
            <option value="all">All Status</option>
            <option value="Pending">Pending</option>
            <option value="Approved">Approved</option>
            <option value="Rejected">Rejected</option>
          </select>
          <button
            onClick={exportToExcel}
            className="flex items-center gap-2 px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-md text-sm font-medium transition-colors"
            title="Export to Excel"
          >
            <Download className="w-4 h-4" />
            Export Excel
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-4 bg-rose-950/40 border border-rose-700/60 text-rose-100 px-4 py-3 rounded-md text-sm">
          {error}
        </div>
      )}

      {filteredRangeGroups.length === 0 && filteredIndividualRequests.length === 0 ? (
        <div className="text-center py-8">
          <AlertCircle className="w-12 h-12 text-slate-500 mx-auto mb-3" />
          <p className="text-slate-400">
            {filter === 'all' ? 'No attendance requests found' : `No ${filter.toLowerCase()} requests found`}
          </p>
        </div>
      ) : viewMode === 'table' ? (
        <AttendanceRequestsTable
          rangeGroups={filteredRangeGroups}
          individualRequests={filteredIndividualRequests}
          getStatusIcon={getStatusIcon}
          getStatusColor={getStatusColor}
        />
      ) : (
        <div className="space-y-3">
          {/* Render range groups first */}
          {filteredRangeGroups.map((rangeGroup) => (
            <DateRangeRequestBlock key={`range-${rangeGroup.ids.join('-')}`} rangeGroup={rangeGroup} />
          ))}

          {/* Render individual requests */}
          {filteredIndividualRequests.map((request) => (
            <div
              key={request._id}
              className="bg-slate-800/50 border border-slate-700 rounded-lg p-4 hover:bg-slate-800/70 transition-colors"
            >
              <div className="flex items-start justify-between mb-3">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="font-medium text-slate-200">{request.userName}</h3>
                    <span className="text-xs text-slate-400">•</span>
                    <span className="text-xs text-slate-400">{request.userId?.designation || 'Employee'}</span>
                  </div>
                  <p className="text-sm text-slate-300">
                    Requested: <span className="font-medium">{request.requestedStatus}</span>
                    {request.originalStatus && (
                      <> from <span className="text-slate-400">{request.originalStatus}</span></>
                    )}
                  </p>
                  <p className="text-xs text-slate-400 mt-1">
                    Date: {new Date(request.date).toLocaleDateString()}
                    {request.startTime && request.endTime && (
                      <> • {request.startTime} - {request.endTime}</>
                    )}
                  </p>
                </div>

                <div className={`flex items-center gap-2 px-3 py-1 rounded-full text-xs font-medium border ${getStatusColor(request.status)}`}>
                  {getStatusIcon(request.status)}
                  {request.status}
                </div>
              </div>

              {request.reason && (
                <div className="mb-3">
                  <p className="text-xs font-medium text-slate-300 mb-1">Reason:</p>
                  <p className="text-sm text-slate-400 bg-slate-900/50 rounded px-3 py-2">
                    {request.reason}
                  </p>
                </div>
              )}

              {request.partnerRemarks && request.status !== 'Pending' && (
                <div className="mb-3">
                  <p className="text-xs font-medium text-slate-300 mb-1">Partner Remarks:</p>
                  <p className="text-sm text-slate-400 bg-slate-900/50 rounded px-3 py-2 border-l-2 border-emerald-600/50">
                    {request.partnerRemarks}
                  </p>
                </div>
              )}

              <div className="flex items-center justify-between text-xs text-slate-500">
                <span>Partner: {request.partnerName}</span>
                <span>Submitted: {new Date(request.createdAt).toLocaleDateString()}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
};