"use client";
import React, { useState, ChangeEvent, useEffect } from "react";
import * as XLSX from 'xlsx';
import { Upload, FileSpreadsheet, CheckCircle, XCircle, Clock, Lock, Mail, LogOut } from 'lucide-react';

interface AttendanceRecord {
  id: string | number;
  name: string;
  date: string;
  inTime: string;
  outTime: string;
  status: 'Present' | 'Absent';
}

interface AttendanceSummaryView {
  id: string;
  userId: string;
  userName: string;
  monthYear: string;
  summary: {
    totalHour: number;
    totalLateArrival: number;
    excessHour: number;
    totalHalfDay: number;
    totalPresent: number;
    totalAbsent: number;
    totalLeave: number;
  };
}

export default function AttendanceUpload() {
  // Auth state
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [authToken, setAuthToken] = useState<string | null>(null);
  const [loginStep, setLoginStep] = useState<'password' | 'otp'>('password');
  const [password, setPassword] = useState<string>('');
  const [otp, setOtp] = useState<string>('');
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [loginLoading, setLoginLoading] = useState<boolean>(false);
  const [loginError, setLoginError] = useState<string | null>(null);

  // Attendance state
  const [file, setFile] = useState<File | null>(null);
  const [attendanceData, setAttendanceData] = useState<AttendanceRecord[]>([]);
  const [processing, setProcessing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState<boolean>(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [summaries, setSummaries] = useState<AttendanceSummaryView[]>([]);
  const [currentMonthYear, setCurrentMonthYear] = useState<string | null>(null);
  const [uploadTotal, setUploadTotal] = useState<number>(0);
  const [uploadSaved, setUploadSaved] = useState<number>(0);
  const [uploadFailed, setUploadFailed] = useState<number>(0);
  const [activeSection, setActiveSection] = useState<'upload' | 'summary' | 'employee'>('summary');
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string | null>(null);
  const [selectedEmployeeMonth, setSelectedEmployeeMonth] = useState<string>('');
  const [employeeDays, setEmployeeDays] = useState<AttendanceRecord[]>([]);
  const [employeeLoading, setEmployeeLoading] = useState<boolean>(false);
  const [employeeError, setEmployeeError] = useState<string | null>(null);

  // Check for existing auth token on mount
  useEffect(() => {
    const storedToken = localStorage.getItem('attendanceAuthToken');
    if (storedToken) {
      setAuthToken(storedToken);
      setIsAuthenticated(true);
    }
  }, []);

  // Handle password submission
  const handlePasswordSubmit = async () => {
    if (!password) {
      setLoginError('Please enter password');
      return;
    }

    setLoginLoading(true);
    setLoginError(null);

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Login failed');
      }

      setSessionId(result.data.sessionId);
      setLoginStep('otp');
      setPassword('');
    } catch (err) {
      setLoginError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setLoginLoading(false);
    }
  };

  // Handle OTP verification
  const handleOTPSubmit = async () => {
    if (!otp || !sessionId) {
      setLoginError('Please enter OTP');
      return;
    }

    setLoginLoading(true);
    setLoginError(null);

    try {
      const response = await fetch('/api/auth/verify-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, otp }),
      });

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Verification failed');
      }

      const token = result.data.authToken;
      setAuthToken(token);
      setIsAuthenticated(true);
      localStorage.setItem('attendanceAuthToken', token);
      setOtp('');
      setSessionId(null);
    } catch (err) {
      setLoginError(err instanceof Error ? err.message : 'Verification failed');
    } finally {
      setLoginLoading(false);
    }
  };

  // Handle logout
  const handleLogout = () => {
    setIsAuthenticated(false);
    setAuthToken(null);
    localStorage.removeItem('attendanceAuthToken');
    setLoginStep('password');
    setPassword('');
    setOtp('');
    setSessionId(null);
    setLoginError(null);
  };

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      setFile(selectedFile);
      setError(null);
      setSaveMessage(null);
      setAttendanceData([]);
      setSummaries([]);
      setCurrentMonthYear(null);
      setUploadTotal(0);
      setUploadSaved(0);
      setUploadFailed(0);
      setActiveSection('upload');
    }
  };

  const formatExcelTime = (excelTime: any): string => {
    if (!excelTime && excelTime !== 0) return '00:00:00';
    
    // If it's already a string in correct format, return it
    if (typeof excelTime === 'string') {
      if (excelTime.match(/^\d{2}:\d{2}(:\d{2})?$/)) {
        return excelTime.length === 5 ? `${excelTime}:00` : excelTime;
      }
    }
    
    // Excel stores times as decimal fractions of a day
    // 0.5 = 12:00:00, 0.25 = 06:00:00, etc.
    if (typeof excelTime === 'number') {
      const totalSeconds = Math.round(excelTime * 24 * 60 * 60);
      const hours = Math.floor(totalSeconds / 3600);
      const minutes = Math.floor((totalSeconds % 3600) / 60);
      const seconds = totalSeconds % 60;
      
      return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    }
    
    return '00:00:00';
  };

  const formatExcelDate = (excelDate: any): string => {
    if (!excelDate) return '';
    
    // If it's already a formatted string, return it
    if (typeof excelDate === 'string' && excelDate.match(/^\d{2}-\d{2}-\d{4}$/)) {
      return excelDate;
    }
    
    // Excel stores dates as numbers (days since 1900-01-01)
    if (typeof excelDate === 'number') {
      const date = XLSX.SSF.parse_date_code(excelDate);
      const day = String(date.d).padStart(2, '0');
      const month = String(date.m).padStart(2, '0');
      const year = date.y;
      return `${day}-${month}-${year}`;
    }
    
    return String(excelDate);
  };

  const getMonthYearFromDate = (dateStr: string): string | null => {
    // Expecting DD-MM-YYYY, but also handle ISO YYYY-MM-DD
    if (/^\d{2}-\d{2}-\d{4}$/.test(dateStr)) {
      const [dd, mm, yyyy] = dateStr.split('-');
      return `${yyyy}-${mm}`;
    }

    if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
      const [yyyy, mm] = dateStr.split('-');
      return `${yyyy}-${mm}`;
    }

    const d = new Date(dateStr);
    if (Number.isNaN(d.getTime())) return null;
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    return `${yyyy}-${mm}`;
  };

  const processExcelFile = async (): Promise<void> => {
    if (!file) {
      setError('Please select a file first');
      return;
    }

    setProcessing(true);
    setError(null);
    setSaveMessage(null);

    try {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data, { cellDates: false });
      const worksheet = workbook.Sheets[workbook.SheetNames[0]];
      const jsonData: any[][] = XLSX.utils.sheet_to_json(worksheet, { header: 1, raw: true });

      // Find header row (contains 'ID', 'Name', etc.)
      const headerRowIndex = jsonData.findIndex(row => 
        row.some(cell => cell === 'ID' || cell === 'Name')
      );

      if (headerRowIndex === -1) {
        throw new Error('Could not find header row in Excel file');
      }

      const headers: any[] = jsonData[headerRowIndex];
      const dataRows = jsonData.slice(headerRowIndex + 1);

      // Find column indices
      const idIndex = headers.findIndex(h => h === 'ID');
      const nameIndex = headers.findIndex(h => h === 'Name');
      const dateIndex = headers.findIndex(h => h === 'Date');
      const inIndex = headers.findIndex(h => h === 'In');
      const outIndex = headers.findIndex(h => h === 'Out');

      // Support sheets where only the first row for a user has ID/Name
      const processed: AttendanceRecord[] = [];
      let currentId: string | number | null = null;
      let currentName: string | null = null;

      for (const row of dataRows) {
        const rawId = row[idIndex];
        const rawName = row[nameIndex];

        if (rawId !== undefined && rawId !== null && rawId !== '') {
          currentId = rawId;
        }
        if (rawName !== undefined && rawName !== null && rawName !== '') {
          currentName = String(rawName);
        }

        // Skip rows that don't have a carried-over ID/name or any date/time info
        const hasDateOrTime = row[dateIndex] || row[inIndex] || row[outIndex];
        if (!currentId || !currentName || !hasDateOrTime) {
          continue;
        }

        const inTime = formatExcelTime(row[inIndex]);
        const outTime = formatExcelTime(row[outIndex]);
        const date = formatExcelDate(row[dateIndex]);

        const isAbsent = inTime === '00:00:00' && outTime === '00:00:00';

        processed.push({
          id: currentId,
          name: currentName,
          date,
          inTime,
          outTime,
          status: isAbsent ? 'Absent' : 'Present',
        });
      }

      setAttendanceData(processed);

      const inferredMonthYear = processed[0] ? getMonthYearFromDate(processed[0].date) : null;
      setCurrentMonthYear(inferredMonthYear);

      // Automatically upload to API after successful processing
      if (processed.length > 0) {
        setUploadTotal(processed.length);
        setUploadSaved(0);
        setUploadFailed(0);
        await uploadToServer(processed, inferredMonthYear || undefined);
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error occurred';
      setError(`Error processing file: ${errorMessage}`);
    } finally {
      setProcessing(false);
    }
  };

  const uploadToServer = async (
    data: AttendanceRecord[] = attendanceData,
    monthYearOverride?: string
  ): Promise<void> => {
    if (!data || data.length === 0) {
      setError('No attendance data to upload');
      return;
    }

    setSaving(true);
    setSaveMessage(null);
    setError(null);

    if (data && data.length > 0) {
      setUploadTotal(data.length);
    }

    try {
      const response = await fetch('/api/attendance', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ records: data }),
      });

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Failed to save attendance');
      }

      const processedCount = result.data?.processed?.length ?? 0;
      const errorCount = result.data?.errors?.length ?? 0;

      setUploadSaved(processedCount);
      setUploadFailed(errorCount);

      const baseMessage = `Saved ${processedCount} attendance record${processedCount === 1 ? '' : 's'} to the server.`;

      let errorMessage = '';
      if (errorCount > 0) {
        const firstError = result.data?.errors?.[0];
        const example = firstError
          ? ` Example failure (ID ${firstError.odId}): ${firstError.reason}`
          : '';
        errorMessage = ` ${errorCount} record${errorCount === 1 ? '' : 's'} failed to save.${example}`;
      }

      setSaveMessage(baseMessage + errorMessage);

      const monthYearToFetch =
        monthYearOverride || currentMonthYear || (data[0] ? getMonthYearFromDate(data[0].date) : null);
      if (monthYearToFetch) {
        await fetchSummaries(monthYearToFetch);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error occurred';
      setError(`Error saving to server: ${message}`);
    } finally {
      setSaving(false);
    }
  };

  const fetchSummaries = async (monthYear?: string): Promise<void> => {
    try {
      const url = monthYear
        ? `/api/attendance?monthYear=${encodeURIComponent(monthYear)}`
        : '/api/attendance';
      const response = await fetch(url);
      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Failed to fetch attendance summaries');
      }

      const items: any[] = Array.isArray(result.data) ? result.data : [];
      const mapped: AttendanceSummaryView[] = items.map((item) => ({
        id: String(item._id),
        userId: item.userId?._id ? String(item.userId._id) : '',
        userName: item.userId?.name ?? 'Unknown',
        monthYear: item.monthYear,
        summary: {
          totalHour: item.summary?.totalHour ?? 0,
          totalLateArrival: item.summary?.totalLateArrival ?? 0,
          excessHour: item.summary?.excessHour ?? 0,
          totalHalfDay: item.summary?.totalHalfDay ?? 0,
          totalPresent: item.summary?.totalPresent ?? 0,
          totalAbsent: item.summary?.totalAbsent ?? 0,
          totalLeave: item.summary?.totalLeave ?? 0,
        },
      }));

      setSummaries(mapped);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error occurred';
      setError(`Error fetching summaries: ${message}`);
    }
  };

  useEffect(() => {
    // On initial load, show existing attendance summaries from backend (all months)
    fetchSummaries().catch(() => {
      // errors are already handled inside fetchSummaries
    });
  }, []);

  const fetchEmployeeMonthly = async (userId: string, monthYear: string): Promise<void> => {
    if (!userId || !monthYear) return;

    setEmployeeLoading(true);
    setEmployeeError(null);
    setEmployeeDays([]);

    try {
      const url = `/api/attendance?userId=${encodeURIComponent(userId)}&monthYear=${encodeURIComponent(monthYear)}`;
      const response = await fetch(url);
      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Failed to fetch employee attendance');
      }

      const docs: any[] = Array.isArray(result.data) ? result.data : [];
      if (!docs.length) {
        setEmployeeDays([]);
        return;
      }

      const doc = docs[0];
      const recordsObj = doc.records || {};

      const days: AttendanceRecord[] = Object.entries(recordsObj).map(([dateKey, value]: [string, any]) => ({
        id: doc.userId?._id ? String(doc.userId._id) : '',
        name: doc.userId?.name ?? 'Unknown',
        date: dateKey,
        inTime: value.checkin ?? '',
        outTime: value.checkout ?? '',
        status: value.typeOfPresence === 'Leave' ? 'Absent' : 'Present',
      }));

      days.sort((a, b) => {
        const aTime = new Date(a.date).getTime();
        const bTime = new Date(b.date).getTime();
        return aTime - bTime;
      });

      setEmployeeDays(days);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error occurred';
      setEmployeeError(`Error fetching employee attendance: ${message}`);
    } finally {
      setEmployeeLoading(false);
    }
  };

  const selectedEmployee = summaries.find((s) => s.userId === selectedEmployeeId) || null;

  const calendarData = (() => {
    if (!selectedEmployeeMonth || employeeDays.length === 0) return null;

    const [yearStr, monthStr] = selectedEmployeeMonth.split('-');
    const year = Number(yearStr);
    const month = Number(monthStr);

    if (!year || !month) return null;

    const firstDay = new Date(year, month - 1, 1);
    const startWeekday = firstDay.getDay(); // 0 (Sun) - 6 (Sat)
    const daysInMonth = new Date(year, month, 0).getDate();

    const dayRecordMap = new Map<number, AttendanceRecord>();
    for (const rec of employeeDays) {
      const d = new Date(rec.date);
      if (!Number.isNaN(d.getTime()) && d.getFullYear() === year && d.getMonth() + 1 === month) {
        dayRecordMap.set(d.getDate(), rec);
      }
    }

    return { daysInMonth, startWeekday, dayRecordMap };
  })();

  // Login UI (when not authenticated)
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-50 flex items-center justify-center p-6">
        <div className="w-full max-w-md">
          <div className="bg-slate-900/60 border border-slate-800 rounded-xl shadow-lg p-8">
            <div className="flex items-center justify-center gap-3 mb-6">
              <FileSpreadsheet className="w-10 h-10 text-emerald-400" />
              <div>
                <h1 className="text-xl font-semibold text-slate-100">Attendance Console</h1>
                <p className="text-xs text-slate-400">HR Login</p>
              </div>
            </div>

            {loginStep === 'password' ? (
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-2">
                    <Lock className="w-3 h-3 inline mr-1" />
                    Password
                  </label>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handlePasswordSubmit()}
                    placeholder="Enter HR password"
                    className="w-full bg-slate-950 border border-slate-700 rounded-md px-4 py-3 text-slate-100 placeholder-slate-500 focus:outline-none focus:border-emerald-500 transition-colors"
                  />
                </div>

                {loginError && (
                  <div className="bg-rose-950/40 border border-rose-700/60 text-rose-100 px-4 py-3 rounded-md text-xs">
                    {loginError}
                  </div>
                )}

                <button
                  onClick={handlePasswordSubmit}
                  disabled={loginLoading || !password}
                  className="w-full px-4 py-3 bg-emerald-500 text-slate-950 text-sm font-medium rounded-md hover:bg-emerald-400 disabled:bg-slate-700 disabled:text-slate-400 disabled:cursor-not-allowed transition-colors"
                >
                  {loginLoading ? 'Verifying...' : 'Continue'}
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="bg-emerald-950/30 border border-emerald-700/40 text-emerald-100 px-4 py-3 rounded-md text-xs">
                  <Mail className="w-3 h-3 inline mr-1" />
                  OTP sent to admin email. Please check your inbox.
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-2">
                    Enter OTP
                  </label>
                  <input
                    type="text"
                    value={otp}
                    onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    onKeyDown={(e) => e.key === 'Enter' && handleOTPSubmit()}
                    placeholder="6-digit code"
                    maxLength={6}
                    className="w-full bg-slate-950 border border-slate-700 rounded-md px-4 py-3 text-slate-100 text-center text-xl tracking-widest placeholder-slate-500 focus:outline-none focus:border-emerald-500 transition-colors"
                  />
                </div>

                {loginError && (
                  <div className="bg-rose-950/40 border border-rose-700/60 text-rose-100 px-4 py-3 rounded-md text-xs">
                    {loginError}
                  </div>
                )}

                <button
                  onClick={handleOTPSubmit}
                  disabled={loginLoading || otp.length !== 6}
                  className="w-full px-4 py-3 bg-emerald-500 text-slate-950 text-sm font-medium rounded-md hover:bg-emerald-400 disabled:bg-slate-700 disabled:text-slate-400 disabled:cursor-not-allowed transition-colors"
                >
                  {loginLoading ? 'Verifying...' : 'Verify OTP'}
                </button>

                <button
                  onClick={() => {
                    setLoginStep('password');
                    setOtp('');
                    setSessionId(null);
                    setLoginError(null);
                  }}
                  className="w-full px-4 py-2 text-slate-400 text-xs hover:text-slate-200 transition-colors"
                >
                  ← Back to password
                </button>
              </div>
            )}

            <p className="text-center text-slate-500 text-[11px] mt-6">
              OTP will be sent to the admin email for verification
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-50">
      <div className="flex h-screen max-h-screen">
        {/* Sidebar */}
        <aside className="w-64 border-r border-slate-800 bg-slate-900/60 flex flex-col">
          <div className="px-6 py-4 border-b border-slate-800 flex items-center gap-2">
            <FileSpreadsheet className="w-6 h-6 text-emerald-400" />
            <div>
              <div className="text-sm font-semibold tracking-wide text-slate-100">Attendance Console</div>
              <div className="text-xs text-slate-400">Excel import & analytics</div>
            </div>
          </div>

          <nav className="flex-1 px-3 py-4 space-y-1 text-sm">
            <button
              type="button"
              onClick={() => setActiveSection('upload')}
              className={`w-full flex items-center gap-2 px-3 py-2 rounded-md text-left transition-colors ${
                activeSection === 'upload'
                  ? 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/40'
                  : 'text-slate-300 hover:bg-slate-800/60'
              }`}
            >
              <Upload className="w-4 h-4" />
              <span>Attendance Upload</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveSection('summary')}
              className={`w-full flex items-center gap-2 px-3 py-2 rounded-md text-left transition-colors ${
                activeSection === 'summary'
                  ? 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/40'
                  : 'text-slate-300 hover:bg-slate-800/60'
              }`}
            >
              <CheckCircle className="w-4 h-4" />
              <span>Attendance Summary</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveSection('employee')}
              className={`w-full flex items-center gap-2 px-3 py-2 rounded-md text-left transition-colors ${
                activeSection === 'employee'
                  ? 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/40'
                  : 'text-slate-300 hover:bg-slate-800/60'
              }`}
            >
              <Clock className="w-4 h-4" />
              <span>Employee Month View</span>
            </button>
          </nav>

          {uploadTotal > 0 && (
            <div className="px-4 py-3 border-t border-slate-800 text-xs text-slate-400">
              <div className="flex justify-between mb-1">
                <span>Last upload</span>
                <span>
                  {uploadSaved}/{uploadTotal} saved
                  {uploadFailed > 0 && `, ${uploadFailed} failed`}
                </span>
              </div>
              {currentMonthYear && <div className="text-slate-500">Month: {currentMonthYear}</div>}
            </div>
          )}

          {/* Logout button */}
          <div className="px-3 py-3 border-t border-slate-800">
            <button
              type="button"
              onClick={handleLogout}
              className="w-full flex items-center gap-2 px-3 py-2 rounded-md text-left text-sm text-slate-400 hover:bg-slate-800/60 hover:text-rose-300 transition-colors"
            >
              <LogOut className="w-4 h-4" />
              <span>Logout</span>
            </button>
          </div>
        </aside>

        {/* Main content */}
        <main className="flex-1 bg-slate-950/80 overflow-y-auto">
          <div className="max-w-6xl mx-auto px-8 py-6 space-y-6">
            {/* Upload Section */}
            {activeSection === 'upload' && (
              <section className="bg-slate-900/60 border border-slate-800 rounded-xl shadow-sm p-6">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h1 className="text-xl font-semibold text-slate-50">Upload Attendance Excel</h1>
                    <p className="text-xs text-slate-400 mt-1">
                      Upload a single-day or full-month Excel export. Records will be mapped, users created if
                      missing, and monthly summaries updated.
                    </p>
                  </div>
                  <div className="text-xs text-slate-500">
                    Accepted: <span className="text-slate-300">.xlsx, .xls</span>
                  </div>
                </div>

                <div className="mb-5">
                  <label className="block text-xs font-medium text-slate-300 mb-2">Excel file</label>
                  <div className="flex items-center gap-3">
                    <label className="flex-1 flex items-center justify-between px-4 py-3 border border-dashed border-slate-700 rounded-lg cursor-pointer bg-slate-900/80 hover:border-emerald-500 hover:bg-slate-900 transition-colors">
                      <div className="flex items-center gap-2">
                        <Upload className="w-4 h-4 text-slate-400" />
                        <span className="text-xs text-slate-400 truncate">
                          {file ? file.name : 'Click to choose an Excel file'}
                        </span>
                      </div>
                      <span className="text-[11px] text-slate-500">Browse</span>
                      <input
                        type="file"
                        accept=".xlsx,.xls"
                        onChange={handleFileChange}
                        className="hidden"
                      />
                    </label>
                    <button
                      onClick={processExcelFile}
                      disabled={!file || processing}
                      className="px-4 py-2 bg-emerald-500 text-slate-950 text-xs font-medium rounded-md hover:bg-emerald-400 disabled:bg-slate-700 disabled:text-slate-400 disabled:cursor-not-allowed transition-colors"
                    >
                      {processing ? 'Processing…' : 'Upload & Process'}
                    </button>
                  </div>
                </div>

                {error && (
                  <div className="mt-3 bg-rose-950/40 border border-rose-700/60 text-rose-100 px-4 py-3 rounded-md text-xs">
                    {error}
                  </div>
                )}

                {saveMessage && (
                  <div className="mt-3 bg-emerald-950/40 border border-emerald-700/60 text-emerald-100 px-4 py-3 rounded-md text-xs">
                    {saveMessage}
                  </div>
                )}
              </section>
            )}

            {/* Summary Section */}
            {activeSection === 'summary' && (
              <section className="bg-slate-900/60 border border-slate-800 rounded-xl shadow-sm p-6">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h2 className="text-lg font-semibold text-slate-50">Attendance Summary</h2>
                    <p className="text-xs text-slate-400 mt-1">
                      One row per employee per month with calculated totals.
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-1 text-[11px] text-slate-400">
                    <span>Users: {summaries.length}</span>
                    {uploadTotal > 0 && (
                      <span>
                        Last upload: {uploadSaved}/{uploadTotal} saved
                        {uploadFailed > 0 && `, ${uploadFailed} failed`}
                      </span>
                    )}
                  </div>
                </div>

                {summaries.length === 0 ? (
                  <div className="text-xs text-slate-500">No attendance data found yet. Upload an Excel file to begin.</div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="bg-slate-900 border-b border-slate-800">
                          <th className="px-3 py-2 text-left font-semibold text-slate-300">User</th>
                          <th className="px-3 py-2 text-left font-semibold text-slate-300">Month</th>
                          <th className="px-3 py-2 text-right font-semibold text-slate-300">Total Hours</th>
                          <th className="px-3 py-2 text-right font-semibold text-slate-300">Late Arrivals</th>
                          <th className="px-3 py-2 text-right font-semibold text-slate-300">Excess Hours</th>
                          <th className="px-3 py-2 text-right font-semibold text-slate-300">Half Days</th>
                          <th className="px-3 py-2 text-right font-semibold text-slate-300">Present</th>
                          <th className="px-3 py-2 text-right font-semibold text-slate-300">Absent</th>
                          <th className="px-3 py-2 text-right font-semibold text-slate-300">Leave</th>
                        </tr>
                      </thead>
                      <tbody>
                        {summaries.map((item) => (
                          <tr
                            key={item.id}
                            className="border-b border-slate-800/80 hover:bg-slate-900/80 transition-colors"
                          >
                            <td className="px-3 py-2 text-slate-50 font-medium">{item.userName}</td>
                            <td className="px-3 py-2 text-slate-300">{item.monthYear}</td>
                            <td className="px-3 py-2 text-right text-slate-200">{item.summary.totalHour}</td>
                            <td className="px-3 py-2 text-right text-amber-300">{item.summary.totalLateArrival}</td>
                            <td className="px-3 py-2 text-right text-emerald-200">{item.summary.excessHour}</td>
                            <td className="px-3 py-2 text-right text-slate-200">{item.summary.totalHalfDay}</td>
                            <td className="px-3 py-2 text-right text-emerald-300">{item.summary.totalPresent}</td>
                            <td className="px-3 py-2 text-right text-rose-300">{item.summary.totalAbsent}</td>
                            <td className="px-3 py-2 text-right text-sky-300">{item.summary.totalLeave}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            )}

            {/* Employee month-wise Section */}
            {activeSection === 'employee' && (
              <section className="bg-slate-900/60 border border-slate-800 rounded-xl shadow-sm p-6 space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-lg font-semibold text-slate-50">Employee month-wise attendance</h2>
                    <p className="text-xs text-slate-400 mt-1">
                      Select an employee and month to inspect their daily check-in/out.
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-end gap-4 text-xs">
                  <div className="flex flex-col gap-1">
                    <label className="text-slate-300">Employee</label>
                    <select
                      className="bg-slate-950 border border-slate-700 rounded-md px-3 py-2 text-slate-100 min-w-[220px]"
                      value={selectedEmployeeId ?? ''}
                      onChange={(e) => setSelectedEmployeeId(e.target.value || null)}
                    >
                      <option value="">Select employee</option>
                      {summaries
                        .reduce<{ id: string; name: string }[]>((acc, s) => {
                          if (!acc.find((x) => x.id === s.userId)) {
                            acc.push({ id: s.userId, name: s.userName });
                          }
                          return acc;
                        }, [])
                        .map((u) => (
                          <option key={u.id} value={u.id}>
                            {u.name}
                          </option>
                        ))}
                    </select>
                  </div>

                  <div className="flex flex-col gap-1">
                    <label className="text-slate-300">Month</label>
                    <input
                      type="month"
                      placeholder="2026-01"
                      value={selectedEmployeeMonth}
                      onChange={(e) => setSelectedEmployeeMonth(e.target.value)}
                      className="bg-slate-950 border border-slate-700 rounded-md px-3 py-2 text-slate-100 w-32"
                    />
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      if (selectedEmployeeId && selectedEmployeeMonth) {
                        fetchEmployeeMonthly(selectedEmployeeId, selectedEmployeeMonth);
                      }
                    }}
                    disabled={!selectedEmployeeId || !selectedEmployeeMonth || employeeLoading}
                    className="px-4 py-2 bg-emerald-500 text-slate-950 font-medium rounded-md hover:bg-emerald-400 disabled:bg-slate-700 disabled:text-slate-400 disabled:cursor-not-allowed transition-colors"
                  >
                    {employeeLoading ? 'Loading…' : 'Load attendance'}
                  </button>
                </div>

                {employeeError && (
                  <div className="bg-rose-950/40 border border-rose-700/60 text-rose-100 px-4 py-3 rounded-md text-xs">
                    {employeeError}
                  </div>
                )}

                {selectedEmployee && selectedEmployeeMonth && (
                  <div className="text-xs text-slate-400">
                    Showing records for <span className="text-slate-200">{selectedEmployee.userName}</span> in
                    month <span className="text-slate-200">{selectedEmployeeMonth}</span>.
                  </div>
                )}

                <div className="border border-slate-800 rounded-lg p-4">
                  {!calendarData ? (
                    <div className="text-xs text-slate-500">
                      No records loaded. Select employee and month, then click "Load attendance".
                    </div>
                  ) : (
                    <>
                      <div className="grid grid-cols-7 gap-2 mb-2 text-[11px] text-slate-400">
                        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
                          <div key={d} className="text-center font-medium">
                            {d}
                          </div>
                        ))}
                      </div>
                      <div className="grid grid-cols-7 gap-2 text-xs">
                        {Array.from({ length: calendarData.startWeekday }).map((_, idx) => (
                          <div key={`blank-${idx}`} />
                        ))}
                        {Array.from({ length: calendarData.daysInMonth }).map((_, idx) => {
                          const day = idx + 1;
                          const rec = calendarData.dayRecordMap.get(day) || null;
                          const isPresent = rec?.status === 'Present';
                          const isAbsent = rec?.status === 'Absent';

                          return (
                            <div
                              key={day}
                              className={`h-20 rounded-md border px-2 py-1 flex flex-col gap-1 text-[11px] ${
                                isPresent
                                  ? 'border-emerald-500/50 bg-emerald-500/5'
                                  : isAbsent
                                  ? 'border-rose-500/50 bg-rose-500/5'
                                  : 'border-slate-700 bg-slate-950/40'
                              }`}
                            >
                              <div className="flex items-center justify-between text-slate-300">
                                <span className="font-semibold">{day}</span>
                                {rec && (
                                  <span
                                    className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-medium border ${
                                      isPresent
                                        ? 'border-emerald-500/60 bg-emerald-500/15 text-emerald-100'
                                        : 'border-rose-500/60 bg-rose-500/15 text-rose-100'
                                    }`}
                                  >
                                    {isPresent ? <CheckCircle className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
                                    {rec.status}
                                  </span>
                                )}
                              </div>
                              {rec && (
                                <div className="mt-1 space-y-0.5 text-slate-300">
                                  <div className="flex items-center gap-1">
                                    <Clock className="w-3 h-3 text-slate-500" />
                                    <span>In: {rec.inTime || '-'}</span>
                                  </div>
                                  <div className="flex items-center gap-1">
                                    <Clock className="w-3 h-3 text-slate-500" />
                                    <span>Out: {rec.outTime || '-'}</span>
                                  </div>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </>
                  )}
                </div>
              </section>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}