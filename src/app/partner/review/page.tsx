'use client';

import React, { useState, useEffect, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { ArrowLeft, CheckCircle } from 'lucide-react';
import {
  formatExtraWorkHoursLabel,
  isExtraWorkRequest,
  normalizeExtraWorkSlotsFromRequest,
  sumExtraWorkSlotHours,
} from '@/lib/extraWorkRequest';
import {
  getDefaultValueForType,
  isFixedValueType,
  isLeaveRequestType,
  resolveApproveValueNumber,
} from '@/lib/attendanceRequestValues';

interface AttendanceRequest {
  _id: string;
  userName: string;
  partnerName: string;
  date: string;
  requestedStatus: string;
  requestType?: 'correction' | 'extra_work';
  originalStatus: string;
  reason?: string;
  startTime?: string;
  endTime?: string;
  extraWorkSlots?: { startTime: string; endTime: string; reason: string }[];
  status: string;
  isArticleEmployee?: boolean;
}

const APPROVE_CHIPS = ['Done', 'Missed Entry', 'Client Visit', 'Emergency', 'Approved'];
const REJECT_CHIPS = ['Insufficient Hours', 'Incorrect Date', 'Incorrect Entry', 'Not Discussed', 'Proof Required'];

function formatDate(dateStr: string): string {
  const iso = String(dateStr || '').split('T')[0];
  const date = new Date(`${iso}T12:00:00`);
  if (Number.isNaN(date.getTime())) return iso || String(dateStr || '');
  return date.toLocaleDateString('en-IN', {
    weekday: 'long',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function PartnerReviewContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const requestId = searchParams.get('id');

  const [request, setRequest] = useState<AttendanceRequest | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [remarks, setRemarks] = useState('Done');
  const [attendanceValue, setAttendanceValue] = useState('1');
  const [processing, setProcessing] = useState(false);
  const [submitted, setSubmitted] = useState<'approve' | 'reject' | null>(null);
  const [reasonExpanded, setReasonExpanded] = useState(false);

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
        const data = result.data as AttendanceRequest;
        if (data.status !== 'Pending') {
          setError(`This request has already been ${data.status.toLowerCase()}.`);
        }
        setRequest(data);
        setRemarks('Done');
        const approveCtx =
          data.isArticleEmployee != null ? { isArticle: data.isArticleEmployee } : undefined;
        setAttendanceValue(getDefaultValueForType(data.requestedStatus, approveCtx));
      } else {
        setError(result.error || 'Failed to load request');
      }
    } catch {
      setError('Failed to load request details');
    } finally {
      setLoading(false);
    }
  };

  const handleAction = async (action: 'approve' | 'reject') => {
    if (!request || processing || request.status !== 'Pending') return;

    setProcessing(true);
    setError('');
    try {
      const approveCtx =
        request.isArticleEmployee != null ? { isArticle: request.isArticleEmployee } : undefined;
      const response = await fetch('/api/attendance/request-action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: requestId,
          action,
          remarks: remarks.trim() || 'Done',
          attendanceValue:
            action === 'approve'
              ? resolveApproveValueNumber(request.requestedStatus, attendanceValue, approveCtx)
              : undefined,
        }),
      });

      const result = await response.json();
      if (result.success) {
        setSubmitted(action);
      } else {
        setError(result.error || 'Failed to process request');
      }
    } catch {
      setError('Failed to submit response');
    } finally {
      setProcessing(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background text-foreground">
          <div className="text-center">
            <div className="animate-spin rounded-full h-10 w-10 border-2 border-border border-t-emerald-600 mx-auto" />
            <p className="mt-4 text-muted-foreground text-sm">Loading request...</p>
          </div>
        </div>
    );
  }

  if (submitted) {
    return (
      <div className="min-h-screen bg-background text-foreground selection:bg-emerald-500/25">
        <header className="sticky top-0 z-50 border-b border-border bg-background/90 backdrop-blur-md">
          <div className="w-full max-w-none mx-auto px-4 sm:px-6 xl:px-10 h-16 flex items-center gap-4">
            <div>
              <h1 className="text-lg font-bold text-foreground tracking-tight leading-none">Review Requests</h1>
              <p className="text-[11px] font-bold text-emerald-700 uppercase tracking-widest mt-1">Partner Review Portal</p>
            </div>
          </div>
        </header>
        <main className="w-full max-w-lg mx-auto px-4 py-16">
          <div className="bg-surface border border-border rounded-2xl p-8 text-center shadow-[inset_0_0_0_1px_rgba(147,197,253,0.25)]">
            <CheckCircle className="w-12 h-12 text-emerald-600 mx-auto mb-4" />
            <h2 className="text-lg font-semibold text-foreground mb-2">Request processed</h2>
            <p className="text-muted-foreground text-sm mb-6">
              The attendance request has been {submitted === 'approve' ? 'approved' : 'rejected'} successfully.
            </p>
            <button
              type="button"
              onClick={() => router.push('/employee/dashboard')}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 rounded-lg text-white text-sm font-bold transition-colors"
            >
              Done
            </button>
          </div>
        </main>
      </div>
    );
  }

  if (error && !request) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background text-foreground p-4">
        <div className="bg-surface border border-border p-6 rounded-2xl text-center max-w-sm w-full shadow-[inset_0_0_0_1px_rgba(147,197,253,0.25)]">
          <h2 className="text-lg font-semibold text-foreground mb-2">Something went wrong</h2>
          <p className="text-muted-foreground text-sm">{error}</p>
          <button
            type="button"
            onClick={() => router.back()}
            className="mt-4 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 rounded-lg text-white text-sm transition-colors"
          >
            Go back
          </button>
        </div>
      </div>
    );
  }

  if (!request) return null;

  const isExtraWork = isExtraWorkRequest(request);
  const isLeave = isLeaveRequestType(request.requestedStatus);
  const isPending = request.status === 'Pending';
  const extraWorkSlots = isExtraWork ? normalizeExtraWorkSlotsFromRequest(request) : [];
  const timeRange = isExtraWork
    ? extraWorkSlots.map((s) => `${s.startTime}–${s.endTime}`).join(', ') || '--:--'
    : request.startTime && request.endTime
      ? `${request.startTime} - ${request.endTime}`
      : '--:--';
  const extraHours = isExtraWork ? sumExtraWorkSlotHours(extraWorkSlots) : null;
  const originalDisplay = request.originalStatus?.trim() || '--:--';
  const dateDisplay = formatDate(request.date);

  return (
    <div className="min-h-screen bg-background text-foreground selection:bg-emerald-500/25">
      <header className="sticky top-0 z-50 border-b border-border bg-background/90 backdrop-blur-md">
        <div className="w-full max-w-none mx-auto px-4 sm:px-6 xl:px-10 h-16 flex items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={() => router.back()}
              className="p-2 -ml-2 rounded-lg border border-transparent text-muted-foreground hover:text-foreground hover:bg-surface transition-colors"
            >
              <ArrowLeft className="h-6 w-6" />
            </button>
            <div>
              <h1 className="text-lg font-bold text-foreground tracking-tight leading-none">Review Requests</h1>
              <p className="text-[11px] font-bold text-emerald-700 uppercase tracking-widest mt-1">Partner Review Portal</p>
            </div>
          </div>
          <span className="text-[11px] font-bold text-muted-foreground bg-surface border border-border px-3 py-1 rounded-full uppercase tracking-tighter">
            1 request
          </span>
        </div>
      </header>

      <main className="w-full max-w-2xl mx-auto px-2 sm:px-4 xl:px-10 py-4 pb-24">
        {error && (
          <div className="mb-4 px-4 py-3 rounded-xl border border-amber-500/35 bg-amber-500/10 text-amber-900 text-sm">
            {error}
          </div>
        )}

        <div className="relative rounded-xl border border-border bg-surface shadow-[inset_0_0_0_1px_rgba(147,197,253,0.12)]">
          <div className="p-3 sm:p-4">
            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 mb-2.5">
                <div className="flex items-center gap-2 min-w-0">
                  <h3 className="text-sm font-bold text-foreground truncate">{request.userName}</h3>
                  <span
                    className={`px-2 py-0.5 rounded-lg text-[9px] font-black uppercase tracking-widest border ${
                      isExtraWork
                        ? 'bg-orange-500/15 text-orange-900 border-orange-500/35'
                        : isLeave
                          ? 'bg-amber-500/15 text-amber-800 border-amber-500/35'
                          : 'bg-blue-500/15 text-blue-800 border-blue-500/35'
                    }`}
                  >
                    {isExtraWork ? 'Extra work hours' : request.requestedStatus}
                  </span>
                </div>
                <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-tighter">{dateDisplay}</p>
              </div>

              <div className="grid grid-cols-2 gap-3 mb-3">
                <div className="flex flex-col gap-1.5 p-2 bg-background/70 rounded-lg border border-border">
                  {isExtraWork ? (
                    <>
                      <div className="text-[10px] font-mono text-muted-foreground uppercase tracking-tight">
                        Extra work slots
                      </div>
                      <div className="space-y-1.5 mt-1">
                        {extraWorkSlots.map((slot, i) => (
                          <div key={`${slot.startTime}-${slot.endTime}-${i}`} className="text-[11px]">
                            <div className="font-mono text-orange-800 font-bold">
                              {slot.startTime}–{slot.endTime}
                            </div>
                            <div className="text-muted-foreground italic line-clamp-2">{slot.reason}</div>
                          </div>
                        ))}
                      </div>
                      {extraHours != null && extraHours > 0 && (
                        <div className="text-[10px] text-muted-foreground mt-2">
                          Total: {formatExtraWorkHoursLabel(extraHours)}
                        </div>
                      )}
                      <div className="text-[10px] text-muted-foreground mt-1">
                        Day status: {originalDisplay}
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="flex items-center justify-between text-[10px] font-mono text-muted-foreground uppercase tracking-tight">
                        <span>Actual</span>
                        <span>Request</span>
                      </div>
                      <div className="flex items-center justify-between gap-2 text-xs font-mono">
                        <span className="text-muted-foreground truncate" title={originalDisplay}>
                          {originalDisplay}
                        </span>
                        <svg className="w-3 h-3 text-muted-foreground/70 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                        </svg>
                        <span className="text-emerald-700 font-black shrink-0">{timeRange}</span>
                      </div>
                    </>
                  )}
                </div>

                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => setReasonExpanded((v) => !v)}
                  onKeyDown={(e) => e.key === 'Enter' && setReasonExpanded((v) => !v)}
                  className={`p-2 bg-background/70 border border-border rounded-lg cursor-pointer hover:bg-background transition-colors relative ${reasonExpanded ? 'z-10' : ''}`}
                >
                  <div className="flex items-center gap-1.5 mb-1 text-[10px] font-bold text-muted-foreground uppercase tracking-tight">
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 8h10M7 12h4" />
                    </svg>
                    <span>Reason</span>
                  </div>
                  <p className={`text-[11px] leading-relaxed text-muted-foreground italic ${reasonExpanded ? '' : 'line-clamp-2'}`}>
                    {request.reason || 'No reason provided'}
                  </p>
                  {request.reason && request.reason.length > 40 && !reasonExpanded && (
                    <div className="absolute bottom-1 right-2 text-[9px] font-bold text-emerald-700/70">TAP TO EXPAND</div>
                  )}
                </div>
              </div>

              {isPending ? (
                <div className="flex flex-col sm:flex-row gap-2">
                  <div className="flex-1 flex flex-col gap-1.5">
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={remarks}
                        onChange={(e) => setRemarks(e.target.value)}
                        className="flex-1 h-9 px-3 bg-background border border-border rounded-lg text-xs text-foreground placeholder:text-muted-foreground focus:border-emerald-500 outline-none"
                        placeholder="Remark..."
                      />
                      {!isExtraWork && !isFixedValueType(request.requestedStatus) && (
                        <input
                          type="number"
                          step="0.01"
                          value={attendanceValue}
                          onChange={(e) => setAttendanceValue(e.target.value)}
                          className="w-14 h-9 bg-background border border-border rounded-lg text-center text-xs font-bold text-emerald-700 focus:border-emerald-500 outline-none"
                        />
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5 select-none">
                      {APPROVE_CHIPS.map((c) => (
                        <button
                          key={c}
                          type="button"
                          onClick={() => setRemarks(c)}
                          className="px-2 py-1 bg-emerald-600/10 hover:bg-emerald-600/18 rounded-lg text-[10px] font-bold text-emerald-800 border border-emerald-600/25 transition-colors"
                        >
                          {c}
                        </button>
                      ))}
                      {REJECT_CHIPS.map((c) => (
                        <button
                          key={c}
                          type="button"
                          onClick={() => setRemarks(c)}
                          className="px-2 py-1 bg-rose-500/12 hover:bg-rose-500/20 rounded-lg text-[10px] font-bold text-rose-700 border border-rose-500/25 transition-colors"
                        >
                          {c}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="flex gap-1.5 shrink-0 items-start">
                    <button
                      type="button"
                      onClick={() => handleAction('reject')}
                      disabled={processing}
                      className="h-9 px-3 bg-surface hover:bg-rose-500/15 border border-border rounded-lg text-[11px] font-bold text-muted-foreground hover:text-rose-700 active:scale-95 transition-all disabled:opacity-50"
                    >
                      Reject
                    </button>
                    <button
                      type="button"
                      onClick={() => handleAction('approve')}
                      disabled={processing}
                      className="h-9 px-6 bg-emerald-600 hover:bg-emerald-500 rounded-lg text-[11px] font-black text-white shadow-md shadow-emerald-600/15 active:scale-95 transition-all flex items-center gap-2 disabled:opacity-50"
                    >
                      {processing ? (
                        <div className="h-3 w-3 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                      ) : (
                        'Approve'
                      )}
                    </button>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No further action is available for this request.</p>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

export default function PartnerReview() {
  return (
    <Suspense
      fallback={
        <div className="flex justify-center items-center min-h-screen bg-background text-muted-foreground">
          <p className="text-sm">Loading...</p>
        </div>
      }
    >
      <PartnerReviewContent />
    </Suspense>
  );
}
