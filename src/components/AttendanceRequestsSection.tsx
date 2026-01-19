import React, { useState, useEffect } from 'react';
import { Clock, CheckCircle, XCircle, AlertCircle, RefreshCw } from 'lucide-react';

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

interface AttendanceRequestsSectionProps {
  userId?: string;
  partnerName?: string;
  isEmployeeView?: boolean;
}

export const AttendanceRequestsSection: React.FC<AttendanceRequestsSectionProps> = ({
  userId,
  partnerName,
  isEmployeeView = false
}) => {
  const [requests, setRequests] = useState<AttendanceRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'Pending' | 'Approved' | 'Rejected'>('all');

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

  const filteredRequests = requests.filter(request =>
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
        </div>
      </div>

      {error && (
        <div className="mb-4 bg-rose-950/40 border border-rose-700/60 text-rose-100 px-4 py-3 rounded-md text-sm">
          {error}
        </div>
      )}

      {filteredRequests.length === 0 ? (
        <div className="text-center py-8">
          <AlertCircle className="w-12 h-12 text-slate-500 mx-auto mb-3" />
          <p className="text-slate-400">
            {filter === 'all' ? 'No attendance requests found' : `No ${filter.toLowerCase()} requests found`}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredRequests.map((request) => (
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