'use client';

import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';

interface Request {
  _id: string;
  userName: string;
  date: string;
  requestedStatus: string;
  reason: string;
  startTime?: string;
  endTime?: string;
}

interface RequestGroup {
  userName: string;
  requestedStatus: string;
  dates: string[];
  dateDisplay: string;
  reason: string;
  timeRange: string;
  requestIds: string[];
}

export default function ReviewAllPage() {
  const searchParams = useSearchParams();
  const partnerName = searchParams.get('partnerName');
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
      const key = `${req.userName}-${req.requestedStatus}`;
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
      const requestIds = requests.map(r => r._id);
      return { userName, requestedStatus, dates, dateDisplay, reason, timeRange, requestIds };
    });
  };

  const getDateDisplay = (dates: string[]): string => {
    if (dates.length === 1) return dates[0];
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
          ranges.push(start);
        } else {
          ranges.push(`${start} to ${prev}`);
        }
        start = current;
      }
      prev = current;
    }
    if (start === prev) {
      ranges.push(start);
    } else {
      ranges.push(`${start} to ${prev}`);
    }
    return ranges.join(', ');
  };

  const handleSelectGroup = (groupId: string, checked: boolean) => {
    if (checked) {
      setSelectedGroupIds(prev => [...prev, groupId]);
    } else {
      setSelectedGroupIds(prev => prev.filter(id => id !== groupId));
    }
  };

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedGroupIds(requestGroups.map((_, index) => index.toString()));
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
        if (modalAction === 'approve') setValues({ all: '1' });
      } else {
        const initialRemarks: { [key: string]: string } = {};
        const initialValues: { [key: string]: string } = {};
        selectedGroupIds.forEach(id => {
          initialRemarks[id] = '';
          if (modalAction === 'approve') initialValues[id] = '1';
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
      setValues({ all: '1' });
    } else {
      const initialValues: { [key: string]: string } = {};
      selectedGroupIds.forEach(id => {
        initialValues[id] = '1';
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
                value
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
              ...(value !== undefined && { value })
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
              ...(value !== undefined && { value })
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
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading requests...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="bg-white p-8 rounded-lg shadow-md text-center max-w-md">
          <div className="text-red-600 mb-4">⚠️</div>
          <h2 className="text-xl font-semibold text-gray-900 mb-2">Error</h2>
          <p className="text-gray-600">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-6xl mx-auto">
        <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
          <h1 className="text-2xl font-semibold text-gray-900 mb-2">Review All Pending Requests</h1>
          <p className="text-gray-600 text-sm leading-relaxed">Select the requests you want to approve or reject from your employees.</p>
        </div>

        {requestGroups.length === 0 ? (
          <div className="bg-white rounded-lg shadow-sm p-8 text-center">
            <p className="text-gray-500">No pending requests found.</p>
          </div>
        ) : (
          <>
            <div className="bg-white rounded-lg shadow-sm overflow-hidden border border-gray-100">
              <div className="px-6 py-4 border-b border-gray-200 bg-gray-50/50">
                <label className="flex items-center space-x-3 cursor-pointer group">
                  <input
                    type="checkbox"
                    checked={selectedGroupIds.length === requestGroups.length}
                    onChange={(e) => handleSelectAll(e.target.checked)}
                    className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500 focus:ring-2"
                  />
                  <span className="text-sm font-medium text-gray-700 group-hover:text-gray-900 transition-colors">Select All Groups</span>
                </label>
              </div>

              <div className="divide-y divide-gray-100">
                {requestGroups.map((group, index) => (
                  <div key={index} className="px-6 py-5 hover:bg-gray-50/50 transition-colors">
                    <div className="flex items-start space-x-4">
                      <input
                        type="checkbox"
                        checked={selectedGroupIds.includes(index.toString())}
                        onChange={(e) => handleSelectGroup(index.toString(), e.target.checked)}
                        className="mt-1 w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500 focus:ring-2"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center space-x-3">
                            <h3 className="text-base font-semibold text-gray-900">{group.userName}</h3>
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-700 border border-blue-200">
                              {group.requestedStatus}
                            </span>
                          </div>
                        </div>
                        <div className="space-y-1">
                          <p className="text-sm text-gray-600">
                            <span className="font-medium">Dates:</span> {group.dateDisplay}
                          </p>
                          {group.reason && (
                            <p className="text-sm text-gray-600">
                              <span className="font-medium">Reason:</span> {group.reason}
                            </p>
                          )}
                          <p className="text-sm text-gray-600">
                            <span className="font-medium">Time:</span> {group.timeRange}
                          </p>
                          <p className="text-sm text-gray-500">
                            {group.dates.length} request{group.dates.length > 1 ? 's' : ''} • {group.requestIds.length} attendance record{group.requestIds.length > 1 ? 's' : ''}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-8 flex justify-end space-x-4">
              <button
                onClick={() => openModal('reject')}
                disabled={selectedGroupIds.length === 0}
                className="inline-flex items-center px-6 py-3 border border-red-300 text-sm font-medium rounded-lg text-red-700 bg-white hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-white transition-all duration-200 shadow-sm"
              >
                <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
                Reject Selected ({selectedGroupIds.length})
              </button>
              <button
                onClick={() => openModal('approve')}
                disabled={selectedGroupIds.length === 0}
                className="inline-flex items-center px-6 py-3 border border-transparent text-sm font-medium rounded-lg text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-blue-600 transition-all duration-200 shadow-sm"
              >
                <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                Approve Selected ({selectedGroupIds.length})
              </button>
            </div>
          </>
        )}
      </div>

      {showSameRemarkModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full mx-4">
            <div className="px-6 py-4 border-b border-gray-200 bg-gray-50/50 rounded-t-xl">
              <h3 className="text-lg font-semibold text-gray-900">Apply Same Remark?</h3>
            </div>
            <div className="px-6 py-6">
              <p className="text-sm text-gray-600 leading-relaxed">
                Do you want to apply the same remark to all selected requests, or provide individual remarks for each request?
              </p>
            </div>
            <div className="px-6 py-4 border-t border-gray-200 flex justify-end space-x-3 bg-gray-50/50 rounded-b-xl">
              <button
                onClick={() => handleSameRemarkChoice(false)}
                className="inline-flex items-center px-4 py-2.5 border border-gray-300 text-sm font-medium rounded-lg text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500 transition-all duration-200 shadow-sm"
              >
                Individual Remarks
              </button>
              <button
                onClick={() => handleSameRemarkChoice(true)}
                className="inline-flex items-center px-4 py-2.5 border border-transparent text-sm font-medium rounded-lg text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-all duration-200 shadow-sm"
              >
                Same Remark
              </button>
            </div>
          </div>
        </div>
      )}

      {showSameValueModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full mx-4">
            <div className="px-6 py-4 border-b border-gray-200 bg-gray-50/50 rounded-t-xl">
              <h3 className="text-lg font-semibold text-gray-900">Apply Same Value?</h3>
            </div>
            <div className="px-6 py-6">
              <p className="text-sm text-gray-600 leading-relaxed">
                Do you want to apply the same attendance value to all selected requests, or provide individual values for each request?
              </p>
            </div>
            <div className="px-6 py-4 border-t border-gray-200 flex justify-end space-x-3 bg-gray-50/50 rounded-b-xl">
              <button
                onClick={() => handleSameValueChoice(false)}
                className="inline-flex items-center px-4 py-2.5 border border-gray-300 text-sm font-medium rounded-lg text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500 transition-all duration-200 shadow-sm"
              >
                Individual Values
              </button>
              <button
                onClick={() => handleSameValueChoice(true)}
                className="inline-flex items-center px-4 py-2.5 border border-transparent text-sm font-medium rounded-lg text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 transition-all duration-200 shadow-sm"
              >
                Same Value
              </button>
            </div>
          </div>
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
            <div className="px-6 py-4 border-b border-gray-200 bg-gray-50/50 rounded-t-xl">
              <h3 className="text-lg font-semibold text-gray-900">
                {modalAction === 'approve' ? 'Approve' : 'Reject'} Selected Requests
              </h3>
              <p className="text-sm text-gray-600 mt-1">
                {selectedGroupIds.length} group{selectedGroupIds.length > 1 ? 's' : ''} selected
              </p>
            </div>
            <div className="px-6 py-6 space-y-6">
              {applySameRemark ? (
                <>
                  {/* Same Remark Section */}
                  <div className="space-y-3">
                    <label className="block text-sm font-medium text-gray-700">
                      Remark <span className="text-red-500">*</span>
                    </label>
                    <textarea
                      value={remarks.all || ''}
                      onChange={(e) => setRemarks({ ...remarks, all: e.target.value })}
                      rows={4}
                      className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all duration-200 resize-none"
                      placeholder="Enter remark for all selected requests..."
                    />
                  </div>

                  {/* Same Value Section - Only for approve */}
                  {modalAction === 'approve' && (
                    applySameValue ? (
                      <div className="space-y-3">
                        <label className="block text-sm font-medium text-gray-700">
                          Attendance Value <span className="text-red-500">*</span>
                        </label>
                        <div className="relative">
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            max="1"
                            value={values.all || '1'}
                            onChange={(e) => setValues({ ...values, all: e.target.value })}
                            className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 transition-all duration-200 pr-12"
                            placeholder="0.00 - 1.00"
                          />
                          <div className="absolute right-3 top-1/2 transform -translate-y-1/2 text-sm text-gray-500">
                            days
                          </div>
                        </div>
                        <p className="text-xs text-gray-500">Applied to all selected requests</p>
                      </div>
                    ) : (
                      <div className="space-y-4">
                        <label className="block text-sm font-medium text-gray-700">
                          Attendance Values <span className="text-red-500">*</span>
                        </label>
                        {selectedGroupIds.map(groupId => {
                          const group = requestGroups[parseInt(groupId)];
                          return (
                            <div key={groupId} className="p-4 border border-gray-200 rounded-lg bg-gray-50/50">
                              <div className="flex items-center space-x-3 mb-3">
                                <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
                                  <span className="text-xs font-medium text-blue-700">
                                    {group.userName.charAt(0).toUpperCase()}
                                  </span>
                                </div>
                                <div>
                                  <p className="text-sm font-medium text-gray-900">{group.userName}</p>
                                  <p className="text-xs text-gray-500">{group.dateDisplay}</p>
                                </div>
                              </div>
                              <div className="relative">
                                <input
                                  type="number"
                                  step="0.01"
                                  min="0"
                                  max="1"
                                  value={values[groupId] || '1'}
                                  onChange={(e) => setValues({ ...values, [groupId]: e.target.value })}
                                  className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 transition-all duration-200 pr-12"
                                  placeholder="0.00 - 1.00"
                                />
                                <div className="absolute right-3 top-1/2 transform -translate-y-1/2 text-sm text-gray-500">
                                  days
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )
                  )}
                </>
              ) : (
                <div className="space-y-4">
                  <label className="block text-sm font-medium text-gray-700">
                    Individual Settings <span className="text-red-500">*</span>
                  </label>
                  {selectedGroupIds.map(groupId => {
                    const group = requestGroups[parseInt(groupId)];
                    return (
                      <div key={groupId} className="p-4 border border-gray-200 rounded-lg bg-gray-50/50">
                        <div className="flex items-center space-x-3 mb-4">
                          <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
                            <span className="text-xs font-medium text-blue-700">
                              {group.userName.charAt(0).toUpperCase()}
                            </span>
                          </div>
                          <div>
                            <p className="text-sm font-medium text-gray-900">{group.userName}</p>
                            <p className="text-xs text-gray-500">{group.dateDisplay}</p>
                          </div>
                        </div>

                        {modalAction === 'approve' && (
                          <div className="mb-4">
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                              Attendance Value
                            </label>
                            <div className="relative">
                              <input
                                type="number"
                                step="0.01"
                                min="0"
                                max="1"
                                value={values[groupId] || '1'}
                                onChange={(e) => setValues({ ...values, [groupId]: e.target.value })}
                                className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 transition-all duration-200 pr-12"
                                placeholder="0.00 - 1.00"
                              />
                              <div className="absolute right-3 top-1/2 transform -translate-y-1/2 text-sm text-gray-500">
                                days
                              </div>
                            </div>
                          </div>
                        )}

                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">
                            Remark
                          </label>
                          <textarea
                            value={remarks[groupId] || ''}
                            onChange={(e) => setRemarks({ ...remarks, [groupId]: e.target.value })}
                            rows={3}
                            className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all duration-200 resize-none"
                            placeholder="Enter remark for this request..."
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
            <div className="px-6 py-4 border-t border-gray-200 bg-gray-50/50 rounded-b-xl flex justify-end space-x-3">
              <button
                onClick={() => setShowModal(false)}
                className="inline-flex items-center px-6 py-2.5 border border-gray-300 text-sm font-medium rounded-lg text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500 transition-all duration-200 shadow-sm"
              >
                Cancel
              </button>
              <button
                onClick={handleSubmit}
                disabled={processing}
                className={`inline-flex items-center px-6 py-2.5 border border-transparent text-sm font-medium rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-offset-2 transition-all duration-200 shadow-sm ${
                  modalAction === 'approve'
                    ? 'bg-green-600 hover:bg-green-700 focus:ring-green-500 disabled:bg-green-400'
                    : 'bg-red-600 hover:bg-red-700 focus:ring-red-500 disabled:bg-red-400'
                } disabled:opacity-50 disabled:cursor-not-allowed`}
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