'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';

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
  const searchParams = useSearchParams();
  const partnerName = searchParams.get('partnerName') || searchParams.get('partner');
  const partnerEmail = searchParams.get('partnerEmail');
  const [requestGroups, setRequestGroups] = useState<RequestGroup[]>([]);
  const [selectedGroupIds, setSelectedGroupIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [modalAction, setModalAction] = useState<'approve' | 'reject'>('approve');
  const [showSameRemarkModal, setShowSameRemarkModal] = useState(false);
  const [showSameValueModal, setShowSameValueModal] = useState(false);
  const [applySameRemark, setApplySameRemark] = useState(true);
  const [applySameValue, setApplySameValue] = useState(true);
  const [remarks, setRemarks] = useState<{ [key: string]: string }>({});
  const [values, setValues] = useState<{ [key: string]: string }>({});
  const [processing, setProcessing] = useState(false);
  const [leaveTypeFilter, setLeaveTypeFilter] = useState<string>('all');
  const [personFilter, setPersonFilter] = useState<string>('all');

  // Helper function to get max value based on request type
  const getMaxValueForType = (requestedStatus: string): number => {
    const status = requestedStatus.toLowerCase();
    if (status.includes('half')) {
      return 0.5; // Fixed value for half-day
    }
    if (status.includes('wfh')) {
      return 0.75;
    }
    if (status.includes('outstation')) {
      return 1.2;
    }
    return 1;
  };

  // Helper function to get default value based on request type
  const getDefaultValueForType = (requestedStatus: string): string => {
    const status = requestedStatus.toLowerCase();
    if (status.includes('half')) {
      return '0.5'; // Fixed value for half-day
    }
    if (status.includes('wfh')) {
      return '0.75';
    }
    if (status.includes('outstation')) {
      return '1.2'; // Default to max value for outstation
    }
    return '1';
  };

  // Helper function to check if request type has fixed value (no editing allowed)
  const isFixedValueType = (requestedStatus: string): boolean => {
    const status = requestedStatus.toLowerCase();
    return status.includes('half') || status.includes('leave') || requestedStatus === 'On leave';
  };

  // Get max value for all selected groups (use the highest max among them)
  const getMaxValueForSelected = (): number => {
    if (selectedGroupIds.length === 0) return 1;
    return Math.max(...selectedGroupIds.map(id => {
      const group = requestGroups[parseInt(id)];
      return getMaxValueForType(group?.requestedStatus || '');
    }));
  };

  useEffect(() => {
    if (!partnerName) {
      setError('Partner name not provided');
      setLoading(false);
      return;
    }

    fetch(`/api/partner/pending-requests?partnerName=${encodeURIComponent(partnerName)}`)
      .then(res => res.json())
      .then(data => {
        if (data.success) {
          const groups = groupRequests(data.data);
          setRequestGroups(groups);
        } else {
          setError(data.error || 'Failed to load requests');
        }
      })
      .catch(err => {
        setError('Failed to load requests');
      })
      .finally(() => setLoading(false));
  }, [partnerName]);

  const groupRequests = (requests: Request[]): RequestGroup[] => {
    const groupMap: { [key: string]: Request[] } = {};
    requests.forEach(req => {
      // For time corrections (requests with startTime/endTime), don't group - each date is separate
      const hasTimeCorrection = req.startTime && req.endTime;
      const timeKey = hasTimeCorrection ? `${req.startTime}-${req.endTime}` : 'no-time';
      const key = `${req.userName}-${req.requestedStatus}-${timeKey}`;
      if (!groupMap[key]) groupMap[key] = [];
      groupMap[key].push(req);
    });

    return Object.values(groupMap).map(requests => {
      const userName = requests[0].userName;
      const requestedStatus = requests[0].requestedStatus;
      const reason = requests[0].reason;
      const dates = requests.map(r => r.date).sort();
      const dateDisplay = getDateDisplay(dates);
      const timeRange = requests[0].startTime && requests[0].endTime ? `${requests[0].startTime} - ${requests[0].endTime}` : '-';
      const originalTimeRange = requests[0].originalCheckin && requests[0].originalCheckout ? `${requests[0].originalCheckin} - ${requests[0].originalCheckout}` : '-';
      const requestIds = requests.map(r => r._id);
      return { userName, requestedStatus, dates, dateDisplay, reason, timeRange, originalTimeRange, requestIds };
    });
  };

  // Format date from "2026-01-29" to "29 Jan 2026"
  const formatDate = (dateStr: string): string => {
    const date = new Date(dateStr);
    const day = date.getDate();
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const month = months[date.getMonth()];
    const year = date.getFullYear();
    return `${day} ${month} ${year}`;
  };

  const getDateDisplay = (dates: string[]): string => {
    if (dates.length === 1) return formatDate(dates[0]);
    const ranges: string[] = [];
    let start = dates[0];
    let prev = dates[0];
    for (let i = 1; i < dates.length; i++) {
      const current = dates[i];
      const prevDate = new Date(prev);
      const currDate = new Date(current);
      const diff = (currDate.getTime() - prevDate.getTime()) / (1000 * 60 * 60 * 24);
      if (diff > 1) {
        if (start === prev) {
          ranges.push(formatDate(start));
        } else {
          ranges.push(`${formatDate(start)} to ${formatDate(prev)}`);
        }
        start = current;
      }
      prev = current;
    }
    if (start === prev) {
      ranges.push(formatDate(start));
    } else {
      ranges.push(`${formatDate(start)} to ${formatDate(prev)}`);
    }
    return ranges.join(', ');
  };

  // Get unique filter options from request groups
  const getUniqueLeaveTypes = () => {
    const types = new Set(requestGroups.map(group => group.requestedStatus));
    return Array.from(types).sort();
  };

  const getUniquePersons = () => {
    const persons = new Set(requestGroups.map(group => group.userName));
    return Array.from(persons).sort();
  };

  // Filter request groups based on selected filters
  const getFilteredRequestGroups = () => {
    return requestGroups.filter(group => {
      const matchesLeaveType = leaveTypeFilter === 'all' || group.requestedStatus === leaveTypeFilter;
      const matchesPerson = personFilter === 'all' || group.userName === personFilter;
      return matchesLeaveType && matchesPerson;
    });
  };

  const handleSelectGroup = (groupId: string, checked: boolean) => {
    if (checked) {
      setSelectedGroupIds(prev => [...prev, groupId]);
    } else {
      setSelectedGroupIds(prev => prev.filter(id => id !== groupId));
    }
  };

  const handleSelectAll = (checked: boolean) => {
    const filteredGroups = getFilteredRequestGroups();
    if (checked) {
      const originalIndices = filteredGroups.map(group => requestGroups.indexOf(group).toString());
      setSelectedGroupIds(originalIndices);
    } else {
      setSelectedGroupIds([]);
    }
  };

  const openModal = (action: 'approve' | 'reject') => {
    if (selectedGroupIds.length === 0) {
      alert('Please select at least one request group');
      return;
    }
    setModalAction(action);
    setShowSameRemarkModal(true);
  };

  const handleSameRemarkChoice = (same: boolean) => {
    setApplySameRemark(same);
    setShowSameRemarkModal(false);
    if (modalAction === 'approve' && same) {
      setShowSameValueModal(true);
    } else {
      setShowModal(true);
      // Initialize remarks and values
      const selectedGroups = selectedGroupIds.map(id => requestGroups[parseInt(id)]);
      if (same) {
        setRemarks({ all: '' });
        if (modalAction === 'approve') {
          // Use the default value for the selected groups
          const defaultVal = getMaxValueForSelected() === 0.75 ? '0.75' : '1';
          setValues({ all: defaultVal });
        }
      } else {
        const initialRemarks: { [key: string]: string } = {};
        const initialValues: { [key: string]: string } = {};
        selectedGroupIds.forEach(id => {
          const group = requestGroups[parseInt(id)];
          initialRemarks[id] = '';
          if (modalAction === 'approve') {
            initialValues[id] = getDefaultValueForType(group?.requestedStatus || '');
          }
        });
        setRemarks(initialRemarks);
        setValues(initialValues);
      }
    }
  };

  const handleSameValueChoice = (same: boolean) => {
    setApplySameValue(same);
    setShowSameValueModal(false);
    setShowModal(true);
    // Initialize remarks and values
    setRemarks({ all: '' });
    if (same) {
      // Use the default value for the selected groups
      const defaultVal = getMaxValueForSelected() === 0.75 ? '0.75' : '1';
      setValues({ all: defaultVal });
    } else {
      const initialValues: { [key: string]: string } = {};
      selectedGroupIds.forEach(id => {
        const group = requestGroups[parseInt(id)];
        initialValues[id] = getDefaultValueForType(group?.requestedStatus || '');
      });
      setValues(initialValues);
    }
  };

  const handleSubmit = async () => {
    setProcessing(true);
    try {
      const selectedGroups = selectedGroupIds.map(id => requestGroups[parseInt(id)]);
      const allRequestIds = selectedGroups.flatMap(g => g.requestIds);
      
      if (applySameRemark) {
        if (modalAction === 'approve' && !applySameValue) {
          // Same remark, different values
          const remark = remarks.all || 'Bulk Approved';
          for (const groupId of selectedGroupIds) {
            const group = requestGroups[parseInt(groupId)];
            const value = parseFloat(values[groupId] || '1');
            const res = await fetch('/api/partner/bulk-action', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                action: modalAction,
                ids: group.requestIds,
                remark,
                value,
                approvedBy: partnerName,
                approvedByEmail: partnerEmail
              })
            });
            if (!res.ok) {
              const data = await res.json();
              alert(`Failed to process group ${group.userName}: ${data.error}`);
              return;
            }
          }
          const totalRequests = selectedGroupIds.reduce((sum, id) => sum + requestGroups[parseInt(id)].requestIds.length, 0);
          alert(`${totalRequests} requests ${modalAction}d successfully`);
          window.location.reload();
        } else {
          // Same remark and same value (or reject)
          const remark = remarks.all || (modalAction === 'approve' ? 'Bulk Approved' : 'Bulk Rejected');
          const value = modalAction === 'approve' ? parseFloat(values.all || '1') : undefined;
          const res = await fetch('/api/partner/bulk-action', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              action: modalAction,
              ids: allRequestIds,
              remark,
              ...(value !== undefined && { value }),
              approvedBy: partnerName,
              approvedByEmail: partnerEmail
            })
          });
          if (res.ok) {
            alert(`${allRequestIds.length} requests ${modalAction}d successfully`);
            window.location.reload();
          } else {
            const data = await res.json();
            alert(data.error || 'Failed to process requests');
          }
        }
      } else {
        // Different remarks for each group
        for (const groupId of selectedGroupIds) {
          const group = requestGroups[parseInt(groupId)];
          const remark = remarks[groupId] || (modalAction === 'approve' ? 'Approved' : 'Rejected');
          const value = modalAction === 'approve' ? parseFloat(values[groupId] || '1') : undefined;
          const res = await fetch('/api/partner/bulk-action', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              action: modalAction,
              ids: group.requestIds,
              remark,
              ...(value !== undefined && { value }),
              approvedBy: partnerName,
              approvedByEmail: partnerEmail
            })
          });
          if (!res.ok) {
            const data = await res.json();
            alert(`Failed to process group ${group.userName}: ${data.error}`);
            return;
          }
        }
        const totalRequests = selectedGroupIds.reduce((sum, id) => sum + requestGroups[parseInt(id)].requestIds.length, 0);
        alert(`${totalRequests} requests ${modalAction}d successfully`);
        window.location.reload();
      }
    } catch (err) {
      alert('An error occurred');
    } finally {
      setProcessing(false);
      setShowModal(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950">
        <div className="text-center">
          <div className="animate-spin rounded-full h-10 w-10 border-2 border-slate-700 border-t-emerald-500 mx-auto"></div>
          <p className="mt-4 text-slate-400 text-sm">Loading requests...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950 p-4">
        <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl text-center max-w-sm w-full">
          <div className="w-12 h-12 bg-rose-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-6 h-6 text-rose-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h2 className="text-lg font-semibold text-white mb-2">Something went wrong</h2>
          <p className="text-slate-400 text-sm">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950">
      {/* Sticky Header */}
      <header className="sticky top-0 z-40 bg-slate-900/95 backdrop-blur-xl border-b border-slate-800/50">
        <div className="max-w-6xl mx-auto px-4 py-4">
          <div className="flex items-center gap-3">
            <img src="/lg.png" alt="Asija Logo" className="w-10 h-10 object-contain" />
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg sm:text-xl font-semibold text-white">Review Requests</h1>
                <span className="text-emerald-400 text-xs font-medium hidden sm:inline">Asija and Associates LLP</span>
              </div>
              <p className="text-slate-400 text-xs sm:text-sm mt-0.5">Approve or reject pending employee requests</p>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-3 sm:px-4 py-4 sm:py-6 pb-24">
        {requestGroups.length === 0 ? (
          <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-8 text-center">
            <div className="w-16 h-16 bg-slate-800 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
              </svg>
            </div>
            <p className="text-slate-400 text-sm">No pending requests</p>
          </div>
        ) : (
          <>
            {/* Filters Section */}
            <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-4 mb-4">
              <div className="flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-slate-400 uppercase tracking-wide">Filters</span>
                  {(leaveTypeFilter !== 'all' || personFilter !== 'all') && (
                    <button
                      onClick={() => {
                        setLeaveTypeFilter('all');
                        setPersonFilter('all');
                      }}
                      className="text-xs text-emerald-400 hover:text-emerald-300 font-medium touch-manipulation active:scale-95"
                    >
                      Clear All
                    </button>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-2 sm:gap-3">
                  <select
                    value={leaveTypeFilter}
                    onChange={(e) => setLeaveTypeFilter(e.target.value)}
                    className="w-full px-3 py-2.5 bg-slate-800 border border-slate-700 rounded-xl text-sm text-white focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 touch-manipulation"
                  >
                    <option value="all">All Types</option>
                    {getUniqueLeaveTypes().map(type => (
                      <option key={type} value={type}>{type}</option>
                    ))}
                  </select>
                  <select
                    value={personFilter}
                    onChange={(e) => setPersonFilter(e.target.value)}
                    className="w-full px-3 py-2.5 bg-slate-800 border border-slate-700 rounded-xl text-sm text-white focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 touch-manipulation"
                  >
                    <option value="all">All Employees</option>
                    {getUniquePersons().map(person => (
                      <option key={person} value={person}>{person}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {/* Select All Header */}
            <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-3 mb-3 flex items-center justify-between">
              <label className="flex items-center gap-3 cursor-pointer touch-manipulation">
                <div className="relative">
                  <input
                    type="checkbox"
                    checked={getFilteredRequestGroups().length > 0 && getFilteredRequestGroups().every(group => {
                      const originalIndex = requestGroups.indexOf(group);
                      return selectedGroupIds.includes(originalIndex.toString());
                    })}
                    onChange={(e) => handleSelectAll(e.target.checked)}
                    className="w-5 h-5 rounded-lg border-2 border-slate-600 bg-slate-800 text-emerald-500 focus:ring-emerald-500 focus:ring-offset-0 focus:ring-2"
                  />
                </div>
                <span className="text-sm font-medium text-white">Select All</span>
              </label>
              <span className="text-xs text-slate-500">
                {getFilteredRequestGroups().length} request{getFilteredRequestGroups().length !== 1 ? 's' : ''}
              </span>
            </div>

            {/* Request Cards - Mobile Optimized */}
            <div className="space-y-3 mb-24">
              {getFilteredRequestGroups().map((group) => {
                const originalIndex = requestGroups.findIndex(rg => rg === group);
                const isSelected = selectedGroupIds.includes(originalIndex.toString());
                return (
                  <div 
                    key={originalIndex} 
                    onClick={() => handleSelectGroup(originalIndex.toString(), !isSelected)}
                    className={`bg-slate-900/50 border rounded-2xl p-4 transition-all duration-200 touch-manipulation active:scale-[0.98] cursor-pointer ${
                      isSelected 
                        ? 'border-emerald-500/50 bg-emerald-500/5' 
                        : 'border-slate-800 hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      {/* Checkbox */}
                      <div className="pt-0.5">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={(e) => {
                            e.stopPropagation();
                            handleSelectGroup(originalIndex.toString(), e.target.checked);
                          }}
                          onClick={(e) => e.stopPropagation()}
                          className="w-5 h-5 rounded-lg border-2 border-slate-600 bg-slate-800 text-emerald-500 focus:ring-emerald-500 focus:ring-offset-0 focus:ring-2"
                        />
                      </div>
                      
                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        {/* Header Row */}
                        <div className="flex items-center justify-between gap-2 mb-2">
                          <span className="font-semibold text-white text-sm truncate">{group.userName}</span>
                          <span className={`shrink-0 px-2.5 py-1 rounded-full text-xs font-medium ${
                            group.requestedStatus.toLowerCase().includes('leave') || group.requestedStatus === 'On leave'
                              ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                              : 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                          }`}>
                            {group.requestedStatus}
                          </span>
                        </div>
                        
                        {/* Dates */}
                        <p className="text-slate-300 text-sm mb-2">{group.dateDisplay}</p>
                        
                        {/* Reason - Full display */}
                        {group.reason && (
                          <p className="text-slate-400 text-sm mb-2 bg-slate-800/50 rounded-lg px-3 py-2 border border-slate-700/50">
                            {group.reason}
                          </p>
                        )}
                        
                        {/* Time and Days - Prominent display */}
                        <div className="flex flex-wrap items-center gap-2">
                          {group.timeRange !== '-' && (
                            <>
                              {group.originalTimeRange !== '-' && (
                                <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-rose-900/30 rounded-lg border border-rose-700/50 text-sm text-rose-300 line-through">
                                  <span className="text-rose-500">🕐</span> {group.originalTimeRange}
                                </span>
                              )}
                              <span className="text-slate-500">→</span>
                              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-900/30 rounded-lg border border-emerald-700/50 text-sm text-emerald-300">
                                <span className="text-emerald-500">🕐</span> {group.timeRange}
                              </span>
                            </>
                          )}
                          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-800/50 rounded-lg border border-slate-700/50 text-sm text-slate-300">
                            <span className="text-slate-500">📅</span> {group.dates.length} day{group.dates.length > 1 ? 's' : ''}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </main>

      {/* Fixed Bottom Action Bar */}
      {requestGroups.length > 0 && (
        <div className="fixed bottom-0 left-0 right-0 bg-slate-900/95 backdrop-blur-xl border-t border-slate-800/50 p-4 safe-area-bottom z-50">
          <div className="max-w-6xl mx-auto flex gap-3">
            <button
              onClick={() => openModal('reject')}
              disabled={selectedGroupIds.length === 0}
              className="flex-1 inline-flex items-center justify-center px-4 py-3 bg-slate-800 border border-slate-700 text-sm font-medium rounded-xl text-rose-400 hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed transition-all touch-manipulation active:scale-[0.98]"
            >
              <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
              Reject{selectedGroupIds.length > 0 && ` (${selectedGroupIds.length})`}
            </button>
            <button
              onClick={() => openModal('approve')}
              disabled={selectedGroupIds.length === 0}
              className="flex-1 inline-flex items-center justify-center px-4 py-3 bg-emerald-600 text-sm font-medium rounded-xl text-white hover:bg-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed transition-all touch-manipulation active:scale-[0.98]"
            >
              <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              Approve{selectedGroupIds.length > 0 && ` (${selectedGroupIds.length})`}
            </button>
          </div>
        </div>
      )}

      {showSameRemarkModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4 z-50">
          <div className="bg-slate-900 border border-slate-800 rounded-t-3xl sm:rounded-2xl shadow-2xl w-full sm:max-w-md animate-slide-up">
            <div className="px-6 py-5 border-b border-slate-800">
              <h3 className="text-lg font-semibold text-white">Apply Same Remark?</h3>
            </div>
            <div className="px-6 py-6">
              <p className="text-sm text-slate-400 leading-relaxed">
                Do you want to apply the same remark to all selected requests, or provide individual remarks for each?
              </p>
            </div>
            <div className="px-6 py-4 border-t border-slate-800 flex flex-col-reverse sm:flex-row gap-3 sm:justify-end">
              <button
                onClick={() => handleSameRemarkChoice(false)}
                className="w-full sm:w-auto px-5 py-3 bg-slate-800 border border-slate-700 text-sm font-medium rounded-xl text-white hover:bg-slate-700 transition-all touch-manipulation active:scale-[0.98]"
              >
                Individual Remarks
              </button>
              <button
                onClick={() => handleSameRemarkChoice(true)}
                className="w-full sm:w-auto px-5 py-3 bg-emerald-600 text-sm font-medium rounded-xl text-white hover:bg-emerald-500 transition-all touch-manipulation active:scale-[0.98]"
              >
                Same Remark
              </button>
            </div>
          </div>
        </div>
      )}

      {showSameValueModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4 z-50">
          <div className="bg-slate-900 border border-slate-800 rounded-t-3xl sm:rounded-2xl shadow-2xl w-full sm:max-w-md animate-slide-up">
            <div className="px-6 py-5 border-b border-slate-800">
              <h3 className="text-lg font-semibold text-white">Apply Same Value?</h3>
            </div>
            <div className="px-6 py-6">
              <p className="text-sm text-slate-400 leading-relaxed">
                Do you want to apply the same attendance value to all selected requests, or provide individual values for each?
              </p>
            </div>
            <div className="px-6 py-4 border-t border-slate-800 flex flex-col-reverse sm:flex-row gap-3 sm:justify-end">
              <button
                onClick={() => handleSameValueChoice(false)}
                className="w-full sm:w-auto px-5 py-3 bg-slate-800 border border-slate-700 text-sm font-medium rounded-xl text-white hover:bg-slate-700 transition-all touch-manipulation active:scale-[0.98]"
              >
                Individual Values
              </button>
              <button
                onClick={() => handleSameValueChoice(true)}
                className="w-full sm:w-auto px-5 py-3 bg-emerald-600 text-sm font-medium rounded-xl text-white hover:bg-emerald-500 transition-all touch-manipulation active:scale-[0.98]"
              >
                Same Value
              </button>
            </div>
          </div>
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4 z-50">
          <div className="bg-slate-900 border border-slate-800 rounded-t-3xl sm:rounded-2xl shadow-2xl w-full sm:max-w-xl max-h-[85vh] sm:max-h-[90vh] overflow-hidden flex flex-col animate-slide-up">
            <div className="px-6 py-5 border-b border-slate-800 shrink-0">
              <h3 className="text-lg font-semibold text-white">
                {modalAction === 'approve' ? 'Approve' : 'Reject'} Requests
              </h3>
              <p className="text-sm text-slate-400 mt-1">
                {selectedGroupIds.length} group{selectedGroupIds.length > 1 ? 's' : ''} selected
              </p>
            </div>
            <div className="px-6 py-6 space-y-5 overflow-y-auto flex-1">
              {applySameRemark ? (
                <>
                  {/* Same Remark Section */}
                  <div className="space-y-2">
                    <label className="block text-sm font-medium text-slate-300">
                      Remark
                    </label>
                    <textarea
                      value={remarks.all || ''}
                      onChange={(e) => setRemarks({ ...remarks, all: e.target.value })}
                      rows={3}
                      className="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-xl text-white placeholder-slate-500 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition-all resize-none"
                      placeholder="Enter remark for all selected requests..."
                    />
                  </div>

                  {/* Same Value Section - Only for approve */}
                  {modalAction === 'approve' && (
                    applySameValue && !selectedGroupIds.some(id => {
                      const group = requestGroups[parseInt(id)];
                      return isFixedValueType(group.requestedStatus);
                    }) ? (
                      <div className="space-y-2">
                        <label className="block text-sm font-medium text-slate-300">
                          Attendance Value <span className="text-slate-500">(max: {getMaxValueForSelected()})</span>
                        </label>
                        <div className="relative">
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            max={getMaxValueForSelected()}
                            value={values.all ?? (getMaxValueForSelected() === 0.75 ? '0.75' : '1')}
                            onChange={(e) => {
                              const maxVal = getMaxValueForSelected();
                              const val = Math.min(parseFloat(e.target.value) || 0, maxVal);
                              setValues({ ...values, all: val.toString() });
                            }}
                            className="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-xl text-white placeholder-slate-500 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition-all pr-14"
                            placeholder={`0.00 - ${getMaxValueForSelected()}`}
                          />
                          <div className="absolute right-4 top-1/2 transform -translate-y-1/2 text-sm text-slate-400">
                            days
                          </div>
                        </div>
                        <p className="text-xs text-slate-500">Applied to all selected requests</p>
                      </div>
                    ) : !applySameValue && (
                      <div className="space-y-3">
                        <label className="block text-sm font-medium text-slate-300">
                          Individual Attendance Values
                        </label>
                        {selectedGroupIds.map(groupId => {
                          const group = requestGroups[parseInt(groupId)];
                          // Skip fixed value types (leave/half-day)
                          if (isFixedValueType(group.requestedStatus)) {
                            return (
                              <div key={groupId} className="p-4 bg-slate-800/50 border border-slate-700 rounded-xl space-y-3">
                                {/* Header with name and type badge */}
                                <div className="flex items-center justify-between gap-2">
                                  <div className="flex items-center gap-3 min-w-0">
                                    <div className="w-8 h-8 bg-emerald-500/20 rounded-full flex items-center justify-center shrink-0">
                                      <span className="text-xs font-semibold text-emerald-400">
                                        {group.userName.charAt(0).toUpperCase()}
                                      </span>
                                    </div>
                                    <p className="text-sm font-medium text-white truncate">{group.userName}</p>
                                  </div>
                                  <span className={`shrink-0 px-2.5 py-1 rounded-full text-xs font-medium ${
                                    group.requestedStatus.toLowerCase().includes('leave') || group.requestedStatus === 'On leave'
                                      ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                                      : 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                                  }`}>
                                    {group.requestedStatus}
                                  </span>
                                </div>

                                {/* Date and time info */}
                                <div className="flex flex-wrap items-center gap-2 text-sm">
                                  <span className="text-slate-300">{group.dateDisplay}</span>
                                  {group.timeRange !== '-' && (
                                    <>
                                      {group.originalTimeRange !== '-' && (
                                        <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-rose-900/30 rounded text-xs text-rose-400 line-through">
                                          🕐 {group.originalTimeRange}
                                        </span>
                                      )}
                                      <span className="text-slate-500">→</span>
                                      <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-emerald-900/30 rounded text-xs text-emerald-400">
                                        🕐 {group.timeRange}
                                      </span>
                                    </>
                                  )}
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-slate-700/50 rounded text-xs text-slate-400">
                                    📅 {group.dates.length} day{group.dates.length > 1 ? 's' : ''}
                                  </span>
                                </div>

                                {/* Fixed value display */}
                                <div className="flex items-center gap-2 p-3 bg-slate-700/30 rounded-lg border border-slate-600/50">
                                  <span className="text-xs text-slate-400">Attendance Value:</span>
                                  <span className="text-sm font-medium text-white">
                                    {group.requestedStatus.toLowerCase().includes('half') ? '0.5 days' : 'Auto'}
                                  </span>
                                  <span className="text-xs text-slate-500">
                                    ({group.requestedStatus.toLowerCase().includes('half') 
                                      ? 'fixed for half-day' 
                                      : 'determined automatically'})
                                  </span>
                                </div>
                              </div>
                            );
                          }
                          return (
                            <div key={groupId} className="p-4 bg-slate-800/50 border border-slate-700 rounded-xl space-y-3">
                              {/* Header with name and type badge */}
                              <div className="flex items-center justify-between gap-2">
                                <div className="flex items-center gap-3 min-w-0">
                                  <div className="w-8 h-8 bg-emerald-500/20 rounded-full flex items-center justify-center shrink-0">
                                    <span className="text-xs font-semibold text-emerald-400">
                                      {group.userName.charAt(0).toUpperCase()}
                                    </span>
                                  </div>
                                  <p className="text-sm font-medium text-white truncate">{group.userName}</p>
                                </div>
                                <span className={`shrink-0 px-2.5 py-1 rounded-full text-xs font-medium ${
                                  group.requestedStatus.toLowerCase().includes('leave') || group.requestedStatus === 'On leave'
                                    ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                                    : 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                                }`}>
                                  {group.requestedStatus}
                                </span>
                              </div>

                              {/* Date and time info */}
                              <div className="flex flex-wrap items-center gap-2 text-sm">
                                <span className="text-slate-300">{group.dateDisplay}</span>
                                {group.timeRange !== '-' && (
                                  <>
                                    {group.originalTimeRange !== '-' && (
                                      <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-rose-900/30 rounded text-xs text-rose-400 line-through">
                                        🕐 {group.originalTimeRange}
                                      </span>
                                    )}
                                    <span className="text-slate-500">→</span>
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-emerald-900/30 rounded text-xs text-emerald-400">
                                      🕐 {group.timeRange}
                                    </span>
                                  </>
                                )}
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-slate-700/50 rounded text-xs text-slate-400">
                                  📅 {group.dates.length} day{group.dates.length > 1 ? 's' : ''}
                                </span>
                              </div>

                              {/* Value input */}
                              <div>
                                <label className="block text-xs font-medium text-slate-400 mb-1.5">
                                  Attendance Value <span className="text-slate-500">(max: {getMaxValueForType(group.requestedStatus)})</span>
                                </label>
                                <div className="relative">
                                  <input
                                    type="number"
                                    step="0.01"
                                    min="0"
                                    max={getMaxValueForType(group.requestedStatus)}
                                    value={values[groupId] ?? getDefaultValueForType(group.requestedStatus)}
                                    onChange={(e) => {
                                      const maxVal = getMaxValueForType(group.requestedStatus);
                                      const val = Math.min(parseFloat(e.target.value) || 0, maxVal);
                                      setValues({ ...values, [groupId]: val.toString() });
                                    }}
                                    className="w-full px-4 py-2.5 bg-slate-800 border border-slate-600 rounded-lg text-white focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition-all pr-14"
                                    placeholder={`0.00 - ${getMaxValueForType(group.requestedStatus)}`}
                                  />
                                  <div className="absolute right-4 top-1/2 transform -translate-y-1/2 text-sm text-slate-400">
                                    max {getMaxValueForType(group.requestedStatus)}
                                  </div>
                                </div>
                              </div>
                            </div>
                          );
                        })}

                        {/* Info for leave requests */}
                        {selectedGroupIds.some(id => {
                          const group = requestGroups[parseInt(id)];
                          return group.requestedStatus.toLowerCase().includes('leave') || group.requestedStatus === 'On leave';
                        }) && (
                          <div className="p-4 bg-blue-500/10 border border-blue-500/30 rounded-xl">
                            <p className="text-blue-400 text-sm">
                              For leave requests, the system will automatically determine if it's paid or unpaid based on earned leave balance.
                            </p>
                          </div>
                        )}

                        {/* Info for half-day requests */}
                        {selectedGroupIds.some(id => {
                          const group = requestGroups[parseInt(id)];
                          return group.requestedStatus.toLowerCase().includes('half');
                        }) && (
                          <div className="p-4 bg-amber-500/10 border border-amber-500/30 rounded-xl">
                            <p className="text-amber-400 text-sm">
                              Half-day requests are automatically set to 0.5 attendance value.
                            </p>
                          </div>
                        )}
                      </div>
                    )
                  )}
                </>
              ) : (
                <div className="space-y-4">
                  <label className="block text-sm font-medium text-slate-300">
                    Individual Settings
                  </label>
                  {selectedGroupIds.map(groupId => {
                    const group = requestGroups[parseInt(groupId)];
                    return (
                      <div key={groupId} className="p-4 bg-slate-800/50 border border-slate-700 rounded-xl space-y-4">
                        {/* Header with name and type badge */}
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="w-8 h-8 bg-emerald-500/20 rounded-full flex items-center justify-center shrink-0">
                              <span className="text-xs font-semibold text-emerald-400">
                                {group.userName.charAt(0).toUpperCase()}
                              </span>
                            </div>
                            <p className="text-sm font-medium text-white truncate">{group.userName}</p>
                          </div>
                          <span className={`shrink-0 px-2.5 py-1 rounded-full text-xs font-medium ${
                            group.requestedStatus.toLowerCase().includes('leave') || group.requestedStatus === 'On leave'
                              ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                              : 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                          }`}>
                            {group.requestedStatus}
                          </span>
                        </div>

                        {/* Date and time info */}
                        <div className="flex flex-wrap items-center gap-2 text-sm">
                          <span className="text-slate-300">{group.dateDisplay}</span>
                          {group.timeRange !== '-' && (
                            <>
                              {group.originalTimeRange !== '-' && (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-rose-900/30 rounded text-xs text-rose-400 line-through">
                                  🕐 {group.originalTimeRange}
                                </span>
                              )}
                              <span className="text-slate-500">→</span>
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-emerald-900/30 rounded text-xs text-emerald-400">
                                🕐 {group.timeRange}
                              </span>
                            </>
                          )}
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-slate-700/50 rounded text-xs text-slate-400">
                            📅 {group.dates.length} day{group.dates.length > 1 ? 's' : ''}
                          </span>
                        </div>

                        {modalAction === 'approve' && (
                          group.requestedStatus.toLowerCase().includes('half') ? (
                            <div className="flex items-center gap-2 p-3 bg-slate-700/30 rounded-lg border border-slate-600/50">
                              <span className="text-xs text-slate-400">Attendance Value:</span>
                              <span className="text-sm font-medium text-white">0.5 days</span>
                              <span className="text-xs text-slate-500">(fixed for half-day)</span>
                            </div>
                          ) : !isFixedValueType(group.requestedStatus) && (
                            <div>
                              <label className="block text-xs font-medium text-slate-400 mb-1.5">
                                Attendance Value <span className="text-slate-500">(max: {getMaxValueForType(group.requestedStatus)})</span>
                              </label>
                              <div className="relative">
                                <input
                                  type="number"
                                  step="0.01"
                                  min="0"
                                  max={getMaxValueForType(group.requestedStatus)}
                                  value={values[groupId] ?? getDefaultValueForType(group.requestedStatus)}
                                  onChange={(e) => {
                                    const maxVal = getMaxValueForType(group.requestedStatus);
                                    const val = Math.min(parseFloat(e.target.value) || 0, maxVal);
                                    setValues({ ...values, [groupId]: val.toString() });
                                  }}
                                  className="w-full px-4 py-2.5 bg-slate-800 border border-slate-600 rounded-lg text-white focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition-all pr-14"
                                  placeholder={`0.00 - ${getMaxValueForType(group.requestedStatus)}`}
                                />
                                <div className="absolute right-4 top-1/2 transform -translate-y-1/2 text-sm text-slate-400">
                                  max {getMaxValueForType(group.requestedStatus)}
                                </div>
                              </div>
                            </div>
                          )
                        )}

                        <div>
                          <label className="block text-xs font-medium text-slate-400 mb-1.5">
                            Remark
                          </label>
                          <textarea
                            value={remarks[groupId] || ''}
                            onChange={(e) => setRemarks({ ...remarks, [groupId]: e.target.value })}
                            rows={2}
                            className="w-full px-4 py-2.5 bg-slate-800 border border-slate-600 rounded-lg text-white placeholder-slate-500 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition-all resize-none"
                            placeholder="Enter remark..."
                          />
                        </div>
                      </div>
                    );
                  })}

                  {/* Info for leave requests */}
                  {modalAction === 'approve' && selectedGroupIds.some(id => {
                    const group = requestGroups[parseInt(id)];
                    return group.requestedStatus.toLowerCase().includes('leave') || group.requestedStatus === 'On leave';
                  }) && (
                    <div className="p-4 bg-blue-500/10 border border-blue-500/30 rounded-xl">
                      <p className="text-blue-400 text-sm">
                        For leave requests, the system will automatically determine if it's paid or unpaid based on earned leave balance.
                      </p>
                    </div>
                  )}

                  {/* Info for half-day requests */}
                  {modalAction === 'approve' && selectedGroupIds.some(id => {
                    const group = requestGroups[parseInt(id)];
                    return group.requestedStatus.toLowerCase().includes('half');
                  }) && (
                    <div className="p-4 bg-amber-500/10 border border-amber-500/30 rounded-xl">
                      <p className="text-amber-400 text-sm">
                        Half-day requests are automatically set to 0.5 attendance value.
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>
            <div className="px-6 py-4 border-t border-slate-800 flex flex-col-reverse sm:flex-row gap-3 sm:justify-end shrink-0 bg-slate-900">
              <button
                onClick={() => setShowModal(false)}
                className="w-full sm:w-auto px-5 py-3 bg-slate-800 border border-slate-700 text-sm font-medium rounded-xl text-white hover:bg-slate-700 transition-all touch-manipulation active:scale-[0.98]"
              >
                Cancel
              </button>
              <button
                onClick={handleSubmit}
                disabled={processing}
                className={`w-full sm:w-auto px-6 py-3 text-sm font-medium rounded-xl text-white transition-all touch-manipulation active:scale-[0.98] inline-flex items-center justify-center ${
                  modalAction === 'approve'
                    ? 'bg-emerald-600 hover:bg-emerald-500 disabled:bg-emerald-600/50'
                    : 'bg-rose-600 hover:bg-rose-500 disabled:bg-rose-600/50'
                } disabled:cursor-not-allowed`}
              >
                {processing ? (
                  <>
                    <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Processing...
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={modalAction === 'approve' ? "M5 13l4 4L19 7" : "M6 18L18 6M6 6l12 12"} />
                    </svg>
                    {modalAction === 'approve' ? 'Approve' : 'Reject'} Requests
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