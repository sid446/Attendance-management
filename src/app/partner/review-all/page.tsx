'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';

interface Request {
  _id: string;
  userName: string;
  date: string;
  requestedStatus: string;
  reason: string;
  startTime?: string;
  endTime?: string;
  originalCheckin?: string;
  originalCheckout?: string;
}

interface RequestGroup {
  userName: string;
  requestedStatus: string;
  dates: string[];
  dateDisplay: string;
  reason: string;
  timeRange: string;
  originalTimeRange: string;
  requestIds: string[];
}

function ReviewAllPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const accessToken = searchParams.get('token') || '';
  const [requestGroups, setRequestGroups] = useState<RequestGroup[]>([]);
  const [selectedGroupIds, setSelectedGroupIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [remarks, setRemarks] = useState<{ [key: string]: string }>({});
  const [values, setValues] = useState<{ [key: string]: string }>({});
  const [processing, setProcessing] = useState(false);
  const [processingGroups, setProcessingGroups] = useState<{ [key: string]: boolean }>({});
  const [leaveTypeFilter, setLeaveTypeFilter] = useState<string>('all');
  const [personFilter, setPersonFilter] = useState<string>('all');

  const APPROVE_CHIPS = ['Done', 'Missed Entry', 'Client Visit', 'Emergency', 'Approved'];
  const REJECT_CHIPS = ['Insufficient Hours', 'Incorrect Date', 'Incorrect Entry', 'Not Discussed', 'Proof Required'];

  // Helper function to get max value based on request type
  const getMaxValueForType = (requestedStatus: string): number => {
    const status = requestedStatus.toLowerCase();
    if (status.includes('half')) return 0.5;
    if (status.includes('wfh')) return 0.75;
    if (status.includes('outstation')) return 1.2;
    return 1;
  };

  // Helper function to get default value based on request type
  const getDefaultValueForType = (requestedStatus: string): string => {
    const status = requestedStatus.toLowerCase();
    if (status.includes('half')) return '0.5';
    if (status.includes('wfh')) return '0.75';
    if (status.includes('outstation')) return '1.2';
    return '1';
  };

  const isFixedValueType = (requestedStatus: string): boolean => {
    const status = requestedStatus.toLowerCase();
    return status.includes('half') || status.includes('leave') || requestedStatus === 'On leave';
  };

  const isLeaveRequestType = (requestedStatus: string): boolean => {
    const status = requestedStatus.toLowerCase();
    return status.includes('leave') || requestedStatus === 'On leave';
  };

  useEffect(() => {
    if (!accessToken) {
      setError('Secure partner access token not provided');
      setLoading(false);
      return;
    }

    fetch(`/api/partner/pending-requests?token=${encodeURIComponent(accessToken)}`)
      .then(res => res.json())
      .then(data => {
        if (data.success) {
          const groups = groupRequests(data.data);
          setRequestGroups(groups);
          const initialRemarks: { [key: string]: string } = {};
          groups.forEach((_, index) => {
            initialRemarks[index.toString()] = 'Done';
          });
          setRemarks(initialRemarks);
        } else {
          setError(data.error || 'Failed to load requests');
        }
      })
      .catch(() => setError('Failed to load requests'))
      .finally(() => setLoading(false));
  }, [accessToken]);

  const groupRequests = (requests: Request[]): RequestGroup[] => {
    const groupMap: { [key: string]: Request[] } = {};
    requests.forEach(req => {
      const key = isLeaveRequestType(req.requestedStatus) ? `${req.userName}-${req.requestedStatus}` : req._id;
      if (!groupMap[key]) groupMap[key] = [];
      groupMap[key].push(req);
    });

    return Object.values(groupMap).map(requests => {
      const req = requests[0];
      const dates = requests.map(r => r.date).sort();
      return {
        userName: req.userName,
        requestedStatus: req.requestedStatus,
        dates,
        dateDisplay: getDateDisplay(dates),
        reason: req.reason,
        timeRange: req.startTime && req.endTime ? `${req.startTime} - ${req.endTime}` : '-',
        originalTimeRange: (req.originalCheckin || req.originalCheckout) 
          ? `${req.originalCheckin || '??:??'} - ${req.originalCheckout || '??:??'}` 
          : '-',
        requestIds: requests.map(r => r._id)
      };
    });
  };

  const formatDate = (dateStr: string): string => {
    const date = new Date(dateStr);
    const day = date.getDate();
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return `${day} ${months[date.getMonth()]} ${date.getFullYear()}`;
  };

  const getDateDisplay = (dates: string[]): string => {
    if (dates.length === 1) return formatDate(dates[0]);
    const ranges: string[] = [];
    let start = dates[0];
    let prev = dates[0];
    for (let i = 1; i < dates.length; i++) {
      const current = dates[i];
      const diff = (new Date(current).getTime() - new Date(prev).getTime()) / (1000 * 60 * 60 * 24);
      if (diff > 1) {
        ranges.push(start === prev ? formatDate(start) : `${formatDate(start)} to ${formatDate(prev)}`);
        start = current;
      }
      prev = current;
    }
    ranges.push(start === prev ? formatDate(start) : `${formatDate(start)} to ${formatDate(prev)}`);
    return ranges.join(', ');
  };

  const getUniqueLeaveTypes = () => Array.from(new Set(requestGroups.map(g => g.requestedStatus))).sort();
  const getUniquePersons = () => Array.from(new Set(requestGroups.map(g => g.userName))).sort();

  const getFilteredRequestGroups = () => {
    return requestGroups.filter(group => {
      const matchesLeaveType = leaveTypeFilter === 'all' || group.requestedStatus === leaveTypeFilter;
      const matchesPerson = personFilter === 'all' || group.userName === personFilter;
      return matchesLeaveType && matchesPerson;
    });
  };

  const handleSelectGroup = (groupId: string, checked: boolean) => {
    setSelectedGroupIds(prev => checked ? [...prev, groupId] : prev.filter(id => id !== groupId));
  };

  const handleSelectAll = (checked: boolean) => {
    const filtered = getFilteredRequestGroups();
    setSelectedGroupIds(checked ? filtered.map(g => requestGroups.indexOf(g).toString()) : []);
  };

  const processAction = async (action: 'approve' | 'reject', groupIds: string[]) => {
    if (processing || groupIds.length === 0) return;
    setProcessing(true);
    
    // Mark groups as processing
    const newProcessing = { ...processingGroups };
    groupIds.forEach(id => { newProcessing[id] = true; });
    setProcessingGroups(newProcessing);

    try {
      // Process each group independently to support unique remarks/values
      const results = await Promise.all(groupIds.map(async (id) => {
        const group = requestGroups[parseInt(id)];
        const remark = remarks[id] || 'Done';
        const value = values[id] || getDefaultValueForType(group.requestedStatus);

        try {
          const res = await fetch('/api/partner/bulk-action', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              action,
              ids: group.requestIds,
              remark,
              value,
              accessToken
            }),
          });
          return { id, success: res.ok };
        } catch (err) {
          return { id, success: false };
        }
      }));

      const failedCount = results.filter(r => !r.success).length;
      if (failedCount > 0) {
        alert(`${failedCount} groups failed to process. The list will refresh.`);
      }

      // Refresh data
      window.location.reload();
    } catch (err) {
      alert(`Error processing ${action}`);
    } finally {
      setProcessing(false);
      setProcessingGroups({});
    }
  };

  const handleDirectAction = (groupId: string, action: 'approve' | 'reject') => processAction(action, [groupId]);

  const handleBulkAction = (action: 'approve' | 'reject') => {
    if (window.confirm(`Are you sure you want to ${action} ${selectedGroupIds.length} request(s)?`)) {
      processAction(action, selectedGroupIds);
    }
  };

  const [expandedReasons, setExpandedReasons] = useState<{ [key: string]: boolean }>({});

  const toggleReason = (idx: string) => {
    setExpandedReasons(prev => ({ ...prev, [idx]: !prev[idx] }));
  };

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-slate-950">
      <div className="text-center">
        <div className="animate-spin rounded-full h-10 w-10 border-2 border-slate-700 border-t-emerald-500 mx-auto"></div>
        <p className="mt-4 text-slate-400 text-sm">Loading requests...</p>
      </div>
    </div>
  );

  if (error) return (
    <div className="min-h-screen flex items-center justify-center bg-slate-950 p-4">
      <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl text-center max-w-sm w-full">
        <h2 className="text-lg font-semibold text-white mb-2">Something went wrong</h2>
        <p className="text-slate-400 text-sm">{error}</p>
        <button onClick={() => window.location.reload()} className="mt-4 px-4 py-2 bg-emerald-600 rounded-lg text-white text-sm">Retry</button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-950 selection:bg-emerald-500/30">
      {/* Refined Header */}
      <header className="sticky top-0 z-50 bg-slate-900/90 backdrop-blur-lg border-b border-white/10">
        <div className="max-w-4xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button 
              onClick={() => router.push('/employee/dashboard')} 
              className="p-2 -ml-2 rounded-xl text-slate-400 hover:text-white hover:bg-white/5 transition-all"
            >
              <ArrowLeft className="h-6 w-6" />
            </button>
            <div>
              <h1 className="text-lg font-bold text-white tracking-tight leading-none">Review Requests</h1>
              <p className="text-[11px] font-bold text-emerald-500 uppercase tracking-widest mt-1">Partner Review Portal</p>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-2 py-4 pb-40">
        {requestGroups.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-slate-500">
            <p className="text-base font-medium">All pending requests cleared!</p>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Clearer Filters */}
            <div className="grid grid-cols-2 gap-3 mb-4 px-1">
              <select 
                value={leaveTypeFilter} 
                onChange={(e) => setLeaveTypeFilter(e.target.value)} 
                className="w-full h-10 px-3 bg-slate-900 border border-white/10 rounded-xl text-xs text-slate-200"
              >
                <option value="all">All Types</option>
                {getUniqueLeaveTypes().map(t => <option key={t} value={t}>{t}</option>)}
              </select>
              <select 
                value={personFilter} 
                onChange={(e) => setPersonFilter(e.target.value)} 
                className="w-full h-10 px-3 bg-slate-900 border border-white/10 rounded-xl text-xs text-slate-200"
              >
                <option value="all">All Employees</option>
                {getUniquePersons().map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>

            {/* Selection Status */}
            <div className="flex items-center justify-between px-2 mb-2">
              <label className="flex items-center gap-3 cursor-pointer group">
                <input 
                  type="checkbox" 
                  checked={getFilteredRequestGroups().length > 0 && getFilteredRequestGroups().every(g => selectedGroupIds.includes(requestGroups.indexOf(g).toString()))} 
                  onChange={(e) => handleSelectAll(e.target.checked)} 
                  className="h-5 w-5 rounded border-white/20 bg-slate-900 text-emerald-500" 
                />
                <span className="text-[11px] font-bold text-slate-400 uppercase">Select All</span>
              </label>
              <span className="text-[11px] font-bold text-slate-500 bg-white/5 px-3 py-1 rounded-full uppercase tracking-tighter">{getFilteredRequestGroups().length} pending</span>
            </div>

            <div className="space-y-2">
              {getFilteredRequestGroups().map((group) => {
                const idx = requestGroups.indexOf(group).toString();
                const isSelected = selectedGroupIds.includes(idx);
                const isExpanded = expandedReasons[idx];
                const isLeave = group.requestedStatus.toLowerCase().includes('leave') || group.requestedStatus === 'On leave';
                
                return (
                  <div 
                    key={idx} 
                    className={`relative rounded-2xl border transition-all duration-200 ${
                      isSelected 
                        ? 'border-emerald-500/50 bg-emerald-500/[0.03]' 
                        : 'border-white/5 bg-slate-900/40 hover:bg-slate-900/60'
                    }`}
                  >
                    <div className="p-3 sm:p-4">
                      <div className="flex items-start gap-3">
                        <div className="mt-1">
                          <input 
                            type="checkbox" 
                            checked={isSelected} 
                            onChange={(e) => handleSelectGroup(idx, e.target.checked)} 
                            className="h-5 w-5 rounded border-white/10 bg-slate-800 text-emerald-500" 
                          />
                        </div>

                        <div className="flex-1 min-w-0">
                          {/* Row 1: Name, Status & Date */}
                          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 mb-2.5">
                            <div className="flex items-center gap-2 min-w-0">
                              <h3 className="text-sm font-bold text-white truncate">{group.userName}</h3>
                              <span className={`px-2 py-0.5 rounded-lg text-[9px] font-black uppercase tracking-widest border ${
                                isLeave ? 'bg-amber-500/10 text-amber-500 border-amber-500/20' : 'bg-blue-500/10 text-blue-400 border-blue-500/20'
                              }`}>
                                {group.requestedStatus}
                              </span>
                            </div>
                            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-tighter">{group.dateDisplay}</p>
                          </div>

                          {/* Row 2: Two-Column Side-by-Side (Time vs Reason) */}
                          <div className="grid grid-cols-2 gap-3 mb-3">
                            {/* Left: Times */}
                            <div className="flex flex-col gap-1.5 p-2 bg-white/[0.02] rounded-xl border border-white/5">
                              <div className="flex items-center justify-between text-[10px] font-mono text-slate-500 uppercase tracking-tight">
                                <span>Actual</span>
                                <span>Request</span>
                              </div>
                              <div className="flex items-center justify-between gap-2 text-xs font-mono">
                                <span className="text-slate-400">{group.originalTimeRange === '-' ? '--:--' : group.originalTimeRange}</span>
                                <svg className="w-3 h-3 text-slate-700 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M13 7l5 5m0 0l-5 5m5-5H6" /></svg>
                                <span className="text-emerald-500 font-black">{group.timeRange === '-' ? '--:--' : group.timeRange}</span>
                              </div>
                            </div>

                            {/* Right: Reason */}
                            <div 
                              onClick={() => toggleReason(idx)}
                              className={`p-2 bg-white/[0.02] border border-white/5 rounded-xl cursor-pointer hover:bg-white/[0.05] transition-all relative ${isExpanded ? 'z-10' : ''}`}
                            >
                              <div className="flex items-center gap-1.5 mb-1 text-[10px] font-bold text-slate-500 uppercase tracking-tight">
                                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 8h10M7 12h4" /></svg>
                                <span>Reason</span>
                              </div>
                              <p className={`text-[11px] leading-relaxed text-slate-400 italic ${isExpanded ? '' : 'line-clamp-2'}`}>
                                {group.reason || 'No reason provided'}
                              </p>
                              {group.reason && group.reason.length > 40 && !isExpanded && (
                                <div className="absolute bottom-1 right-2 text-[9px] font-bold text-emerald-500/50">TAP TO EXPAND</div>
                              )}
                            </div>
                          </div>

                          {/* Row 3: Compact Action Bar */}
                          <div className="flex flex-col sm:flex-row gap-2">
                            <div className="flex-1 flex flex-col gap-1.5">
                              <div className="flex gap-2">
                                <div className="flex-1 relative">
                                  <input 
                                    type="text" 
                                    value={remarks[idx] || ''} 
                                    onChange={(e) => setRemarks({...remarks, [idx]: e.target.value})} 
                                    className="w-full h-9 px-3 bg-slate-900 border border-white/10 rounded-xl text-xs text-white placeholder:text-slate-600 focus:border-emerald-500/50" 
                                    placeholder="Remark..." 
                                  />
                                </div>
                                {!isFixedValueType(group.requestedStatus) && (
                                  <input 
                                    type="number" 
                                    step="0.01" 
                                    value={values[idx] ?? getDefaultValueForType(group.requestedStatus)} 
                                    onChange={(e) => setValues({...values, [idx]: e.target.value})} 
                                    className="w-14 h-9 bg-slate-900 border border-white/10 rounded-xl text-center text-xs font-bold text-emerald-400" 
                                  />
                                )}
                              </div>
                              {/* Wrapped Chips - All Visible */}
                              <div className="flex flex-wrap items-center gap-1.5 select-none">
                                {APPROVE_CHIPS.map(c => (
                                  <button 
                                    key={c} 
                                    onClick={() => setRemarks({...remarks, [idx]: c})} 
                                    className="px-2 py-1 bg-emerald-500/5 hover:bg-emerald-500/10 rounded-lg text-[10px] font-bold text-emerald-500/70 border border-emerald-500/10 transition-colors"
                                  >
                                    {c}
                                  </button>
                                ))}
                                {REJECT_CHIPS.map(c => (
                                  <button 
                                    key={c} 
                                    onClick={() => setRemarks({...remarks, [idx]: c})} 
                                    className="px-2 py-1 bg-rose-500/5 hover:bg-rose-500/10 rounded-lg text-[10px] font-bold text-rose-500/60 border border-rose-500/10 transition-colors"
                                  >
                                    {c}
                                  </button>
                                ))}
                              </div>
                            </div>
                            <div className="flex gap-1.5 shrink-0 items-start">
                              <button 
                                onClick={() => handleDirectAction(idx, 'reject')} 
                                disabled={processingGroups[idx]} 
                                className="h-9 px-3 bg-slate-800 hover:bg-rose-500/10 border border-white/5 rounded-xl text-[11px] font-bold text-slate-400 hover:text-rose-400 active:scale-95 transition-all"
                              >
                                Reject
                              </button>
                              <button 
                                onClick={() => handleDirectAction(idx, 'approve')} 
                                disabled={processingGroups[idx]} 
                                className="h-9 px-6 bg-emerald-600 hover:bg-emerald-500 rounded-xl text-[11px] font-black text-white shadow-lg shadow-emerald-600/10 active:scale-95 transition-all flex items-center gap-2"
                              >
                                {processingGroups[idx] ? <div className="h-3 w-3 border-2 border-white/30 border-t-white rounded-full animate-spin"></div> : 'Approve'}
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </main>

      {/* Prominent Bulk Action Bar */}
      {requestGroups.length > 0 && selectedGroupIds.length > 0 && (
        <div className="fixed bottom-8 left-1/2 -translate-x-1/2 w-[94%] max-w-lg z-[60] animate-in fade-in slide-in-from-bottom-6 duration-500">
          <div className="bg-slate-900/95 backdrop-blur-2xl border border-white/10 rounded-3xl p-3 shadow-[0_20px_50px_rgba(0,0,0,0.5)]">
            <div className="flex items-center gap-3">
              <button 
                onClick={() => handleBulkAction('reject')} 
                disabled={processing}
                className="flex-1 h-14 bg-white/5 hover:bg-rose-500/10 rounded-2xl text-sm font-bold text-slate-300 hover:text-rose-400 transition-all active:scale-95 disabled:opacity-50"
              >
                Bulk Reject ({selectedGroupIds.length})
              </button>
              <button 
                onClick={() => handleBulkAction('approve')} 
                disabled={processing}
                className="flex-[1.5] h-14 bg-emerald-500 hover:bg-emerald-400 rounded-2xl text-sm font-black text-white shadow-2xl shadow-emerald-500/30 transition-all active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {processing ? (
                  <div className="h-5 w-5 border-3 border-white/30 border-t-white rounded-full animate-spin"></div>
                ) : (
                  <>
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={3}><path d="M5 13l4 4L19 7" /></svg>
                    Bulk Approve
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function ReviewAllPage() {
  return (
    <Suspense fallback={<div className="flex justify-center items-center min-h-screen">Loading...</div>}>
      <ReviewAllPageContent />
    </Suspense>
  );
}