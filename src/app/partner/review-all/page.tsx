'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, Download } from 'lucide-react';

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
  const [exporting, setExporting] = useState(false);
  const [viewMode, setViewMode] = useState<'cards' | 'table'>('cards');

  const APPROVE_CHIPS = ['Done', 'Missed Entry', 'Client Visit', 'Emergency', 'Approved'];
  const REJECT_CHIPS = ['Insufficient Hours', 'Incorrect Date', 'Incorrect Entry', 'Not Discussed', 'Proof Required'];

  // Align caps with HR dashboard (AttendanceRequestsSection): WFH 0.75, OS/outstation/client/onsite 1.2, else 1; half 0.5; leave none.
  const getMaxValueForType = (requestedStatus: string): number | null => {
    const status = requestedStatus.toLowerCase();
    if (status.includes('half')) return 0.5;
    if (status.includes('leave') || requestedStatus === 'On leave') return null;
    if (status.includes('wfh')) return 0.75;
    if (
      status.includes('outstation') ||
      status.includes('client place') ||
      status.includes('clientplace') ||
      status.includes('onsite') ||
      status.includes('os-p')
    ) {
      return 1.2;
    }
    return 1;
  };

  const getDefaultValueForType = (requestedStatus: string): string => {
    const status = requestedStatus.toLowerCase();
    if (status.includes('half')) return '0.5';
    if (status.includes('leave') || requestedStatus === 'On leave') return '';
    if (status.includes('wfh')) return '0.75';
    if (
      status.includes('outstation') ||
      status.includes('client place') ||
      status.includes('clientplace') ||
      status.includes('onsite') ||
      status.includes('os-p')
    ) {
      return '1.2';
    }
    return '1';
  };

  const resolveApproveValueForGroup = (group: RequestGroup, raw: string | undefined): number | undefined => {
    if (isLeaveRequestType(group.requestedStatus)) return undefined;
    const trimmed = String(raw ?? '').trim().replace(',', '.');
    const defStr = getDefaultValueForType(group.requestedStatus);
    let n = trimmed === '' ? NaN : parseFloat(trimmed);
    if (!Number.isFinite(n)) n = defStr === '' ? NaN : parseFloat(defStr);
    if (!Number.isFinite(n)) return undefined;
    const max = getMaxValueForType(group.requestedStatus);
    if (max != null) n = Math.min(Math.max(0, n), max);
    return n;
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
          const initialValues: { [key: string]: string } = {};
          groups.forEach((g, index) => {
            initialRemarks[index.toString()] = 'Done';
            initialValues[index.toString()] = getDefaultValueForType(g.requestedStatus);
          });
          setRemarks(initialRemarks);
          setValues(initialValues);
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

  const getGroupIdx = (group: RequestGroup) => requestGroups.indexOf(group).toString();

  const exportReviewAllToExcel = async () => {
    if (exporting) return;
    setExporting(true);
    try {
      const filtered = getFilteredRequestGroups();
      if (filtered.length === 0) {
        alert('No rows to export for the selected filters.');
        return;
      }

      const ExcelJS = (await import('exceljs')).default;
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet('Partner Review');

      const columns = [
        { header: 'Request ID(s)', key: 'requestIds', width: 52 },
        { header: 'Employee Name', key: 'userName', width: 24 },
        { header: 'Requested Status', key: 'requestedStatus', width: 22 },
        { header: 'Date(s)', key: 'dateDisplay', width: 26 },
        { header: 'Dates (ISO)', key: 'datesIso', width: 40 },
        { header: 'Reason', key: 'reason', width: 40 },
        { header: 'Requested Time', key: 'timeRange', width: 18 },
        { header: 'Original Time', key: 'originalTimeRange', width: 18 },
        { header: 'Decision (Approve/Reject)', key: 'remarkDecision', width: 24 },
        { header: 'Remark (Text)', key: 'remarkText', width: 36 },
        { header: 'Value', key: 'approvalValue', width: 12 },
      ] as const;

      worksheet.columns = columns as any;

      const titleText = `Partner Review Export - Generated on ${new Date().toLocaleDateString('en-GB')} ${new Date().toLocaleTimeString()}`;
      worksheet.spliceRows(1, 0, [titleText]);
      worksheet.mergeCells(1, 1, 1, columns.length);
      worksheet.getRow(1).font = { bold: true, size: 14, color: { argb: 'FFFFFFFF' } };
      worksheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF064E3B' } }; // Emerald-900
      worksheet.getRow(1).alignment = { vertical: 'middle', horizontal: 'center' };
      worksheet.getRow(1).height = 34;

      const headerRow = worksheet.getRow(2);
      headerRow.height = 28;
      headerRow.eachCell((cell: any) => {
        cell.font = { bold: true, size: 11, color: { argb: 'FFFFFFFF' } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF10B981' } }; // Emerald-500
        cell.alignment = { vertical: 'middle', horizontal: 'center' };
        cell.border = {
          top: { style: 'thin', color: { argb: 'FF000000' } },
          bottom: { style: 'thin', color: { argb: 'FF000000' } },
          left: { style: 'thin', color: { argb: 'FF000000' } },
          right: { style: 'thin', color: { argb: 'FF000000' } },
        };
        cell.protection = { locked: true };
      });

      filtered.forEach((g) => {
        const defStr = getDefaultValueForType(g.requestedStatus);
        let approvalNum: number | undefined = undefined;
        if (!isLeaveRequestType(g.requestedStatus) && defStr !== '') {
          const n = parseFloat(defStr);
          if (Number.isFinite(n)) approvalNum = n;
        }
        const row = worksheet.addRow({
          requestIds: (g.requestIds || []).join(', '),
          userName: g.userName,
          requestedStatus: g.requestedStatus,
          dateDisplay: g.dateDisplay,
          datesIso: (g.dates || []).join(', '),
          reason: g.reason || '',
          timeRange: g.timeRange || '-',
          originalTimeRange: g.originalTimeRange || '-',
          remarkDecision: '',
          remarkText: '',
          approvalValue: approvalNum ?? '',
        });
        const vc = row.getCell('approvalValue');
        if (approvalNum !== undefined && Number.isFinite(approvalNum)) {
          vc.value = approvalNum;
          vc.numFmt = '0.00';
        } else {
          vc.value = null;
        }
      });

      const decisionColNumber = columns.findIndex((c) => c.key === 'remarkDecision') + 1;
      const remarkTextColNumber = columns.findIndex((c) => c.key === 'remarkText') + 1;
      const valueColNumber = columns.findIndex((c) => c.key === 'approvalValue') + 1;
      const reasonColNumber = columns.findIndex((c) => c.key === 'reason') + 1;
      worksheet.eachRow((row: any, rowNumber: number) => {
        if (rowNumber <= 2) return;
        row.height = 48;
        row.eachCell((cell: any, colNumber: number) => {
          cell.font = { size: 10 };
          cell.alignment = {
            vertical: 'middle',
            horizontal: colNumber === reasonColNumber ? 'left' : 'center',
            wrapText: true,
          };
          cell.border = {
            top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
            bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
            left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
            right: { style: 'thin', color: { argb: 'FFE2E8F0' } },
          };
          const unlocked =
            colNumber === decisionColNumber ||
            colNumber === remarkTextColNumber ||
            colNumber === valueColNumber;
          cell.protection = { locked: !unlocked };
        });

        const decisionCell = row.getCell(decisionColNumber);
        decisionCell.dataValidation = {
          type: 'list',
          allowBlank: true,
          formulae: ['"Approve,Reject"'],
          showErrorMessage: true,
          errorStyle: 'error',
          errorTitle: 'Invalid value',
          error: 'Please select either Approve or Reject.',
        };
        decisionCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEF3C7' } };
        decisionCell.font = { bold: true, color: { argb: 'FF92400E' } };

        const remarkTextCell = row.getCell(remarkTextColNumber);
        remarkTextCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEFCE8' } };
        remarkTextCell.font = { color: { argb: 'FF1F2937' } };

        const valueCell = row.getCell(valueColNumber);
        valueCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE0F2FE' } };
        valueCell.font = { color: { argb: 'FF0C4A6E' } };
        valueCell.numFmt = '0.00';
      });

      // Enable sheet protection (keeps locked cells non-editable).
      await worksheet.protect('', {
        selectLockedCells: true,
        selectUnlockedCells: true,
        formatCells: false,
        formatColumns: false,
        formatRows: false,
        insertRows: false,
        insertColumns: false,
        deleteRows: false,
        deleteColumns: false,
        sort: false,
        autoFilter: false,
        pivotTables: false,
      });

      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `Partner_Review_Export_${new Date().toISOString().split('T')[0]}.xlsx`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (e) {
      console.error(e);
      alert('Failed to export Excel.');
    } finally {
      setExporting(false);
    }
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
        const valueRaw = values[id] ?? getDefaultValueForType(group.requestedStatus);
        const value =
          action === 'approve' ? resolveApproveValueForGroup(group, valueRaw) : undefined;

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
    <div className="min-h-screen flex items-center justify-center bg-background text-foreground">
      <div className="text-center">
        <div className="animate-spin rounded-full h-10 w-10 border-2 border-border border-t-emerald-600 mx-auto" />
        <p className="mt-4 text-muted-foreground text-sm">Loading requests...</p>
      </div>
    </div>
  );

  if (error) return (
    <div className="min-h-screen flex items-center justify-center bg-background text-foreground p-4">
      <div className="bg-surface border border-border p-6 rounded-2xl text-center max-w-sm w-full shadow-[inset_0_0_0_1px_rgba(147,197,253,0.25)]">
        <h2 className="text-lg font-semibold text-foreground mb-2">Something went wrong</h2>
        <p className="text-muted-foreground text-sm">{error}</p>
        <button onClick={() => window.location.reload()} className="mt-4 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 rounded-lg text-white text-sm transition-colors">
          Retry
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-background text-foreground selection:bg-emerald-500/25">
      <header className="sticky top-0 z-50 border-b border-border bg-background/90 backdrop-blur-md">
        <div className="w-full max-w-none mx-auto px-4 sm:px-6 xl:px-10 h-16 flex items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <button 
              onClick={() => router.push('/employee/dashboard')} 
              className="p-2 -ml-2 rounded-lg border border-transparent text-muted-foreground hover:text-foreground hover:bg-surface transition-colors"
            >
              <ArrowLeft className="h-6 w-6" />
            </button>
            <div>
              <h1 className="text-lg font-bold text-foreground tracking-tight leading-none">Review Requests</h1>
              <p className="text-[11px] font-bold text-emerald-700 uppercase tracking-widest mt-1">Partner Review Portal</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="hidden sm:inline-flex rounded-lg border border-border bg-surface p-1 shadow-[inset_0_0_0_1px_rgba(147,197,253,0.18)]">
              <button
                type="button"
                onClick={() => setViewMode('table')}
                className={`px-3 py-2 rounded-md text-[11px] font-black uppercase tracking-widest transition-all ${
                  viewMode === 'table' ? 'bg-emerald-600 text-white shadow-sm' : 'text-muted-foreground hover:bg-background hover:text-foreground'
                }`}
                title="Table view"
              >
                Table
              </button>
              <button
                type="button"
                onClick={() => setViewMode('cards')}
                className={`px-3 py-2 rounded-md text-[11px] font-black uppercase tracking-widest transition-all ${
                  viewMode === 'cards' ? 'bg-emerald-600 text-white shadow-sm' : 'text-muted-foreground hover:bg-background hover:text-foreground'
                }`}
                title="Card view"
              >
                Cards
              </button>
            </div>
            <button
              onClick={exportReviewAllToExcel}
              disabled={exporting || loading || !!error || requestGroups.length === 0}
              className="h-10 px-3 rounded-lg border border-border bg-surface hover:bg-surface/80 text-xs font-bold text-foreground disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
              title="Export current filtered rows to Excel"
              type="button"
            >
              {exporting ? (
                <div className="h-4 w-4 border-2 border-border border-t-emerald-600 rounded-full animate-spin" />
              ) : (
                <Download className="h-4 w-4 text-muted-foreground" />
              )}
              Export Excel
            </button>
          </div>
        </div>
      </header>

      <main className="w-full max-w-none mx-auto px-2 sm:px-4 xl:px-10 py-4 pb-40">
        {requestGroups.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-muted-foreground">
            <p className="text-base font-medium text-foreground">All pending requests cleared!</p>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4 px-1 max-w-2xl lg:max-w-none">
              <select 
                value={leaveTypeFilter} 
                onChange={(e) => setLeaveTypeFilter(e.target.value)} 
                className="w-full h-10 px-3 bg-background border border-border rounded-lg text-xs text-foreground focus:border-emerald-500 outline-none"
              >
                <option value="all">All Types</option>
                {getUniqueLeaveTypes().map(t => <option key={t} value={t}>{t}</option>)}
              </select>
              <select 
                value={personFilter} 
                onChange={(e) => setPersonFilter(e.target.value)} 
                className="w-full h-10 px-3 bg-background border border-border rounded-lg text-xs text-foreground focus:border-emerald-500 outline-none"
              >
                <option value="all">All Employees</option>
                {getUniquePersons().map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>

            <div className="flex items-center justify-between px-2 mb-2">
              <label className="flex items-center gap-3 cursor-pointer group">
                <input 
                  type="checkbox" 
                  checked={getFilteredRequestGroups().length > 0 && getFilteredRequestGroups().every(g => selectedGroupIds.includes(requestGroups.indexOf(g).toString()))} 
                  onChange={(e) => handleSelectAll(e.target.checked)} 
                  className="h-5 w-5 rounded border-border bg-background text-emerald-600 accent-emerald-600" 
                />
                <span className="text-[11px] font-bold text-muted-foreground uppercase">Select All</span>
              </label>
              <span className="text-[11px] font-bold text-muted-foreground bg-surface border border-border px-3 py-1 rounded-full uppercase tracking-tighter">{getFilteredRequestGroups().length} pending</span>
            </div>

            {viewMode === 'table' ? (
              <div className="rounded-xl border border-border bg-surface overflow-hidden w-full shadow-[inset_0_0_0_1px_rgba(147,197,253,0.18)]">
                <div className="overflow-x-auto lg:overflow-x-visible w-full">
                  <table className="w-full min-w-[980px] lg:min-w-0 lg:table-fixed border-collapse text-left">
                    <thead className="bg-background/70 border-b border-border">
                      <tr>
                        <th className="px-3 py-3 w-11 text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                          <input
                            type="checkbox"
                            checked={getFilteredRequestGroups().length > 0 && getFilteredRequestGroups().every(g => selectedGroupIds.includes(getGroupIdx(g)))}
                            onChange={(e) => handleSelectAll(e.target.checked)}
                            className="h-4 w-4 rounded border-border bg-background text-emerald-600 accent-emerald-600"
                          />
                        </th>
                        <th className="px-3 py-3 lg:w-[12%] text-[10px] font-black uppercase tracking-widest text-muted-foreground">Employee</th>
                        <th className="px-3 py-3 lg:w-[14%] text-[10px] font-black uppercase tracking-widest text-muted-foreground">Type</th>
                        <th className="px-3 py-3 lg:w-[12%] text-[10px] font-black uppercase tracking-widest text-muted-foreground">Date(s)</th>
                        <th className="px-3 py-3 lg:w-[9%] text-[10px] font-black uppercase tracking-widest text-muted-foreground">Actual</th>
                        <th className="px-3 py-3 lg:w-[9%] text-[10px] font-black uppercase tracking-widest text-muted-foreground">Request</th>
                        <th className="px-3 py-3 lg:w-[22%] text-[10px] font-black uppercase tracking-widest text-muted-foreground">Reason</th>
                        <th className="px-3 py-3 lg:w-[200px] min-w-[180px] text-[10px] font-black uppercase tracking-widest text-muted-foreground">Remark</th>
                        <th className="px-3 py-3 lg:w-24 text-[10px] font-black uppercase tracking-widest text-muted-foreground">Value</th>
                        <th className="px-3 py-3 lg:w-[200px] min-w-[180px] text-[10px] font-black uppercase tracking-widest text-muted-foreground text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {getFilteredRequestGroups().map((group, i) => {
                        const idx = getGroupIdx(group);
                        const isSelected = selectedGroupIds.includes(idx);
                        const isLeave = group.requestedStatus.toLowerCase().includes('leave') || group.requestedStatus === 'On leave';
                        return (
                          <tr
                            key={`${idx}-${i}`}
                            className={`border-b border-border ${isSelected ? 'bg-emerald-600/10' : 'hover:bg-background/60'}`}
                          >
                            <td className="px-3 py-3 align-top">
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={(e) => handleSelectGroup(idx, e.target.checked)}
                                className="h-4 w-4 rounded border-border bg-background text-emerald-600 accent-emerald-600"
                              />
                            </td>
                            <td className="px-3 py-3 align-top">
                              <div className="text-sm font-bold text-foreground">{group.userName}</div>
                            </td>
                            <td className="px-3 py-3 align-top">
                              <span className={`inline-flex px-2 py-0.5 rounded-lg text-[9px] font-black uppercase tracking-widest border ${
                                isLeave ? 'bg-amber-500/15 text-amber-800 border-amber-500/35' : 'bg-blue-500/15 text-blue-800 border-blue-500/35'
                              }`}>
                                {group.requestedStatus}
                              </span>
                            </td>
                            <td className="px-3 py-3 align-top text-[11px] font-bold text-foreground">{group.dateDisplay}</td>
                            <td className="px-3 py-3 align-top text-[11px] font-mono text-muted-foreground">{group.originalTimeRange === '-' ? '--:--' : group.originalTimeRange}</td>
                            <td className="px-3 py-3 align-top text-[11px] font-mono font-semibold text-emerald-700">{group.timeRange === '-' ? '--:--' : group.timeRange}</td>
                            <td className="px-3 py-3 align-top text-[11px] text-muted-foreground lg:overflow-hidden">
                              <div className="max-w-[320px] lg:max-w-none whitespace-pre-wrap break-words">{group.reason || '—'}</div>
                            </td>
                            <td className="px-3 py-3 align-top">
                              <input
                                type="text"
                                value={remarks[idx] || ''}
                                onChange={(e) => setRemarks({ ...remarks, [idx]: e.target.value })}
                                className="w-full max-w-[14rem] lg:max-w-full min-w-0 h-9 px-2 lg:px-3 bg-background border border-border rounded-lg text-xs text-foreground placeholder:text-muted-foreground focus:border-emerald-500 outline-none"
                                placeholder="Remark..."
                              />
                            </td>
                            <td className="px-3 py-3 align-top">
                              {isFixedValueType(group.requestedStatus) ? (
                                <span className="text-[11px] font-bold text-muted-foreground">—</span>
                              ) : (
                                <input
                                  type="number"
                                  step="0.01"
                                  value={values[idx] ?? getDefaultValueForType(group.requestedStatus)}
                                  onChange={(e) => setValues({ ...values, [idx]: e.target.value })}
                                  className="w-20 h-9 bg-background border border-border rounded-lg text-center text-xs font-bold text-emerald-700 focus:border-emerald-500 outline-none"
                                />
                              )}
                            </td>
                            <td className="px-3 py-3 align-top text-right">
                              <div className="inline-flex gap-1.5">
                                <button
                                  onClick={() => handleDirectAction(idx, 'reject')}
                                  disabled={processingGroups[idx]}
                                  className="h-9 px-3 bg-surface hover:bg-rose-500/15 border border-border rounded-lg text-[11px] font-bold text-muted-foreground hover:text-rose-700 active:scale-95 transition-all"
                                >
                                  Reject
                                </button>
                                <button
                                  onClick={() => handleDirectAction(idx, 'approve')}
                                  disabled={processingGroups[idx]}
                                  className="h-9 px-5 bg-emerald-600 hover:bg-emerald-500 rounded-lg text-[11px] font-black text-white shadow-md shadow-emerald-600/15 active:scale-95 transition-all flex items-center gap-2 justify-center"
                                >
                                  {processingGroups[idx] ? (
                                    <div className="h-3 w-3 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                                  ) : (
                                    'Approve'
                                  )}
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <div className="p-3 text-[11px] text-muted-foreground border-t border-border lg:hidden bg-background/40">
                  Tip: Swipe sideways to view all columns. On desktop the table uses the full width.
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                {getFilteredRequestGroups().map((group) => {
                  const idx = getGroupIdx(group);
                  const isSelected = selectedGroupIds.includes(idx);
                  const isExpanded = expandedReasons[idx];
                  const isLeave = group.requestedStatus.toLowerCase().includes('leave') || group.requestedStatus === 'On leave';
                  
                  return (
                    <div 
                      key={idx} 
                      className={`relative rounded-xl border transition-all duration-200 shadow-[inset_0_0_0_1px_rgba(147,197,253,0.12)] ${
                        isSelected 
                          ? 'border-emerald-600/45 bg-emerald-600/[0.08]' 
                          : 'border-border bg-surface hover:bg-surface/90'
                      }`}
                    >
                      <div className="p-3 sm:p-4">
                        <div className="flex items-start gap-3">
                          <div className="mt-1">
                            <input 
                              type="checkbox" 
                              checked={isSelected} 
                              onChange={(e) => handleSelectGroup(idx, e.target.checked)} 
                              className="h-5 w-5 rounded border-border bg-background text-emerald-600 accent-emerald-600" 
                            />
                          </div>

                          <div className="flex-1 min-w-0">
                            {/* Row 1: Name, Status & Date */}
                            <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 mb-2.5">
                              <div className="flex items-center gap-2 min-w-0">
                                <h3 className="text-sm font-bold text-foreground truncate">{group.userName}</h3>
                                <span className={`px-2 py-0.5 rounded-lg text-[9px] font-black uppercase tracking-widest border ${
                                  isLeave ? 'bg-amber-500/15 text-amber-800 border-amber-500/35' : 'bg-blue-500/15 text-blue-800 border-blue-500/35'
                                }`}>
                                  {group.requestedStatus}
                                </span>
                              </div>
                              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-tighter">{group.dateDisplay}</p>
                            </div>

                            {/* Row 2: Two-Column Side-by-Side (Time vs Reason) */}
                            <div className="grid grid-cols-2 gap-3 mb-3">
                              {/* Left: Times */}
                              <div className="flex flex-col gap-1.5 p-2 bg-background/70 rounded-lg border border-border">
                                <div className="flex items-center justify-between text-[10px] font-mono text-muted-foreground uppercase tracking-tight">
                                  <span>Actual</span>
                                  <span>Request</span>
                                </div>
                                <div className="flex items-center justify-between gap-2 text-xs font-mono">
                                  <span className="text-muted-foreground">{group.originalTimeRange === '-' ? '--:--' : group.originalTimeRange}</span>
                                  <svg className="w-3 h-3 text-muted-foreground/70 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M13 7l5 5m0 0l-5 5m5-5H6" /></svg>
                                  <span className="text-emerald-700 font-black">{group.timeRange === '-' ? '--:--' : group.timeRange}</span>
                                </div>
                              </div>

                              {/* Right: Reason */}
                              <div 
                                onClick={() => toggleReason(idx)}
                                className={`p-2 bg-background/70 border border-border rounded-lg cursor-pointer hover:bg-background transition-colors relative ${isExpanded ? 'z-10' : ''}`}
                              >
                                <div className="flex items-center gap-1.5 mb-1 text-[10px] font-bold text-muted-foreground uppercase tracking-tight">
                                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 8h10M7 12h4" /></svg>
                                  <span>Reason</span>
                                </div>
                                <p className={`text-[11px] leading-relaxed text-muted-foreground italic ${isExpanded ? '' : 'line-clamp-2'}`}>
                                  {group.reason || 'No reason provided'}
                                </p>
                                {group.reason && group.reason.length > 40 && !isExpanded && (
                                  <div className="absolute bottom-1 right-2 text-[9px] font-bold text-emerald-700/70">TAP TO EXPAND</div>
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
                                      className="w-full h-9 px-3 bg-background border border-border rounded-lg text-xs text-foreground placeholder:text-muted-foreground focus:border-emerald-500 outline-none" 
                                      placeholder="Remark..." 
                                    />
                                  </div>
                                  {!isFixedValueType(group.requestedStatus) && (
                                    <input 
                                      type="number" 
                                      step="0.01" 
                                      value={values[idx] ?? getDefaultValueForType(group.requestedStatus)} 
                                      onChange={(e) => setValues({...values, [idx]: e.target.value})} 
                                      className="w-14 h-9 bg-background border border-border rounded-lg text-center text-xs font-bold text-emerald-700 focus:border-emerald-500 outline-none" 
                                    />
                                  )}
                                </div>
                                {/* Wrapped Chips - All Visible */}
                                <div className="flex flex-wrap items-center gap-1.5 select-none">
                                  {APPROVE_CHIPS.map(c => (
                                    <button 
                                      key={c} 
                                      onClick={() => setRemarks({...remarks, [idx]: c})} 
                                      className="px-2 py-1 bg-emerald-600/10 hover:bg-emerald-600/18 rounded-lg text-[10px] font-bold text-emerald-800 border border-emerald-600/25 transition-colors"
                                    >
                                      {c}
                                    </button>
                                  ))}
                                  {REJECT_CHIPS.map(c => (
                                    <button 
                                      key={c} 
                                      onClick={() => setRemarks({...remarks, [idx]: c})} 
                                      className="px-2 py-1 bg-rose-500/12 hover:bg-rose-500/20 rounded-lg text-[10px] font-bold text-rose-700 border border-rose-500/25 transition-colors"
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
                                  className="h-9 px-3 bg-surface hover:bg-rose-500/15 border border-border rounded-lg text-[11px] font-bold text-muted-foreground hover:text-rose-700 active:scale-95 transition-all"
                                >
                                  Reject
                                </button>
                                <button 
                                  onClick={() => handleDirectAction(idx, 'approve')} 
                                  disabled={processingGroups[idx]} 
                                  className="h-9 px-6 bg-emerald-600 hover:bg-emerald-500 rounded-lg text-[11px] font-black text-white shadow-md shadow-emerald-600/15 active:scale-95 transition-all flex items-center gap-2"
                                >
                                  {processingGroups[idx] ? <div className="h-3 w-3 border-2 border-white/40 border-t-white rounded-full animate-spin"></div> : 'Approve'}
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
            )}
          </div>
        )}
      </main>

      {/* Prominent Bulk Action Bar */}
      {requestGroups.length > 0 && selectedGroupIds.length > 0 && (
        <div className="fixed bottom-8 left-1/2 -translate-x-1/2 w-[94%] max-w-lg z-[60] animate-in fade-in slide-in-from-bottom-6 duration-500">
          <div className="bg-surface/95 backdrop-blur-md border border-border rounded-2xl p-3 shadow-[0_20px_50px_rgba(12,31,54,0.18),inset_0_0_0_1px_rgba(147,197,253,0.2)]">
            <div className="flex items-center gap-3">
              <button 
                onClick={() => handleBulkAction('reject')} 
                disabled={processing}
                className="flex-1 h-14 bg-background/80 hover:bg-rose-500/15 border border-border rounded-xl text-sm font-bold text-foreground hover:text-rose-700 transition-all active:scale-95 disabled:opacity-50"
              >
                Bulk Reject ({selectedGroupIds.length})
              </button>
              <button 
                onClick={() => handleBulkAction('approve')} 
                disabled={processing}
                className="flex-[1.5] h-14 bg-emerald-600 hover:bg-emerald-500 rounded-xl text-sm font-black text-white shadow-lg shadow-emerald-600/25 transition-all active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {processing ? (
                  <div className="h-5 w-5 border-2 border-white/35 border-t-white rounded-full animate-spin"></div>
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
    <Suspense
      fallback={
        <div className="flex justify-center items-center min-h-screen bg-background text-muted-foreground">
          <p className="text-sm">Loading...</p>
        </div>
      }
    >
      <ReviewAllPageContent />
    </Suspense>
  );
}