"use client";
import React, { useState, ChangeEvent, useEffect } from "react";
import * as XLSX from 'xlsx';
import { AttendanceRecord, AttendanceSummaryView, User } from '@/types/ui';
import { LoginView } from '@/components/LoginView';
import { Sidebar } from '@/components/Sidebar';
import { UploadSection } from '@/components/UploadSection';
import { SummarySection } from '@/components/SummarySection';
import { EmployeeMonthView } from '@/components/EmployeeMonthView';
import { EmployeeManagementSection } from '@/components/EmployeeManagementSection';

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
  const [uploadErrors, setUploadErrors] = useState<{ odId: string; reason: string }[]>([]);
  const [saving, setSaving] = useState<boolean>(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [summaries, setSummaries] = useState<AttendanceSummaryView[]>([]);
  const [allUsers, setAllUsers] = useState<User[]>([]); // All users for dropdowns
  const [currentMonthYear, setCurrentMonthYear] = useState<string | null>(null);
  const [uploadTotal, setUploadTotal] = useState<number>(0);
  const [uploadSaved, setUploadSaved] = useState<number>(0);
  const [uploadFailed, setUploadFailed] = useState<number>(0);
  const [activeSection, setActiveSection] = useState<'upload' | 'summary' | 'employee' | 'employees'>('summary');
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string | null>(null);
  const [selectedEmployeeMonth, setSelectedEmployeeMonth] = useState<string>('');
  const [employeeDays, setEmployeeDays] = useState<AttendanceRecord[]>([]);
  const [employeeLoading, setEmployeeLoading] = useState<boolean>(false);
  const [employeeError, setEmployeeError] = useState<string | null>(null);
  const [loadingSummaries, setLoadingSummaries] = useState<boolean>(false);

  // Check for existing auth token on mount
  useEffect(() => {
    const storedToken = localStorage.getItem('attendanceAuthToken');
    if (storedToken) {
      setAuthToken(storedToken);
      setIsAuthenticated(true);
    }
  }, []);

  // Fetch users when authenticated (so dropdowns are populated)
  useEffect(() => {
    if (isAuthenticated) {
      fetchUsers();
    }
  }, [isAuthenticated]);

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
      setUploadErrors([]);
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
    setUploadErrors([]);

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
      const errorsList = result.data?.errors ?? [];

      setUploadSaved(processedCount);
      setUploadFailed(errorCount);
      setUploadErrors(errorsList);

      const baseMessage = `Saved ${processedCount} attendance record${processedCount === 1 ? '' : 's'} to the server.`;

      let errorMessage = '';
      if (errorCount > 0) {
        errorMessage = ` ${errorCount} record${errorCount === 1 ? '' : 's'} failed to save. See details below.`;
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

  const fetchUsers = async () => {
    try {
      const response = await fetch('/api/users');
      const result = await response.json();
      if (result.success && Array.isArray(result.data)) {
        setAllUsers(result.data);
      }
    } catch (err) {
      console.error('Failed to fetch users:', err);
    }
  };

  const fetchSummaries = async (monthYear?: string): Promise<void> => {
    setLoadingSummaries(true);
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
    } finally {
      setLoadingSummaries(false);
    }
  };

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

  // Login UI (when not authenticated)
  if (!isAuthenticated) {
    return (
      <LoginView
        loginStep={loginStep}
        password={password}
        onPasswordChange={setPassword}
        onPasswordSubmit={handlePasswordSubmit}
        otp={otp}
        onOtpChange={(val) => setOtp(val.replace(/\D/g, '').slice(0, 6))}
        onOtpSubmit={handleOTPSubmit}
        onBackToPassword={() => {
          setLoginStep('password');
          setOtp('');
          setSessionId(null);
          setLoginError(null);
        }}
        isLoading={loginLoading}
        error={loginError}
      />
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-50">
      <div className="flex h-screen max-h-screen">
        <Sidebar
          activeSection={activeSection}
          setActiveSection={setActiveSection}
          uploadTotal={uploadTotal}
          uploadSaved={uploadSaved}
          uploadFailed={uploadFailed}
          currentMonthYear={currentMonthYear}
          onLogout={handleLogout}
        />

        {/* Main content */}
        <main className="flex-1 bg-slate-950/80 overflow-y-auto">
          <div className="max-w-6xl mx-auto px-8 py-6 space-y-6">
            {/* Upload Section */}
            {activeSection === 'upload' && (
              <UploadSection
                file={file}
                onFileChange={handleFileChange}
                onProcessFile={processExcelFile}
                processing={processing}
                error={error}
                saveMessage={saveMessage}
                uploadErrors={uploadErrors}
              />
            )}

            {/* Summary Section */}
            {activeSection === 'summary' && (
              <SummarySection
                summaries={summaries}
                uploadTotal={uploadTotal}
                uploadSaved={uploadSaved}
                uploadFailed={uploadFailed}
                isLoading={loadingSummaries}
                onFilterChange={fetchSummaries}
              />
            )}
                

            {/* Employee month-wise Section */}
            {activeSection === 'employee' && (
              <EmployeeMonthView
                summaries={summaries}
                users={allUsers}
                selectedEmployeeId={selectedEmployeeId}
                setSelectedEmployeeId={setSelectedEmployeeId}
                selectedMonthYear={selectedEmployeeMonth}
                onMonthYearChange={setSelectedEmployeeMonth}
                employeeDays={employeeDays}
                isLoading={employeeLoading}
                error={employeeError}
                onLoadAttendance={fetchEmployeeMonthly}
              />
            )}

            {/* Employee Management Section */}
            {activeSection === 'employees' && (
              <EmployeeManagementSection />
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
