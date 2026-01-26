"use client";
import React, { useState, useEffect, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { CheckCircle, XCircle, AlertCircle, Send, Loader2 } from 'lucide-react';

interface AttendanceRequest {
  _id: string;
  userName: string;
  partnerName: string;
  date: string;
  requestedStatus: string;
  originalStatus: string;
  reason?: string;
  startTime?: string;
  endTime?: string;
  status: string;
}

function PartnerReviewContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const requestId = searchParams.get('id');

  const [request, setRequest] = useState<AttendanceRequest | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [remarks, setRemarks] = useState('');
  const [attendanceValue, setAttendanceValue] = useState<number>(1);
  const [action, setAction] = useState<'approve' | 'reject' | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    if (!requestId) {
      setError('Invalid request ID');
      setLoading(false);
      return;
    }

    fetchRequest();
  }, [requestId]);

  const fetchRequest = async () => {
    try {
      const response = await fetch(`/api/attendance/request-action?id=${requestId}`);
      if (!response.ok) {
        throw new Error('Failed to fetch request');
      }

      const result = await response.json();
      if (result.success) {
        setRequest(result.data);
      } else {
        setError(result.error || 'Failed to load request');
      }
    } catch (err) {
      setError('Failed to load request details');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async () => {
    if (!action || !request) return;

    setSubmitting(true);
    try {
      const response = await fetch('/api/attendance/request-action', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          id: requestId,
          action,
          remarks: remarks.trim() || undefined,
          attendanceValue: action === 'approve' ? attendanceValue : undefined
        }),
      });

      const result = await response.json();

      if (result.success) {
        setSubmitted(true);
      } else {
        setError(result.error || 'Failed to process request');
      }
    } catch (err) {
      setError('Failed to submit response');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-8 h-8 text-emerald-400 animate-spin mx-auto mb-4" />
          <p className="text-slate-400">Loading request details...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
        <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-xl p-6 text-center">
          <AlertCircle className="w-12 h-12 text-rose-400 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-white mb-2">Error</h2>
          <p className="text-slate-400 mb-4">{error}</p>
          <button
            onClick={() => router.back()}
            className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded-lg"
          >
            Go Back
          </button>
        </div>
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
        <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-xl p-6 text-center">
          <CheckCircle className="w-12 h-12 text-emerald-400 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-white mb-2">Request Processed</h2>
          <p className="text-slate-400 mb-4">
            The attendance correction request has been {action === 'approve' ? 'approved' : 'rejected'} successfully.
          </p>
          <button
            onClick={() => router.push('/')}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg"
          >
            Return to Home
          </button>
        </div>
      </div>
    );
  }

  if (!request) return null;

  return (
    <div className="min-h-screen bg-slate-950 p-4">
      <div className="max-w-2xl mx-auto">
        <div className="bg-slate-900 border border-slate-800 rounded-xl shadow-2xl overflow-hidden">
          <div className="p-6 border-b border-slate-800">
            <h1 className="text-2xl font-bold text-white mb-2">Review Attendance Request</h1>
            <p className="text-slate-400">Review and respond to the employee's attendance correction request</p>
          </div>

          <div className="p-6 space-y-6">
            {/* Request Details */}
            <div className="bg-slate-800/50 rounded-lg p-4">
              <h3 className="text-lg font-semibold text-white mb-4">Request Details</h3>

              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-slate-400">Employee:</span>
                  <p className="text-white font-medium">{request.userName}</p>
                </div>
                <div>
                  <span className="text-slate-400">Date:</span>
                  <p className="text-white font-medium">{new Date(request.date).toLocaleDateString()}</p>
                </div>
                <div>
                  <span className="text-slate-400">Requested Status:</span>
                  <p className="text-emerald-400 font-medium">{request.requestedStatus}</p>
                </div>
                <div>
                  <span className="text-slate-400">Current Status:</span>
                  <p className="text-slate-300">{request.originalStatus || 'Absent'}</p>
                </div>
                {request.startTime && request.endTime && (
                  <div className="col-span-2">
                    <span className="text-slate-400">Time Range:</span>
                    <p className="text-white font-medium">{request.startTime} - {request.endTime}</p>
                  </div>
                )}
              </div>

              {request.reason && (
                <div className="mt-4">
                  <span className="text-slate-400 text-sm">Employee Reason:</span>
                  <p className="text-slate-300 mt-1 bg-slate-900/50 rounded p-3">{request.reason}</p>
                </div>
              )}
            </div>

            {/* Response Section */}
            <div className="bg-slate-800/50 rounded-lg p-4">
              <h3 className="text-lg font-semibold text-white mb-4">Your Response</h3>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">
                    Remarks (Optional)
                  </label>
                  <textarea
                    value={remarks}
                    onChange={(e) => setRemarks(e.target.value)}
                    placeholder="Add any remarks or comments about this request..."
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg p-3 text-black placeholder-slate-400 focus:border-emerald-500 focus:outline-none min-h-[100px]"
                  />
                </div>

                {action === 'approve' && (
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-2">
                      Attendance Value
                    </label>
                    <input
                      type="number"
                      value={attendanceValue}
                      onChange={(e) => setAttendanceValue(parseFloat(e.target.value) || 0)}
                      min="0"
                      max="2"
                      step="0.1"
                      placeholder="1.0"
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg p-3 text-slate-200 placeholder-slate-400 focus:border-emerald-500 focus:outline-none"
                    />
                    <p className="text-xs text-slate-400 mt-1">
                      Set the attendance value (0-2). Standard: 1.0, Outstation: 1.2, Half Day: 0.75
                    </p>
                  </div>
                )}

                <div className="flex gap-3">
                  <button
                    onClick={() => setAction('approve')}
                    disabled={submitting}
                    className={`flex-1 py-3 px-4 rounded-lg font-medium flex items-center justify-center gap-2 transition-colors ${
                      action === 'approve'
                        ? 'bg-emerald-600 text-white'
                        : 'bg-slate-700 hover:bg-slate-600 text-slate-200'
                    }`}
                  >
                    <CheckCircle className="w-4 h-4" />
                    Approve
                  </button>

                  <button
                    onClick={() => setAction('reject')}
                    disabled={submitting}
                    className={`flex-1 py-3 px-4 rounded-lg font-medium flex items-center justify-center gap-2 transition-colors ${
                      action === 'reject'
                        ? 'bg-rose-600 text-white'
                        : 'bg-slate-700 hover:bg-slate-600 text-slate-200'
                    }`}
                  >
                    <XCircle className="w-4 h-4" />
                    Reject
                  </button>
                </div>
              </div>
            </div>

            {/* Submit Button */}
            {action && (
              <div className="bg-slate-800/50 rounded-lg p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-white font-medium">
                      {action === 'approve' ? 'Approve' : 'Reject'} this request?
                    </p>
                    <p className="text-slate-400 text-sm">
                      {remarks.trim() ? 'With remarks' : 'No remarks added'}
                    </p>
                  </div>

                  <button
                    onClick={handleSubmit}
                    disabled={submitting}
                    className="bg-emerald-600 hover:bg-emerald-500 disabled:bg-emerald-800 disabled:cursor-not-allowed text-white px-6 py-2 rounded-lg flex items-center gap-2"
                  >
                    {submitting ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Send className="w-4 h-4" />
                    )}
                    Submit {action === 'approve' ? 'Approval' : 'Rejection'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function PartnerReview() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-8 h-8 text-emerald-400 animate-spin mx-auto mb-4" />
          <p className="text-slate-400">Loading...</p>
        </div>
      </div>
    }>
      <PartnerReviewContent />
    </Suspense>
  );
}