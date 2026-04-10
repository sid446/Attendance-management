"use client";
import React, { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { Clock, Calendar, Loader2, CheckCircle, AlertTriangle, Send, ArrowLeft } from 'lucide-react';

interface InvalidRecord {
  date: string;
  checkin: string;
  checkout: string;
  issue: 'missing-checkin' | 'missing-checkout';
}

interface CorrectionData {
  date: string;
  originalCheckin: string;
  originalCheckout: string;
  newCheckin: string;
  newCheckout: string;
  reason: string;
}

function FixAttendanceContent() {
  const searchParams = useSearchParams();
  const userId = searchParams.get('userId');
  const monthYear = searchParams.get('monthYear');

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [invalidRecords, setInvalidRecords] = useState<InvalidRecord[]>([]);
  const [userName, setUserName] = useState<string>('');
  const [corrections, setCorrections] = useState<Map<string, CorrectionData>>(new Map());
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [submitResult, setSubmitResult] = useState<{ success: number; failed: number } | null>(null);

  useEffect(() => {
    if (!userId || !monthYear) {
      setError('Invalid link. Please use the link from your email.');
      setLoading(false);
      return;
    }
    fetchInvalidRecords();
  }, [userId, monthYear]);

  const fetchInvalidRecords = async () => {
    try {
      const response = await fetch(`/api/employee/invalid-records?userId=${userId}&monthYear=${monthYear}`);
      const result = await response.json();
      
      if (result.success) {
        setInvalidRecords(result.data.records || []);
        setUserName(result.data.userName || '');
        
        // Initialize corrections map
        const initialCorrections = new Map<string, CorrectionData>();
        for (const record of result.data.records || []) {
          initialCorrections.set(record.date, {
            date: record.date,
            originalCheckin: record.checkin,
            originalCheckout: record.checkout,
            newCheckin: record.issue === 'missing-checkin' ? '' : record.checkin,
            newCheckout: record.issue === 'missing-checkout' ? '' : record.checkout,
            reason: ''
          });
        }
        setCorrections(initialCorrections);
      } else {
        setError(result.error || 'Failed to fetch records');
      }
    } catch (err) {
      setError('Failed to fetch records. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const updateCorrection = (date: string, field: 'newCheckin' | 'newCheckout' | 'reason', value: string) => {
    setCorrections(prev => {
      const next = new Map(prev);
      const current = next.get(date);
      if (current) {
        next.set(date, { ...current, [field]: value });
      }
      return next;
    });
  };

  const handleSubmit = async () => {
    // Validate that all required fields are filled
    const correctionsToSubmit: CorrectionData[] = [];
    
    for (const [date, correction] of corrections.entries()) {
      const record = invalidRecords.find(r => r.date === date);
      if (!record) continue;

      // Check if correction is needed and provided
      const needsCheckin = record.issue === 'missing-checkin';
      const needsCheckout = record.issue === 'missing-checkout';

      if (needsCheckin && !correction.newCheckin) {
        setError(`Please provide check-in time for ${formatDate(date)}`);
        return;
      }
      if (needsCheckout && !correction.newCheckout) {
        setError(`Please provide check-out time for ${formatDate(date)}`);
        return;
      }

      // Only submit if there's actual correction data
      if (correction.newCheckin || correction.newCheckout) {
        correctionsToSubmit.push(correction);
      }
    }

    if (correctionsToSubmit.length === 0) {
      setError('Please provide at least one correction');
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const response = await fetch('/api/employee/submit-corrections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          monthYear,
          corrections: correctionsToSubmit
        })
      });

      const result = await response.json();

      if (result.success) {
        setSubmitted(true);
        setSubmitResult({ success: result.successCount || correctionsToSubmit.length, failed: result.failedCount || 0 });
      } else {
        setError(result.error || 'Failed to submit corrections');
      }
    } catch (err) {
      setError('Failed to submit corrections. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
  };

  const getIssueLabel = (issue: InvalidRecord['issue']) => {
    switch (issue) {
      case 'missing-checkin': return 'Missing Check-in';
      case 'missing-checkout': return 'Missing Check-out';
    }
  };

  const getIssueColor = (issue: InvalidRecord['issue']) => {
    switch (issue) {
      case 'missing-checkin': return 'bg-amber-500/10 text-amber-400 border-amber-500/30';
      case 'missing-checkout': return 'bg-orange-500/10 text-orange-400 border-orange-500/30';
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-8 h-8 text-emerald-400 animate-spin mx-auto mb-4" />
          <p className="text-zinc-400">Loading your attendance records...</p>
        </div>
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-zinc-900 border border-zinc-800 rounded-xl p-8 text-center">
          <div className="w-16 h-16 bg-emerald-500/10 rounded-full flex items-center justify-center mx-auto mb-6">
            <CheckCircle className="w-8 h-8 text-emerald-400" />
          </div>
          <h1 className="text-2xl font-bold text-white mb-2">Corrections Submitted!</h1>
          <p className="text-zinc-400 mb-6">
            {submitResult?.success} correction{submitResult?.success !== 1 ? 's' : ''} have been sent to your work partner for approval.
            You will be notified once they are reviewed.
          </p>
          <a
            href="/employee/dashboard"
            className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-6 py-3 font-medium text-white transition-colors hover:bg-emerald-500"
          >
            <ArrowLeft className="w-4 h-4" />
            Go to Dashboard
          </a>
        </div>
      </div>
    );
  }

  if (error && invalidRecords.length === 0) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-zinc-900 border border-zinc-800 rounded-xl p-8 text-center">
          <div className="w-16 h-16 bg-rose-500/10 rounded-full flex items-center justify-center mx-auto mb-6">
            <AlertTriangle className="w-8 h-8 text-rose-400" />
          </div>
          <h1 className="text-2xl font-bold text-white mb-2">Unable to Load Records</h1>
          <p className="text-zinc-400 mb-6">{error}</p>
          <a
            href="/employee/dashboard"
            className="inline-flex items-center gap-2 px-6 py-3 bg-zinc-700 hover:bg-zinc-600 text-white font-medium rounded-lg transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Go to Dashboard
          </a>
        </div>
      </div>
    );
  }

  const [year, month] = (monthYear || '').split('-');
  const monthName = year && month 
    ? new Date(parseInt(year), parseInt(month) - 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
    : '';

  return (
    <div className="min-h-screen bg-zinc-950">
      {/* Header */}
      <header className="border-b border-zinc-800/90 bg-zinc-950/90 px-4 py-4 backdrop-blur-md">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold text-white">Fix Attendance Records</h1>
            <p className="text-sm text-zinc-400">{userName} • {monthName}</p>
          </div>
          <a
            href="/employee/dashboard"
            className="flex items-center gap-2 px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-sm rounded-lg transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Dashboard
          </a>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-4xl mx-auto p-4 sm:p-6">
        {/* Info Box */}
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-4 mb-6">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
            <div>
              <h3 className="font-medium text-amber-200">Please provide the missing times</h3>
              <p className="text-sm text-amber-200/70 mt-1">
                Enter the correct check-in/check-out times for each record below. 
                Your corrections will be sent to your work partner for approval.
              </p>
            </div>
          </div>
        </div>

        {/* Error Message */}
        {error && (
          <div className="bg-rose-500/10 border border-rose-500/30 rounded-lg p-4 mb-6">
            <p className="text-rose-200 text-sm">{error}</p>
          </div>
        )}

        {/* Records List */}
        <div className="space-y-4">
          {invalidRecords.map((record) => {
            const correction = corrections.get(record.date);
            const needsCheckin = record.issue === 'missing-checkin';
            const needsCheckout = record.issue === 'missing-checkout';

            return (
              <div
                key={record.date}
                className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden"
              >
                {/* Record Header */}
                <div className="bg-zinc-800/50 px-4 py-3 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Calendar className="w-4 h-4 text-zinc-400" />
                    <span className="font-medium text-white">{formatDate(record.date)}</span>
                  </div>
                  <span className={`text-xs px-2 py-1 rounded border ${getIssueColor(record.issue)}`}>
                    {getIssueLabel(record.issue)}
                  </span>
                </div>

                {/* Record Body */}
                <div className="p-4">
                  {/* Original Times */}
                  <div className="flex gap-6 mb-4 text-sm">
                    <div>
                      <span className="text-zinc-500">Original Check-in: </span>
                      <span className={needsCheckin ? 'text-rose-400' : 'text-zinc-300'}>
                        {record.checkin || '—'}
                      </span>
                    </div>
                    <div>
                      <span className="text-zinc-500">Original Check-out: </span>
                      <span className={needsCheckout ? 'text-rose-400' : 'text-zinc-300'}>
                        {record.checkout || '—'}
                      </span>
                    </div>
                  </div>

                  {/* Correction Inputs */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {needsCheckin && (
                      <div>
                        <label className="block text-xs font-medium text-zinc-300 mb-1">
                          Correct Check-in Time *
                        </label>
                        <div className="relative">
                          <Clock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
                          <input
                            type="time"
                            value={correction?.newCheckin || ''}
                            onChange={(e) => updateCorrection(record.date, 'newCheckin', e.target.value)}
                            className="w-full pl-10 pr-4 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-zinc-200 focus:border-emerald-500 focus:outline-none"
                          />
                        </div>
                      </div>
                    )}
                    {needsCheckout && (
                      <div>
                        <label className="block text-xs font-medium text-zinc-300 mb-1">
                          Correct Check-out Time *
                        </label>
                        <div className="relative">
                          <Clock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
                          <input
                            type="time"
                            value={correction?.newCheckout || ''}
                            onChange={(e) => updateCorrection(record.date, 'newCheckout', e.target.value)}
                            className="w-full pl-10 pr-4 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-zinc-200 focus:border-emerald-500 focus:outline-none"
                          />
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Reason Input */}
                  <div className="mt-4">
                    <label className="block text-xs font-medium text-zinc-300 mb-1">
                      Reason (optional)
                    </label>
                    <input
                      type="text"
                      value={correction?.reason || ''}
                      onChange={(e) => updateCorrection(record.date, 'reason', e.target.value)}
                      placeholder="e.g., Thumb machine was not working"
                      className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-4 py-2 text-zinc-200 placeholder:text-zinc-600 focus:border-emerald-500 focus:outline-none"
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Submit Button */}
        <div className="mt-8 flex justify-center">
          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="flex items-center gap-2 rounded-lg bg-emerald-600 px-8 py-3 font-semibold text-white transition-colors hover:bg-emerald-500 disabled:cursor-not-allowed disabled:bg-emerald-900"
          >
            {submitting ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <Send className="w-5 h-5" />
            )}
            <span>{submitting ? 'Submitting...' : 'Submit for Approval'}</span>
          </button>
        </div>

        <p className="text-center text-xs text-zinc-500 mt-4">
          Your corrections will be reviewed by your work partner before being applied.
        </p>
      </main>
    </div>
  );
}

export default function FixAttendancePage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-emerald-400 animate-spin" />
      </div>
    }>
      <FixAttendanceContent />
    </Suspense>
  );
}
