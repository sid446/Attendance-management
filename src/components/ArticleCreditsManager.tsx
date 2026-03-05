import React, { useState, useEffect } from 'react';
import { User } from '@/types/ui';

interface ArticleCreditRow {
  empId: string;
  name: string;
  creditAsOnJan26: number;
  leaveTakenBeforeJan26: number; // From leaveBalance.used
  leaveTakenAfterJan26: number; // From leaveBalance.usedAfterJan26
  totalExcessHours: number; // Sum of excessHour from summary of each month from Jan 2026
  finalCredit: number;
}

const fetchUsers = async (): Promise<User[]> => {
  const res = await fetch('/api/users');
  const json = await res.json();
  return json.success ? json.data : [];
};

const fetchAttendance = async (userId: string): Promise<any[]> => {
  // Fetch all attendance records for the user
  const res = await fetch(`/api/attendance?userId=${userId}`);
  const json = await res.json();
  return json.success ? json.data : [];
};

const calculateArticleCredit = (user: User, attendanceRecords: any[]): ArticleCreditRow => {
  const creditAsOnJan26 = user.articleCreditsAsOnJan26 || 0;
  const leaveTakenBeforeJan26 = user.leaveBalance?.used || 0; // Leaves taken before 1st Jan 2026
  const leaveTakenAfterJan26 = user.leaveBalance?.usedAfterJan26 || 0; // Leaves taken on or after 1st Jan 2026
  let totalExcessHours = 0; // Sum of excessHour from summary of each month from Jan 2026

  // Reference: "2026-01" for string comparison
  const jan2026Str = '2026-01';

  attendanceRecords.forEach((month: any) => {
    const monthYear = month.monthYear || '';
    // String comparison: "2026-01" >= "2026-01" is true
    const isOnOrAfterJan2026 = monthYear >= jan2026Str;

    // Add excess hours from summary if month is on or after Jan 2026
    if (isOnOrAfterJan2026 && typeof month.summary?.excessHour === 'number') {
      totalExcessHours += month.summary.excessHour;
    }
  });

  // Final credit calculation: creditAsOnJan26 - leaveTakenAfterJan26 + totalExcessHours
  const finalCredit = creditAsOnJan26 - leaveTakenAfterJan26 + totalExcessHours;

  return {
    empId: user.employeeCode || user.odId || '',
    name: user.name,
    creditAsOnJan26,
    leaveTakenBeforeJan26,
    leaveTakenAfterJan26,
    totalExcessHours: Number(totalExcessHours.toFixed(2)),
    finalCredit: Number(finalCredit.toFixed(2)),
  };
};

export const ArticleCreditsManager: React.FC = () => {
  const [rows, setRows] = useState<ArticleCreditRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState<{ start: string; end: string }>({ start: '', end: '' });
  const [search, setSearch] = useState('');
  const [sortField, setSortField] = useState<keyof ArticleCreditRow>('finalCredit');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [showRangeModal, setShowRangeModal] = useState(false);
  const [showCalcModal, setShowCalcModal] = useState(false);
  const [calcRow, setCalcRow] = useState<ArticleCreditRow|null>(null);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const users = await fetchUsers();
      const articleUsers = users.filter(u => u.category === 'Article');
      const allRows: ArticleCreditRow[] = [];
      for (const user of articleUsers) {
        const attendance = await fetchAttendance(user._id);
        // Filter records for 2 years if needed (by range)
        const filtered = attendance.filter((rec: any) => {
          if (!range.start || !range.end) return true;
          return rec.monthYear >= range.start && rec.monthYear <= range.end;
        });
        allRows.push(calculateArticleCredit(user, filtered));
      }
      setRows(allRows);
      setLoading(false);
    };
    load();
  }, [range]);

  // Dashboard stats
  const stats = {
    totalArticles: rows.length,
    sumCredits: rows.reduce((acc, r) => acc + r.creditAsOnJan26, 0),
    sumFinalCredits: rows.reduce((acc, r) => acc + r.finalCredit, 0),
  };

  // Sorting
  const sortedRows = [...rows]
    .filter(r =>
      !search ||
      r.name.toLowerCase().includes(search.toLowerCase()) ||
      r.empId.toLowerCase().includes(search.toLowerCase())
    )
    .sort((a, b) => {
      let aVal = a[sortField];
      let bVal = b[sortField];
      if (typeof aVal === 'string' && typeof bVal === 'string') {
        return sortDir === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
      } else {
        return sortDir === 'asc' ? (aVal as number) - (bVal as number) : (bVal as number) - (aVal as number);
      }
    });

  // Export to Excel
  const handleExport = async () => {
    if (rows.length === 0) return;
    const ExcelJS = (await import('exceljs')).default;
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Article Credits');
    worksheet.columns = [
      { key: 'empId', header: 'Emp ID', width: 12 },
      { key: 'name', header: 'Name', width: 18 },
      { key: 'creditAsOnJan26', header: 'Credit (as on 1 Jan 26)', width: 18 },
      { key: 'leaveTakenBeforeJan26', header: 'Leave Taken Before 1 Jan 2026', width: 24 },
      { key: 'leaveTakenAfterJan26', header: 'Leave Taken On/After 1 Jan 2026', width: 28 },
      { key: 'totalExcessHours', header: 'Excess Hours (from Jan 2026)', width: 22 },
      { key: 'finalCredit', header: 'Final Credit', width: 14 },
    ];
    rows.forEach(row => worksheet.addRow(row));
    worksheet.getRow(1).font = { bold: true, size: 12 };
    worksheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return;
      row.eachCell(cell => {
        cell.font = { size: 11 };
        cell.alignment = { vertical: 'middle', horizontal: 'center' };
        cell.border = {
          top: { style: 'thin' },
          bottom: { style: 'thin' },
          left: { style: 'thin' },
          right: { style: 'thin' },
        };
      });
    });
    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'Article_Credits.xlsx';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
  };

  // Range modal with dropdowns for month selection
  const RangeModal: React.FC<{isOpen: boolean; onClose: () => void}> = ({isOpen, onClose}) => {
    const [start, setStart] = useState(range.start);
    const [end, setEnd] = useState(range.end);
    // Generate a list of months for the last 3 years
    const months: string[] = [];
    const now = new Date();
    for (let y = now.getFullYear(); y >= now.getFullYear() - 2; y--) {
      for (let m = 11; m >= 0; m--) {
        const ym = `${y}-${String(m+1).padStart(2,'0')}`;
        if (y === now.getFullYear() && m > now.getMonth()) continue;
        months.push(ym);
      }
    }
    // Sort months descending
    months.sort((a, b) => b.localeCompare(a));

    const apply = () => {
      if (start && end && start > end) {
        alert('Start month must be before or equal to end month.');
        return;
      }
      setRange({ start, end });
      onClose();
    };
    if (!isOpen) return null;
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
        <div className="bg-slate-900 border border-slate-700 rounded-xl shadow-2xl w-full max-w-md overflow-hidden flex flex-col max-h-[80vh]" onClick={e => e.stopPropagation()}>
          <div className="bg-slate-950 px-4 py-3 border-b border-slate-800 flex justify-between items-center">
            <h3 className="font-semibold text-slate-100">Select Custom Month Range</h3>
            <button onClick={onClose} className="text-slate-500 hover:text-white"><span>X</span></button>
          </div>
          <div className="p-4 flex-1">
            <div className="flex flex-col md:flex-row gap-6 justify-between">
              {/* Start Month Dropdown */}
              <div className="flex-1">
                <div className="mb-2 text-slate-300 font-medium">From</div>
                <select
                  className="w-full bg-slate-950 border border-slate-800 text-slate-300 rounded-md px-2 py-2 font-mono"
                  value={start}
                  onChange={e => setStart(e.target.value)}
                >
                  <option value="">Select month</option>
                  {months.map(m => (
                    <option key={m+':start'} value={m}>{m}</option>
                  ))}
                </select>
              </div>
              {/* End Month Dropdown */}
              <div className="flex-1">
                <div className="mb-2 text-slate-300 font-medium">To</div>
                <select
                  className="w-full bg-slate-950 border border-slate-800 text-slate-300 rounded-md px-2 py-2 font-mono"
                  value={end}
                  onChange={e => setEnd(e.target.value)}
                >
                  <option value="">Select month</option>
                  {months.map(m => (
                    <option key={m+':end'} value={m}>{m}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="mt-6 flex gap-2 items-center justify-between">
              <div className="text-xs text-slate-400 font-mono">{start && end ? `Selected: ${start} to ${end}` : 'Select start and end months.'}</div>
              <button onClick={apply} className="px-5 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-md font-semibold">Apply</button>
            </div>
          </div>
          <div className="bg-slate-950 px-4 py-2 border-t border-slate-800 text-right">
            <button onClick={onClose} className="text-xs text-slate-400 hover:text-white px-3 py-1.5 rounded-md hover:bg-slate-800 transition-colors">Close</button>
          </div>
        </div>
      </div>
    );
  };

  // Calculation Modal
  const CalculationModal: React.FC<{row: ArticleCreditRow|null, isOpen: boolean, onClose: () => void}> = ({row, isOpen, onClose}) => {
    if (!isOpen || !row) return null;
    // Recompute the breakdown for display
    const base = row.creditAsOnJan26;
    const leaveAfter = row.leaveTakenAfterJan26;
    const excess = row.totalExcessHours;
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
        <div className="bg-slate-900 border border-slate-700 rounded-xl shadow-2xl w-full max-w-md overflow-hidden flex flex-col max-h-[90vh]" onClick={e => e.stopPropagation()}>
          <div className="bg-slate-950 px-4 py-3 border-b border-slate-800 flex justify-between items-center">
            <h3 className="font-semibold text-slate-100">Credit Calculation for {row.name}</h3>
            <button onClick={onClose} className="text-slate-500 hover:text-white"><span>X</span></button>
          </div>
          <div className="p-5 text-slate-200 text-sm space-y-2">
            <div><span className="font-semibold">Base Credit (as on 1 Jan 26):</span> <span className="font-mono">{base}</span></div>
            <div><span className="font-semibold">Leave Taken After 1 Jan 2026:</span> <span className="font-mono text-rose-400">- {leaveAfter}</span></div>
            <div><span className="font-semibold">Excess Hours (from Jan 2026):</span> <span className={`font-mono ${excess >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>{excess >= 0 ? '+' : ''}{excess}</span></div>
            <hr className="my-2 border-slate-700" />
            <div className="font-bold text-lg">Final Credit: <span className="font-mono text-emerald-300">{row.finalCredit}</span></div>
            <div className="text-xs text-slate-400 mt-2">Formula: Credit (Jan 26) - Leave After Jan 26 + Excess Hours</div>
          </div>
          <div className="bg-slate-950 px-4 py-2 border-t border-slate-800 text-right">
            <button onClick={onClose} className="text-xs text-slate-400 hover:text-white px-3 py-1.5 rounded-md hover:bg-slate-800 transition-colors">Close</button>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6 p-6">
      {/* Control Bar */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4 flex flex-col md:flex-row justify-between items-center gap-4">
        {/* Period Selector */}
        <div className="flex flex-col gap-2 md:flex-row md:items-center">
          <div className="flex items-center gap-2">
            <span className="text-slate-400 font-medium mr-2">Period:</span>
            <div className="flex gap-1 bg-slate-950 border border-slate-800 rounded-lg p-1">
              <button
                className={`px-3 py-1 rounded-md text-xs font-semibold transition-colors ${!range.start && !range.end ? 'bg-emerald-600 text-white' : 'text-slate-300 hover:bg-slate-800'}`}
                onClick={() => setRange({ start: '', end: '' })}
              >All</button>
              <button
                className={`px-3 py-1 rounded-md text-xs font-semibold transition-colors ${(() => { const now = new Date(); const ym = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`; return range.start === ym && range.end === ym; })() ? 'bg-emerald-600 text-white' : 'text-slate-300 hover:bg-slate-800'}`}
                onClick={() => { const now = new Date(); const ym = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`; setRange({ start: ym, end: ym }); }}
              >Current Month</button>
              <button
                className={`px-3 py-1 rounded-md text-xs font-semibold transition-colors ${(() => { const now = new Date(); const end = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`; const startDate = new Date(now.getFullYear(), now.getMonth()-2, 1); const start = `${startDate.getFullYear()}-${String(startDate.getMonth()+1).padStart(2,'0')}`; return range.start === start && range.end === end; })() ? 'bg-emerald-600 text-white' : 'text-slate-300 hover:bg-slate-800'}`}
                onClick={() => { const now = new Date(); const end = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`; const startDate = new Date(now.getFullYear(), now.getMonth()-2, 1); const start = `${startDate.getFullYear()}-${String(startDate.getMonth()+1).padStart(2,'0')}`; setRange({ start, end }); }}
              >Last 3 Months</button>
              <button
                className={`px-3 py-1 rounded-md text-xs font-semibold transition-colors ${(() => { const now = new Date(); const end = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`; const startDate = new Date(now.getFullYear(), now.getMonth()-5, 1); const start = `${startDate.getFullYear()}-${String(startDate.getMonth()+1).padStart(2,'0')}`; return range.start === start && range.end === end; })() ? 'bg-emerald-600 text-white' : 'text-slate-300 hover:bg-slate-800'}`}
                onClick={() => { const now = new Date(); const end = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`; const startDate = new Date(now.getFullYear(), now.getMonth()-5, 1); const start = `${startDate.getFullYear()}-${String(startDate.getMonth()+1).padStart(2,'0')}`; setRange({ start, end }); }}
              >Last 6 Months</button>
              <button
                className={`px-3 py-1 rounded-md text-xs font-semibold transition-colors ${(() => { const now = new Date(); const end = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`; const startDate = new Date(now.getFullYear()-1, now.getMonth()+1, 1); const start = `${startDate.getFullYear()}-${String(startDate.getMonth()+1).padStart(2,'0')}`; return range.start === start && range.end === end; })() ? 'bg-emerald-600 text-white' : 'text-slate-300 hover:bg-slate-800'}`}
                onClick={() => { const now = new Date(); const end = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`; const startDate = new Date(now.getFullYear()-1, now.getMonth()+1, 1); const start = `${startDate.getFullYear()}-${String(startDate.getMonth()+1).padStart(2,'0')}`; setRange({ start, end }); }}
              >Last 12 Months</button>
              <button
                className={`px-3 py-1 rounded-md text-xs font-semibold transition-colors ${range.start && range.end && !(range.start === range.end) && 'bg-blue-600 text-white'}`}
                onClick={() => setShowRangeModal(true)}
              >Custom</button>
            </div>
            <span className="ml-4 text-slate-500 text-xs font-mono">{range.start && range.end ? `${range.start} to ${range.end}` : 'All Data'}</span>
          </div>
        </div>
        {/* Search & Export */}
        <div className="flex items-center gap-3 w-full md:w-auto">
          <div className="relative flex-1 md:w-64">
            <input
              type="text"
              placeholder="Search article..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 text-slate-300 text-sm rounded-full pl-4 pr-4 py-2 outline-none focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/20 placeholder:text-slate-600"
            />
          </div>
          <button 
            onClick={handleExport}
            className="p-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-full transition-colors shadow-sm"
            title="Export Article Credits to Excel"
          >
            <span role="img" aria-label="download">⬇️</span>
          </button>
        </div>
      </div>

      {/* Dashboard Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <div className="bg-slate-900/40 border border-slate-800 rounded-lg p-4 flex items-center gap-4">
          <div className="p-3 bg-emerald-500/10 rounded-full text-emerald-400">
            <span role="img" aria-label="article">📰</span>
          </div>
          <div>
            <div className="text-2xl font-bold text-slate-100">{stats.totalArticles}</div>
            <div className="text-xs text-slate-400 uppercase tracking-wider font-medium">Total Articles</div>
          </div>
        </div>
        <div className="bg-slate-900/40 border border-slate-800 rounded-lg p-4 flex items-center gap-4">
          <div className="p-3 bg-blue-500/10 rounded-full text-blue-400">
            <span role="img" aria-label="credit">💳</span>
          </div>
          <div>
            <div className="text-2xl font-bold text-slate-100">{stats.sumCredits}</div>
            <div className="text-xs text-slate-400 uppercase tracking-wider font-medium">Sum of Credits (Jan 26)</div>
          </div>
        </div>
        <div className="bg-slate-900/40 border border-slate-800 rounded-lg p-4 flex items-center gap-4">
          <div className="p-3 bg-indigo-500/10 rounded-full text-indigo-400">
            <span role="img" aria-label="final">🏅</span>
          </div>
          <div>
            <div className="text-2xl font-bold text-slate-100">{stats.sumFinalCredits.toFixed(2)}</div>
            <div className="text-xs text-slate-400 uppercase tracking-wider font-medium">Sum of Final Credits</div>
          </div>
        </div>
      </div>

      {/* Data Table */}
      <section className="bg-slate-900/60 border border-slate-800 rounded-xl shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-slate-500 flex flex-col items-center gap-3">
            <div className="w-6 h-6 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin"></div>
            <p>Loading article credits...</p>
          </div>
        ) : sortedRows.length === 0 ? (
          <div className="p-12 text-center text-slate-500 flex flex-col items-center gap-3">
            <p>No article employees found for selected period.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-xs">
              <thead className="bg-slate-950 border-b border-slate-800 sticky top-0">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold text-slate-400 cursor-pointer" onClick={() => { setSortField('empId'); setSortDir(sortDir === 'asc' ? 'desc' : 'asc'); }}>Emp ID</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-300 cursor-pointer" onClick={() => { setSortField('name'); setSortDir(sortDir === 'asc' ? 'desc' : 'asc'); }}>Name</th>
                  <th className="px-4 py-3 text-right font-semibold text-blue-400 cursor-pointer" onClick={() => { setSortField('creditAsOnJan26'); setSortDir(sortDir === 'asc' ? 'desc' : 'asc'); }}>Credit (as on 1 Jan 26)</th>
                  <th className="px-4 py-3 text-right font-semibold text-rose-400 cursor-pointer" onClick={() => { setSortField('leaveTakenBeforeJan26'); setSortDir(sortDir === 'asc' ? 'desc' : 'asc'); }}>Leave Taken Before 1 Jan 2026</th>
                  <th className="px-4 py-3 text-right font-semibold text-sky-400 cursor-pointer" onClick={() => { setSortField('leaveTakenAfterJan26'); setSortDir(sortDir === 'asc' ? 'desc' : 'asc'); }}>Leave Taken On/After 1 Jan 2026</th>
                  <th className="px-4 py-3 text-right font-semibold text-amber-400 cursor-pointer" onClick={() => { setSortField('totalExcessHours'); setSortDir(sortDir === 'asc' ? 'desc' : 'asc'); }}>Excess Hours (from Jan 2026)</th>
                  <th className="px-4 py-3 text-right font-semibold text-emerald-300 cursor-pointer" onClick={() => { setSortField('finalCredit'); setSortDir(sortDir === 'asc' ? 'desc' : 'asc'); }}>Final Credit</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {sortedRows.map((row, idx) => (
                  <tr key={idx} className="hover:bg-slate-800/40 transition-colors">
                    <td className="px-4 py-3 text-left font-mono text-slate-400">{row.empId}</td>
                    <td className="px-4 py-3 font-medium text-slate-200">{row.name}</td>
                    <td className="px-4 py-3 text-right font-mono text-blue-400">{row.creditAsOnJan26}</td>
                    <td className="px-4 py-3 text-right font-mono text-rose-400">{row.leaveTakenBeforeJan26}</td>
                    <td className="px-4 py-3 text-right font-mono text-sky-400">{row.leaveTakenAfterJan26}</td>
                    <td className="px-4 py-3 text-right font-mono text-amber-400">{row.totalExcessHours}</td>
                    <td
                      className="px-4 py-3 text-right font-mono text-emerald-300 font-bold cursor-pointer underline decoration-dotted hover:bg-slate-800/60"
                      title="Show calculation"
                      onClick={() => { setCalcRow(row); setShowCalcModal(true); }}
                    >
                      {row.finalCredit}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <RangeModal isOpen={showRangeModal} onClose={() => setShowRangeModal(false)} />
      <CalculationModal row={calcRow} isOpen={showCalcModal} onClose={() => setShowCalcModal(false)} />
    </div>
  );
};
