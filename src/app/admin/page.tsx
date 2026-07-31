                      
           
"use client";
import React, { useState, ChangeEvent, useEffect, useCallback, useRef } from "react";
import * as XLSX from 'xlsx';
import { X } from 'lucide-react';
import { AttendanceRecord, AttendanceSummaryView, User, DailySchedule } from '@/types/ui';
import {
  buildSummaryPeriodDateList,
  getWorkedHoursMatchingScheduledDays,
} from '@/lib/attendanceSummaryMetrics';
import { LoginView } from '@/components/LoginView';
import { Sidebar } from '@/components/Sidebar';
import { ArticleCreditsManager } from '@/components/ArticleCreditsManager';
import { UploadSection } from '@/components/UploadSection';
import { SummarySection } from '@/components/SummarySection';
import { EmployeeMonthView } from '@/components/EmployeeMonthView';
import {
  attendanceRecordReflectsApprovedRequest,
  buildDisplayRecordFromApprovedRequest,
  shouldOverlayApprovedRequestOnAttendance,
} from '@/lib/attendanceRequestDayDisplay';
import { EmployeeManagementSection } from '@/components/EmployeeManagementSection';
import { EmployeeMasterUploadSection } from '@/components/EmployeeMasterUploadSection';
import { TeamAttendanceAccessSection } from '@/components/TeamAttendanceAccessSection';
import { AttendanceRequestsSection } from '@/components/AttendanceRequestsSection';
import { HolidayManagement } from '@/components/HolidayManagement';
import { BackupManagementSection } from '@/components/BackupManagementSection';
import { LeaveManagementSection } from '@/components/LeaveManagementSection';
import { FineManagementSection } from '@/components/FineManagementSection';
import { InvalidAttendanceSection } from '@/components/InvalidAttendanceSection';
import { EmployeeMisExceptionsSection } from '@/components/EmployeeMisExceptionsSection';
import { DaywiseCompareSection } from '@/components/DaywiseCompareSection';
import { ClientPlaceManagement } from '@/components/ClientPlaceManagement';
import { HrConsoleAccessSection } from '@/components/HrConsoleAccessSection';
import { HrConsoleSettingsSection } from '@/components/HrConsoleSettingsSection';
import { hrCredentialsInit } from '@/lib/hrAuthHeaders';
import { HR_OTP_TTL_MS } from '@/lib/hrOtpConstants';
import {
  getDesignationForDate,
  getWorkingUnderPartnerForDate,
  lastDayOfMonthYear,
} from '@/lib/userFieldHistory';
import {
  HR_CONSOLE_SECTION_IDS,
  type EmployeeManagementTabId,
  type HrAccessLevel,
  type HrConsoleSectionId,
} from '@/lib/hrConsolePermissionUtils';

export default function AttendanceUpload() {
  // Auth state
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [loginStep, setLoginStep] = useState<'password' | 'otp'>('password');
  const [password, setPassword] = useState<string>('');
  const [otp, setOtp] = useState<string>('');
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [otpExpiresAt, setOtpExpiresAt] = useState<number | null>(null);
  const [otpSecondsLeft, setOtpSecondsLeft] = useState<number | null>(null);
  const [loginLoading, setLoginLoading] = useState<boolean>(false);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState<string>('');
  const [userRole, setUserRole] = useState<string>('');
  const [loginEmail, setLoginEmail] = useState<string>('');

  // Attendance state
  const [file, setFile] = useState<File | null>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [fixedFile, setFixedFile] = useState<File | null>(null);
  const [fixedFiles, setFixedFiles] = useState<File[]>([]);
  const [attendanceData, setAttendanceData] = useState<AttendanceRecord[]>([]);
  const [processing, setProcessing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [uploadErrors, setUploadErrors] = useState<{ odId: string; reason: string }[]>([]);
  const [saving, setSaving] = useState<boolean>(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [summaries, setSummaries] = useState<AttendanceSummaryView[]>([]);
  const [allUsers, setAllUsers] = useState<User[]>([]); // All users for dropdowns
  const fieldHistoriesSeededRef = useRef(false);
  const [currentMonthYear, setCurrentMonthYear] = useState<string | null>(null);
  const [uploadTotal, setUploadTotal] = useState<number>(0);
  const [uploadSaved, setUploadSaved] = useState<number>(0);
  const [uploadFailed, setUploadFailed] = useState<number>(0);
  const [uploadPendingQueued, setUploadPendingQueued] = useState<number>(0);
  const [activeSection, setActiveSection] = useState<HrConsoleSectionId>('summary');
  const [hrPermState, setHrPermState] = useState<{
    sections: Record<HrConsoleSectionId, HrAccessLevel>;
    employeeTabs: Record<EmployeeManagementTabId, HrAccessLevel>;
  } | null>(null);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string | null>(null);
  const [selectedEmployeeMonth, setSelectedEmployeeMonth] = useState<string>(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });
  // Modal state for EmployeeMonthView
  const [employeeMonthModal, setEmployeeMonthModal] = useState<{ open: boolean; userId: string | null; monthYear: string }>({ open: false, userId: null, monthYear: '' });
  // Modal state for EmployeeManagementSection
  const [employeeManagementModal, setEmployeeManagementModal] = useState<{ open: boolean; userId: string | null }>({ open: false, userId: null });
  const [employeeDays, setEmployeeDays] = useState<AttendanceRecord[]>([]);
  const [employeeApprovedRequests, setEmployeeApprovedRequests] = useState<any[]>([]);
  const [employeeLoading, setEmployeeLoading] = useState<boolean>(false);
  const [employeeError, setEmployeeError] = useState<string | null>(null);
  const [loadingSummaries, setLoadingSummaries] = useState<boolean>(false);
  const [machineFormat, setMachineFormat] = useState<string>('machine2');
  
  // New State for "Affected" Modal
  const [showAffectedModal, setShowAffectedModal] = useState<boolean>(false);

  // Holidays state for SummarySection
  const [holidays, setHolidays] = useState<{date: string; name: string}[]>([]);

  // Restore HR session from HttpOnly cookie (same-origin).
  useEffect(() => {
    void (async () => {
      localStorage.removeItem('attendanceAuthToken');
      try {
        const res = await fetch('/api/auth/hr-session', { credentials: 'include' });
        if (!res.ok) return;
        const j = await res.json();
        if (!j.success || !j.data?.email) return;
        setIsAuthenticated(true);
        setUserEmail(String(j.data.email));
        const role = String(j.data.role || 'admin');
        setUserRole(role);
        localStorage.setItem('attendanceUserEmail', String(j.data.email));
        localStorage.setItem('attendanceUserRole', role);
        if (role === 'restricted_admin') {
          setActiveSection('upload');
        }
      } catch {
        // ignore
      }
    })();
  }, []);

  // Fetch holidays from database
  const fetchHolidays = useCallback(async () => {
    try {
      const res = await fetch('/api/holidays?activeOnly=true');
      const result = await res.json();
      if (result.success && result.data) {
        setHolidays(result.data.map((h: any) => ({ date: h.date, name: h.name })));
      }
    } catch (err) {
      console.error('Error fetching holidays:', err);
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
        body: JSON.stringify({ password, email: loginEmail }),
      });

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Login failed');
      }

      setSessionId(result.data.sessionId);
      const expiresMs = result.data.expiresAt
        ? new Date(result.data.expiresAt).getTime()
        : Date.now() + HR_OTP_TTL_MS;
      setOtpExpiresAt(expiresMs);
      setLoginStep('otp');
      setPassword('');
    } catch (err) {
      setLoginError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setLoginLoading(false);
    }
  };

  const processMultipleFiles = async (filesToProcess: File[]) => {
    if (!filesToProcess || filesToProcess.length === 0) return;

    setProcessing(true);
    setError(null);
    setSaveMessage(null);

    for (const f of filesToProcess) {
      try {
        // keep UI file in sync for any UI feedback
        setFile(f);
        if (machineFormat === 'machine1') {
          await processMachine1File(f);
        } else {
          await processMachine2File(f);
        }
      } catch (err) {
        console.error('Error processing file', f.name, err);
      }
      // small pause to allow UI updates
      await new Promise((r) => setTimeout(r, 100));
    }

    setProcessing(false);
  };

  const processMultipleFixedFiles = async (filesToProcess: File[]) => {
    if (!filesToProcess || filesToProcess.length === 0) return;

    setProcessing(true);
    setError(null);
    setSaveMessage(null);

    for (const f of filesToProcess) {
      try {
        setFixedFile(f);
        await processFixedDataFile(f);
      } catch (err) {
        console.error('Error processing fixed file', f.name, err);
      }
      await new Promise((r) => setTimeout(r, 100));
    }

    setProcessing(false);
  };

  useEffect(() => {
    if (loginStep !== 'otp' || otpExpiresAt == null) {
      setOtpSecondsLeft(null);
      return;
    }
    const tick = () => {
      setOtpSecondsLeft(Math.max(0, Math.ceil((otpExpiresAt - Date.now()) / 1000)));
    };
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [loginStep, otpExpiresAt]);

  // Handle OTP verification
  const handleOTPSubmit = async () => {
    if (!otp || !sessionId) {
      setLoginError('Please enter OTP');
      return;
    }
    if (otpExpiresAt != null && otpExpiresAt <= Date.now()) {
      setLoginError('OTP has expired. Go back and sign in again to receive a new code.');
      return;
    }

    setLoginLoading(true);
    setLoginError(null);

    try {
      const response = await fetch('/api/auth/verify-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ sessionId, otp }),
      });

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Verification failed');
      }

      const email = result.data.email || loginEmail;
      const role = result.data.role || 'admin';
      setIsAuthenticated(true);
      setUserEmail(email);
      setUserRole(role);
      localStorage.setItem('attendanceUserEmail', email);
      localStorage.setItem('attendanceUserRole', role);
      
      if (role === 'restricted_admin') {
        setActiveSection('upload');
      }

      setOtp('');
      setLoginEmail('');
      setSessionId(null);
      setOtpExpiresAt(null);
    } catch (err) {
      setLoginError(err instanceof Error ? err.message : 'Verification failed');
    } finally {
      setLoginLoading(false);
    }
  };

  // Handle logout
  const handleLogout = useCallback(async () => {
    try {
      await fetch('/api/auth/hr-logout', { method: 'POST', credentials: 'include' });
    } catch {
      // ignore network errors; still clear client state
    }
    setIsAuthenticated(false);
    setUserEmail('');
    setUserRole('');
    setHrPermState(null);
    localStorage.removeItem('attendanceAuthToken');
    localStorage.removeItem('attendanceUserEmail');
    localStorage.removeItem('attendanceUserRole');
    setLoginStep('password');
    setPassword('');
    setLoginEmail('');
    setOtp('');
    setSessionId(null);
    setOtpExpiresAt(null);
    setLoginError(null);
  }, []);

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const list = e.target.files ? Array.from(e.target.files) : [];
    const selectedFile = list[0];
    if (list.length > 0) {
      setFiles(list);
      setFile(selectedFile ?? null);
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

  const handleFilesChange = (list: File[]) => {
    const selectedFile = list[0] ?? null;
    if (list.length > 0) {
      setFiles(list);
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
    } else {
      setFiles([]);
      setFile(null);
    }
  };

  const handleFixedFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const list = e.target.files ? Array.from(e.target.files) : [];
    const selected = list[0] ?? null;
    setFixedFiles(list);
    setFixedFile(selected);
    if (selected) {
      setError(null);
      setSaveMessage(null);
      setUploadErrors([]);
      setUploadTotal(0);
      setUploadSaved(0);
      setUploadFailed(0);
      setActiveSection('upload');
    }
  };

  const handleFixedFilesChange = (list: File[]) => {
    const selected = list[0] ?? null;
    setFixedFiles(list);
    setFixedFile(selected);
    if (list.length > 0) {
      setError(null);
      setSaveMessage(null);
      setUploadErrors([]);
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

  const parseMachine1DateTime = (dateTimeStr: any): { date: string; time: string } => {
    if (!dateTimeStr && dateTimeStr !== 0) return { date: '', time: '00:00:00' };
    
    // Handle Date objects that XLSX might return
    if (dateTimeStr instanceof Date) {
      const day = String(dateTimeStr.getDate()).padStart(2, '0');
      const month = String(dateTimeStr.getMonth() + 1).padStart(2, '0');
      const year = dateTimeStr.getFullYear();
      const hours = String(dateTimeStr.getHours()).padStart(2, '0');
      const minutes = String(dateTimeStr.getMinutes()).padStart(2, '0');
      const seconds = String(dateTimeStr.getSeconds()).padStart(2, '0');
      
      return {
        date: `${day}-${month}-${year}`,
        time: `${hours}:${minutes}:${seconds}`
      };
    }
    
    if (typeof dateTimeStr === 'string') {
      // Handle format like "01-12-2025  10:56:00"
      const match = dateTimeStr.match(/^(\d{2}-\d{2}-\d{4})\s+(\d{2}:\d{2}(?::\d{2})?)$/);
      if (match) {
        return {
          date: match[1],
          time: match[2].length === 5 ? `${match[2]}:00` : match[2]
        };
      }
      
      // If it's just a time string
      if (dateTimeStr.match(/^\d{2}:\d{2}(?::\d{2})?$/)) {
        return {
          date: '',
          time: dateTimeStr.length === 5 ? `${dateTimeStr}:00` : dateTimeStr
        };
      }
      
      // If it's a date string like "01-12-2025"
      if (dateTimeStr.match(/^\d{2}-\d{2}-\d{4}$/)) {
        return {
          date: dateTimeStr,
          time: '00:00:00'
        };
      }
    }
    
    // Handle Excel date-time numbers (both date and time combined)
    if (typeof dateTimeStr === 'number' && dateTimeStr > 0) {
      // Excel stores dates as days since 1900-01-01
      // Use XLSX's built-in parser for accuracy
      try {
        const dateObj = XLSX.SSF.parse_date_code(dateTimeStr);
        const day = String(dateObj.d).padStart(2, '0');
        const month = String(dateObj.m).padStart(2, '0');
        const year = dateObj.y;
        const hours = String(dateObj.H || 0).padStart(2, '0');
        const minutes = String(dateObj.M || 0).padStart(2, '0');
        const seconds = String(dateObj.S || 0).padStart(2, '0');
        
        return {
          date: `${day}-${month}-${year}`,
          time: `${hours}:${minutes}:${seconds}`
        };
      } catch (e) {
        // Fallback to basic time parsing if date parsing fails
        const totalSeconds = Math.round(dateTimeStr * 24 * 60 * 60);
        const hours = Math.floor(totalSeconds / 3600);
        const minutes = Math.floor((totalSeconds % 3600) / 60);
        const seconds = totalSeconds % 60;
        return {
          date: '',
          time: `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
        };
      }
    }
    
    return { date: '', time: '00:00:00' };
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

  const normalizeHeader = (value: any): string => String(value || '').toLowerCase().replace(/\s+/g, ' ').trim();

  const parseNumericValue = (raw: any): number | undefined => {
    if (raw === null || raw === undefined || raw === '') return undefined;
    const parsed = Number(String(raw).replace(/,/g, '').trim());
    if (Number.isNaN(parsed)) return undefined;
    return parsed;
  };

  const mapFixedPresenceCodeToType = (codeRaw: string, dateStr?: string): string => {
    const code = codeRaw.trim().toUpperCase();
    
    // Check if it's a holiday or Sunday if date is provided
    let isWeekoff = false;
    if (dateStr) {
      // Check Sunday
      const [d, m, y] = dateStr.split('-');
      const dateObj = new Date(Number(y), Number(m) - 1, Number(d));
      if (dateObj.getDay() === 0) {
        isWeekoff = true;
      } else {
        // Check Holiday
        if (holidays.some(h => h.date === dateStr)) {
          isWeekoff = true;
        }
      }
    }

    switch (code) {
      case 'PRESENT':
        return isWeekoff ? 'Present - in office - weekoff' : 'Present - in office - weekdays';
      case 'WO-PRESENT':
        return 'Present - in office - weekoff';
      case 'HD':
        return isWeekoff ? 'Half Day - weekoff' : 'Half Day - weekdays';
      case 'OS-P':
        return isWeekoff ? 'Present - ClientPlace (Weekoff)' : 'Present - ClientPlace (Weekdays)';
      case 'WO-HD':
        return 'Half Day - weekoff';
      case 'WFH':
        return isWeekoff ? 'WFH - weekoff' : 'WFH - weekdays';
      case 'WO-WFH':
        return 'WFH - weekoff';
      case 'SUN':
        return 'Sunday';
      case 'A':
        return 'Absent';
      case 'WEEKOFF':
        return 'Weekoff';
      case 'OHD-P':
        return 'Present - in office - weekoff';
      case 'OHD':
        return 'Holiday';
      default:
        return codeRaw;
    }
  };

  const processFixedDataFile = async (inputFile?: File): Promise<void> => {
    const f = inputFile ?? fixedFile;
    if (!f) {
      setError('Please select a fixed data file first');
      return;
    }

    setProcessing(true);
    setError(null);
    setSaveMessage(null);

    try {
      const data = await f.arrayBuffer();
      const workbook = XLSX.read(data, { cellDates: false, cellNF: false, cellText: false });
      const worksheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows: any[][] = XLSX.utils.sheet_to_json(worksheet, { header: 1, raw: true, defval: '' });

      const headerRowIndex = rows.findIndex((row) => {
        const normalized = row.map(normalizeHeader);
        const hasDate = normalized.some((h) => h === 'date');
        const hasEmployee = normalized.some((h) => h === 'employee name');
        const hasStatus = normalized.some((h) => h === 'present / absent' || h === 'present/absent');
        const hasIn = normalized.some((h) => h.startsWith('actual intime'));
        const hasOut = normalized.some((h) => h.startsWith('actual outtime'));
        return hasDate && hasEmployee && hasStatus && hasIn && hasOut;
      });

      if (headerRowIndex === -1) {
        throw new Error('Could not find fixed data headers. Required: Date, Employee Name, Present / Absent, Actual InTime, Actual OutTime');
      }

      const headers = rows[headerRowIndex].map(normalizeHeader);
      const dateIndex = headers.findIndex((h: string) => h === 'date');
      const employeeNameIndex = headers.findIndex((h: string) => h === 'employee name');
      const presenceIndex = headers.findIndex((h: string) => h === 'present / absent' || h === 'present/absent');
      const inTimeIndex = headers.findIndex((h: string) => h.startsWith('actual intime'));
      const outTimeIndex = headers.findIndex((h: string) => h.startsWith('actual outtime'));
      const actualWFHIndex = headers.findIndex((h: string) => h === 'actual - wfh' || h === 'actual-wfh');
      const actualOutStationIndex = headers.findIndex((h: string) => h === 'actual - out station' || h === 'actual-out station' || h === 'actual - outstation' || h === 'actual-outstation');

      if ([dateIndex, employeeNameIndex, presenceIndex, inTimeIndex, outTimeIndex].some((idx) => idx === -1)) {
        throw new Error('One or more required headers are missing in fixed data file.');
      }

      const processed: AttendanceRecord[] = [];
      const dataRows = rows.slice(headerRowIndex + 1);

      for (const row of dataRows) {
        const employeeName = String(row[employeeNameIndex] || '').trim();
        const rawDate = row[dateIndex];
        const presenceCode = String(row[presenceIndex] || '').trim();

        if (!employeeName || !rawDate || !presenceCode) continue;

        const parsedDate = formatExcelDate(rawDate);
        if (!parsedDate) continue;

        const inParsed = parseMachine1DateTime(row[inTimeIndex]);
        const outParsed = parseMachine1DateTime(row[outTimeIndex]);
        const inTime = inParsed.time || '00:00:00';
        const outTime = outParsed.time || '00:00:00';

        const mappedType = mapFixedPresenceCodeToType(presenceCode, parsedDate);
        const normalizedCode = presenceCode.toUpperCase();
        const status = (normalizedCode === 'A' || normalizedCode === 'ABSENT') ? 'Absent' : 'Present';
        const actualWFHValue = actualWFHIndex >= 0 ? parseNumericValue(row[actualWFHIndex]) : undefined;
        const actualOutStationValue = actualOutStationIndex >= 0 ? parseNumericValue(row[actualOutStationIndex]) : undefined;

        let fixedValue: number | undefined;
        if (normalizedCode === 'WFH' || normalizedCode === 'WO-WFH') {
          fixedValue = actualWFHValue;
        } else if (normalizedCode === 'OS-P') {
          fixedValue = actualOutStationValue;
        }

        processed.push({
          id: employeeName,
          name: employeeName,
          date: parsedDate,
          inTime,
          outTime,
          status,
          typeOfPresence: mappedType,
          fixedData: true,
          presentAbsent: presenceCode,
          value: fixedValue,
          schedule: undefined,
        });
      }

      if (processed.length === 0) {
        throw new Error('No valid fixed attendance rows were found in the uploaded file.');
      }

      setAttendanceData(processed);
      const inferredMonthYear = processed[0] ? getMonthYearFromDate(processed[0].date) : null;
      setCurrentMonthYear(inferredMonthYear);
      setUploadTotal(processed.length);
      setUploadSaved(0);
      setUploadFailed(0);
      await uploadToServer(processed, inferredMonthYear || undefined);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error occurred';
      setError(`Error processing fixed data file: ${errorMessage}`);
    } finally {
      setProcessing(false);
    }
  };

  const processMachine2File = async (inputFile?: File): Promise<void> => {
    const f = inputFile ?? file;
    if (!f) {
      setError('Please select a file first');
      return;
    }

    setProcessing(true);
    setError(null);
    setSaveMessage(null);

    try {
      const data = await f.arrayBuffer();
      const workbook = XLSX.read(data, { cellDates: false, cellNF: false, cellText: false });
      const worksheet = workbook.Sheets[workbook.SheetNames[0]];
      const jsonData: any[][] = XLSX.utils.sheet_to_json(worksheet, { header: 1, raw: true, defval: '' });

      /**
       * Machine 2 Complex Format:
       * Row 1: "Date wise Daily Attendance Report (Detailed)"
       * Row 2: "For Period : 30/12/2025 To 30/01/2026"
       * Row 3: "Company Name : Demo Company"
       * Then repeating pattern for each date:
       *   - Column A: "Date :", Column B: date value (e.g., "30-12-2025")
       *   - NEXT ROW: Header row with "Emp Name", "In Time", "Out Time"
       *   - Following rows: Attendance data until next "Date :" marker
       * Time format is: "01-01-1900 10:00:00" (date-time combined, extract time only)
       */
      
      const processed: AttendanceRecord[] = [];
      let currentDate: string | null = null;
      let headerIndices: { empName: number; inTime: number; outTime: number } | null = null;
      let expectHeaderRow = false;

      // Helper to parse date from "Date :" row - date is in second column (index 1)
      const parseDateFromRow = (row: any[]): string | null => {
        const dateValue = row[1];
        if (!dateValue) return null;
        
        const dateStr = String(dateValue).trim();
        
        // Handle format like "30-12-2025" or "30/12/2025"
        const match = dateStr.match(/^(\d{1,2})[-\/](\d{1,2})[-\/](\d{4})$/);
        if (match) {
          const day = match[1].padStart(2, '0');
          const month = match[2].padStart(2, '0');
          const year = match[3];
          return `${day}-${month}-${year}`;
        }
        
        // Handle Excel date number
        if (typeof dateValue === 'number') {
          return formatExcelDate(dateValue);
        }
        
        return null;
      };

      // Helper to check if row is a "Date :" marker row (Date: in column A)
      const isDateMarkerRow = (row: any[]): boolean => {
        const firstCell = String(row[0] || '').trim().toLowerCase();
        return firstCell === 'date :' || firstCell === 'date:' || firstCell === 'date';
      };

      // Helper to find column indices from header row
      const findHeaderIndices = (row: any[]): { empName: number; inTime: number; outTime: number } | null => {
        const lowerRow = row.map(cell => String(cell || '').trim().toLowerCase());
        
        let empNameIdx = lowerRow.findIndex(h => 
          h === 'emp name' || h === 'employee name' || h === 'name' || h === 'emp. name'
        );
        let inTimeIdx = lowerRow.findIndex(h => 
          h === 'in time' || h === 'intime' || h === 'in' || h === 'check in' || h === 'checkin'
        );
        let outTimeIdx = lowerRow.findIndex(h => 
          h === 'out time' || h === 'outtime' || h === 'out' || h === 'check out' || h === 'checkout'
        );
        
        if (empNameIdx === -1 || inTimeIdx === -1 || outTimeIdx === -1) {
          return null;
        }
        
        return { empName: empNameIdx, inTime: inTimeIdx, outTime: outTimeIdx };
      };

      // Process rows
      for (let i = 0; i < jsonData.length; i++) {
        const row = jsonData[i];
        
        // Skip empty rows
        if (!row || row.every(cell => !cell || String(cell).trim() === '')) {
          continue;
        }

        // Check if this is a "Date :" marker row
        if (isDateMarkerRow(row)) {
          currentDate = parseDateFromRow(row);
          headerIndices = null; // Reset header indices
          expectHeaderRow = true; // Next non-empty row should be the header
          continue;
        }

        // If we expect a header row (immediately after Date: row)
        if (expectHeaderRow && currentDate) {
          headerIndices = findHeaderIndices(row);
          expectHeaderRow = false;
          if (!headerIndices) {
            console.warn(`Could not find header columns in row ${i + 1} for date ${currentDate}`);
          }
          continue;
        }

        // If we have both currentDate and headerIndices, this is a data row
        if (currentDate && headerIndices) {
          const empName = String(row[headerIndices.empName] || '').trim();
          const inTimeRaw = row[headerIndices.inTime];
          const outTimeRaw = row[headerIndices.outTime];
          
          // Skip rows without employee name (might be subtotals or empty rows)
          if (!empName || empName.toLowerCase().includes('total') || empName.toLowerCase().includes('grand')) {
            continue;
          }

          // Parse time using parseMachine1DateTime since format is "01-01-1900 10:00:00"
          // This extracts just the time portion from the date-time string
          const inTimeParsed = parseMachine1DateTime(inTimeRaw);
          const outTimeParsed = parseMachine1DateTime(outTimeRaw);
          
          const inTime = inTimeParsed.time;
          const outTime = outTimeParsed.time;
          
          const isAbsent = inTime === '00:00:00' && outTime === '00:00:00';

          processed.push({
            id: empName, // Using employee name as ID since format doesn't have ID column
            name: empName,
            date: currentDate,
            inTime,
            outTime,
            status: isAbsent ? 'Absent' : 'Present',
            schedule: undefined
          });
        }
      }

      if (processed.length === 0) {
        throw new Error('No attendance records found. Please ensure the file follows the expected format with "Date :" in column A, date in column B, followed by header row and attendance data.');
      }

      setAttendanceData(processed);

      const inferredMonthYear = processed[0] ? getMonthYearFromDate(processed[0].date) : null;
      setCurrentMonthYear(inferredMonthYear);

      // Automatically upload to API after successful processing
      if (processed.length > 0) {
        setUploadTotal(processed.length);
        setUploadSaved(0);
        setUploadFailed(0);
        setUploadPendingQueued(0);
        await uploadToServer(processed, inferredMonthYear || undefined);
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error occurred';
      setError(`Error processing file: ${errorMessage}`);
    } finally {
      setProcessing(false);
    }
  };

  const processMachine1File = async (inputFile?: File): Promise<void> => {
    const f = inputFile ?? file;
    if (!f) {
      setError('Please select a file first');
      return;
    }

    setProcessing(true);
    setError(null);
    setSaveMessage(null);

    try {
      const data = await f.arrayBuffer();//takes the data turn into into raw binary format as XLSX OR shetjs accept binary format
      const workbook = XLSX.read(data, { cellDates: false, cellNF: false, cellText: false });//cellDates: false to prevent automatic conversion of date cells into JS Date objects,cellNF: false to avoid applying number formatting, cellText: false to get raw cell values without text formatting
      const worksheet = workbook.Sheets[workbook.SheetNames[0]];//selects the first sheet in the workbook
      const jsonData: any[][] = XLSX.utils.sheet_to_json(worksheet, { header: 1, raw: true, defval: '' });//converts the worksheet into a 2D array (array of arrays) where each inner array represents a row in the sheet. header: 1 indicates that the first row should be treated as data, raw: true ensures raw cell values are returned, defval: '' fills empty cells with an empty string instead of undefined


      // Find header row (contains 'User ID', 'Full Name', etc.)
      const headerRowIndex = jsonData.findIndex(row => 
        row.some(cell => cell === 'User ID' || cell === 'Full Name')
      );//searches the excel for the header row index value as it is saved like this [['User ID', 'Full Name', 'Date', 'Out', 'In'],[...],[...]]


      if (headerRowIndex === -1) {
        throw new Error('Could not find header row in Excel file. Expected columns: User ID, Full Name, Date, Out, In');
      }

      const headers: any[] = jsonData[headerRowIndex];//extracts the header row based on the found index
      const dataRows = jsonData.slice(headerRowIndex + 1);//select the data after the header row

      // Find column indices
      const empCodeIndex = headers.findIndex(h => h === 'User ID'); //finds the index of User ID example in this {'User ID', 'Full Name', 'Date', 'Out', 'In'} we get 0
      const empNameIndex = headers.findIndex(h => h === 'Full Name');//finds the index of Full Name example in this {'User ID', 'Full Name', 'Date', 'Out', 'In'} we get 1
      const dateIndex = headers.findIndex(h => h === 'Date');//we get 2
      const outTimeIndex = headers.findIndex(h => h === 'Out');//we get 3
      const inTimeIndex = headers.findIndex(h => h === 'In');//we get 4

      if (empCodeIndex === -1 || empNameIndex === -1 || inTimeIndex === -1 || outTimeIndex === -1 || dateIndex === -1) {
        throw new Error('Missing required columns. Expected: User ID, Full Name, Date, Out, In');
      }

      const processed: AttendanceRecord[] = [];//created a array of type AttendanceRecord

      for (const row of dataRows) {//iterates over each row of data and extracts relevant fields based on previously determined column indices
        const empCode = row[empCodeIndex];
        const empName = row[empNameIndex];
        const inTimeRaw = row[inTimeIndex];
        const outTimeRaw = row[outTimeIndex];
        const dateRaw = row[dateIndex];

        // Skip rows that don't have essential data
        if (!empCode || !empName || (!inTimeRaw && !outTimeRaw && !dateRaw)) {
          continue;
        }

        // Parse In Time - may contain date-time string
        const inTimeParsed = parseMachine1DateTime(inTimeRaw);
        const inTime = inTimeParsed.time;
        
        // Parse Out Time - may contain date-time string
        const outTimeParsed = parseMachine1DateTime(outTimeRaw);
        const outTime = outTimeParsed.time;
        
        // Use date from Date column, or extract from In Time if available
        let date = formatExcelDate(dateRaw);
        if (!date && inTimeParsed.date) {
          date = inTimeParsed.date;
        }
        if (!date && outTimeParsed.date) {
          date = outTimeParsed.date;
        }

        const isAbsent = inTime === '00:00:00' && outTime === '00:00:00';

        processed.push({
          id: empCode,
          name: String(empName),
          date,
          inTime,
          outTime,
          status: isAbsent ? 'Absent' : 'Present',
          schedule: undefined
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
        setUploadPendingQueued(0);
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
    setUploadErrors([]);//check if the attendance is empty also help user know data saving  and set the error to null
    setUploadPendingQueued(0);

    if (data && data.length > 0) {
      setUploadTotal(data.length);
    }
    
    // Chunking Logic
    const CHUNK_SIZE = 50;
    let localSaved = 0;
    let localFailed = 0;
    let localPendingQueued = 0;
    const localErrors: { odId: string; reason: string }[] = [];

    try {
      for (let i = 0; i < data.length; i += CHUNK_SIZE) {
         const chunk = data.slice(i, i + CHUNK_SIZE);
         
         const response = await fetch('/api/attendance', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ records: chunk }),
         });

         const result = await response.json();

         if (!response.ok || !result.success) {
            throw new Error(result.error || 'Failed to save attendance chunk');
         }

         const processedCount = result.data?.processed?.length ?? 0;
         const errorCount = result.data?.errors?.length ?? 0;
         const errorsList = result.data?.errors ?? [];
         const pendingCount = Array.isArray(result.data?.pendingQueued)
           ? result.data.pendingQueued.length
           : 0;

         localSaved += processedCount;
         localFailed += errorCount;
         localPendingQueued += pendingCount;
         localErrors.push(...errorsList);

         // Update state progressively
         setUploadSaved(localSaved);
         setUploadFailed(localFailed);
         setUploadPendingQueued(localPendingQueued);
         setUploadErrors(prev => [...prev, ...errorsList]);
      }

      if (localErrors.length > 0) {
        const groupedErrors = localErrors.reduce((acc, curr) => {
          const existing = acc.find(e => e.message === curr.reason);
          if (existing) {
            existing.count++;
            if (existing.sampleRows.length < 5 && !existing.sampleRows.includes(curr.odId)) {
              existing.sampleRows.push(curr.odId);
            }
          } else {
            acc.push({
              message: curr.reason,
              count: 1,
              sampleRows: [curr.odId]
            });
          }
          return acc;
        }, [] as { message: string, count: number, sampleRows: string[] }[]);

        try {
          await fetch('/api/upload-logs', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              fileName: file?.name || fixedFile?.name || 'Unknown File',
              errorDetails: groupedErrors,
              logType: 'attendance',
            })
          });
        } catch (err) {
          console.error('Failed to save upload log', err);
        }
      }

      const baseMessage = `Saved ${localSaved} attendance record${localSaved === 1 ? '' : 's'} to the server.`;

      let pendingMessage = '';
      if (localPendingQueued > 0) {
        pendingMessage = ` ${localPendingQueued} row${localPendingQueued === 1 ? '' : 's'} queued for unknown employees (pending); they apply after matching staff are added.`;
      }

      let errorMessage = '';
      if (localFailed > 0) {
        errorMessage = ` ${localFailed} record${localFailed === 1 ? '' : 's'} failed to save. See details below.`;
      }
      
      setSaveMessage(baseMessage + pendingMessage + errorMessage);

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

  const fetchUsers = useCallback(async () => {
    try {
      const response = await fetch('/api/users?listOnly=1', hrCredentialsInit());
      const result = await response.json();
      if (result.success && Array.isArray(result.data)) {
        setAllUsers(result.data);
        if (!fieldHistoriesSeededRef.current) {
          fieldHistoriesSeededRef.current = true;
          void fetch('/api/users/seed-field-histories', {
            method: 'POST',
            ...hrCredentialsInit(),
          })
            .then(() => fetch('/api/users?listOnly=1', hrCredentialsInit()))
            .then((r) => r.json())
            .then((seedRefresh) => {
              if (seedRefresh.success && Array.isArray(seedRefresh.data)) {
                setAllUsers(seedRefresh.data);
              }
            })
            .catch(() => {});
        }
      }
    } catch (err) {
      console.error('Failed to fetch users:', err);
    }
  }, []);

  useEffect(() => {
    if (!isAuthenticated) {
      setHrPermState(null);
      return;
    }
    void fetchHolidays();
    void (async () => {
      try {
        const res = await fetch('/api/hr-console-permissions?me=1', hrCredentialsInit());
        const j = await res.json();
        if (res.status === 401) {
          handleLogout();
          return;
        }
        if (!res.ok || !j.success || !j.data) {
          setHrPermState(null);
          return;
        }
        setHrPermState({
          sections: j.data.sections,
          employeeTabs: j.data.employeeTabs,
        });
        if (j.data.sections.employees !== 'none') {
          await fetchUsers();
        } else {
          setAllUsers([]);
        }
      } catch {
        setHrPermState(null);
      }
    })();
  }, [isAuthenticated, fetchHolidays, handleLogout, fetchUsers]);

  useEffect(() => {
    if (!hrPermState) return;
    if (hrPermState.sections[activeSection] !== 'none') return;
    const next = HR_CONSOLE_SECTION_IDS.find((id) => hrPermState.sections[id] !== 'none');
    if (next) setActiveSection(next);
  }, [hrPermState, activeSection]);

  const calculateScheduledHoursForDate = (date: Date, schedules: any): number => {
    if (!schedules) return 0;

    const timeToHours = (t?: string) => {
      if (!t) return 0;
      const [h, m] = t.split(':').map(Number);
      return h + (m / 60);
    };

    const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    const dayName = dayNames[date.getDay()];

    const daySchedule = schedules?.daily?.[dayName];

    if (!daySchedule || daySchedule.isHoliday) {
      return 0;
    }

    const inTime = daySchedule.inTime;
    const outTime = daySchedule.outTime;

    const start = timeToHours(inTime);
    const end = timeToHours(outTime);
    return (start && end && end > start) ? (end - start) : 9; // Default 9 hours
  };

  const fetchSummaries = useCallback(async (filter: string | {start: string, end: string} | {startDate: string, endDate: string}): Promise<void> => {
    setLoadingSummaries(true);
    try {
      let monthYears: string[] = [];
      let startDate: Date | null = null;
      let endDate: Date | null = null;
      if (typeof filter === 'string') {
        monthYears = [filter];
      } else if ('startDate' in filter) {
        // Date range
        startDate = new Date(filter.startDate);
        endDate = new Date(filter.endDate);
        // Generate monthYears from startDate to endDate
        const months = [];
        let current = new Date(startDate.getFullYear(), startDate.getMonth(), 1);
        const endMonth = new Date(endDate.getFullYear(), endDate.getMonth(), 1);
        while (current <= endMonth) {
          const yyyy = current.getFullYear();
          const mm = String(current.getMonth() + 1).padStart(2, '0');
          months.push(`${yyyy}-${mm}`);
          current.setMonth(current.getMonth() + 1);
        }
        monthYears = months;
      } else {
        // Month range
        const start = new Date(filter.start + '-01');
        const end = new Date(filter.end + '-01');
        const months = [];
        let current = new Date(start);
        while (current <= end) {
          const yyyy = current.getFullYear();
          const mm = String(current.getMonth() + 1).padStart(2, '0');
          months.push(`${yyyy}-${mm}`);
          current.setMonth(current.getMonth() + 1);
        }
        monthYears = months;
      }

      // Fetch all users with schedules for schedule lookup
      const usersResponse = await fetch('/api/users?listOnly=1', hrCredentialsInit());
      const usersResult = await usersResponse.json();
      const allUsersWithSchedules = usersResult.success ? usersResult.data : [];
      const userScheduleMap = new Map<string, any>();
      allUsersWithSchedules.forEach((user: any) => {
        userScheduleMap.set(String(user._id), user);
      });

      // Fetch all months in parallel (faster than sequential when spanning multiple months)
      const monthChunks = await Promise.all(
        monthYears.map(async (my) => {
          const url = `/api/attendance?monthYear=${encodeURIComponent(my)}`;
          const response = await fetch(url);
          const result = await response.json();
          if (!response.ok || !result.success) {
            throw new Error(result.error || 'Failed to fetch attendance summaries');
          }
          return Array.isArray(result.data) ? result.data : [];
        })
      );
      const allItems: any[] = monthChunks.flat();

      // Aggregate by userId
      const userMap = new Map<string, any>();
      for (const item of allItems) {
        const userId = item.userId?._id ? String(item.userId._id) : '';
        if (!userMap.has(userId)) {
          userMap.set(userId, {
            ...item,
            recordDetails: {}
          });
        }
        const existing = userMap.get(userId);
        // Merge recordDetails
        Object.assign(existing.recordDetails, item.records || {});
      }

      // Recalculate summary from merged records for all filter types.
      // This avoids double counting in month mode and keeps month/range behavior consistent.
      const periodDateList = buildSummaryPeriodDateList(filter, startDate, endDate);

      for (const user of userMap.values()) {
        const filteredRecords: any = {};
        for (const [date, rec] of Object.entries(user.recordDetails)) {
          if (startDate && endDate) {
            const d = new Date(date);
            if (d >= startDate && d <= endDate) {
              filteredRecords[date] = rec;
            }
          } else {
            filteredRecords[date] = rec;
          }
        }

        const summary = {
          totalHour: 0,
          totalLateArrival: 0,
          excessHour: 0,
          totalHalfDay: 0,
          totalPresent: 0,
          totalAbsent: 0,
          totalLeave: 0,
        };

        for (const rec of Object.values(filteredRecords) as any[]) {
          const type = String(rec?.typeOfPresence || '');
          const checkin = String(rec?.editedCheckin || rec?.checkin || '').trim();
          const checkout = String(rec?.editedCheckout || rec?.checkout || '').trim();
          const totalHour = Number(rec?.totalHour || 0);
          const isHolidayLike =
            type === 'Holiday' ||
            type === 'Sunday' ||
            type === 'Weekoff' ||
            type === 'Weekoff - special allowance';

          if (type === 'Leave' || type === 'On leave') {
            summary.totalLeave += 1;
            // Informational policy: paid leave is still an absence from work.
            summary.totalAbsent += 1;
            continue;
          }

          if (type === 'Absent') {
            summary.totalAbsent += 1;
            continue;
          }

          if (isHolidayLike) {
            continue;
          }

          const hasValidIn = checkin && checkin !== '00:00';
          const hasValidOut = checkout && checkout !== '00:00';

          if (rec?.halfDay) {
            summary.totalHalfDay += 1;
            summary.totalPresent += 1;
          } else if (hasValidIn || hasValidOut || totalHour > 0) {
            summary.totalPresent += 1;
          } else {
            summary.totalAbsent += 1;
          }
        }

        const userId = String(user.userId?._id ?? '');
        const uiUser = userScheduleMap.get(userId);
        if (uiUser && periodDateList.length > 0) {
          const itemForWorked: AttendanceSummaryView = {
            id: String(user._id ?? ''),
            userId,
            userName: String(user.userId?.name ?? ''),
            monthYear:
              typeof filter === 'string'
                ? filter
                : monthYears[monthYears.length - 1] ?? '',
            summary: {
              scheduledHours: '',
              shortHours: '',
              excessHours: '',
              totalHour: 0,
              totalLateArrival: 0,
              excessHour: 0,
              totalHalfDay: 0,
              totalPresent: 0,
              totalAbsent: 0,
              totalLeave: 0,
            },
            recordDetails: filteredRecords,
          };
          summary.totalHour = getWorkedHoursMatchingScheduledDays(
            itemForWorked,
            uiUser,
            periodDateList
          );
        }

        user.summary = summary;
        user.recordDetails = filteredRecords;
      }

      const mapped: AttendanceSummaryView[] = Array.from(userMap.values())
        .filter((item) => Object.keys(item.recordDetails || {}).length > 0)
        .map((item) => {
        // Get the monthYear for schedule lookup
        const monthYear = typeof filter === 'string' ? filter : ('end' in filter ? filter.end : filter.endDate);
        
        // Get applicable schedule for the specific monthYear
        const getApplicableSchedule = (user: any, monthYear: string) => {
          if (!user?.schedules || !Array.isArray(user.schedules)) return null;
          const targetDate = new Date(monthYear + '-01');
          const applicable = user.schedules
            .filter((s: any) => new Date(s.effectiveFrom) <= targetDate)
            .sort((a: any, b: any) => new Date(b.effectiveFrom).getTime() - new Date(a.effectiveFrom).getTime())[0];
          return applicable || null;
        };

        const userFromMap = userScheduleMap.get(item.userId?._id ? String(item.userId._id) : '');

        const yearSchedule = getApplicableSchedule(userFromMap || item.userId, monthYear);

        // Helper function to get schedule for a specific day
        const getDaySchedule = (dayName: string) => {
          return yearSchedule?.daily?.[dayName] || null;
        };

        let totalScheduled = 0;
        // Calculate scheduled hours for each day that has attendance data
        for (const date of Object.keys(item.recordDetails)) {
          const d = new Date(date);
          const rec = item.recordDetails[date];
          
          // Get applicable schedule for this specific date
          const getApplicableScheduleForDate = (user: any, date: Date) => {
            if (!user?.schedules || !Array.isArray(user.schedules)) return null;
            const applicable = user.schedules
              .filter((s: any) => new Date(s.effectiveFrom) <= date)
              .sort((a: any, b: any) => new Date(b.effectiveFrom).getTime() - new Date(a.effectiveFrom).getTime())[0];
            return applicable || null;
          };
          
          const dateSchedule = getApplicableScheduleForDate(userFromMap || item.userId, d);
          
          // Only add scheduled hours if it's not a holiday and not marked as holiday in schedule
          const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
          const dayName = dayNames[d.getDay()];
          const daySchedule = dateSchedule?.daily?.[dayName];

          if (rec.typeOfPresence !== 'Holiday' && !daySchedule?.isHoliday) {
            totalScheduled += calculateScheduledHoursForDate(d, dateSchedule);
          }
        }

        return {
          id: String(item._id),
          userId: item.userId?._id ? String(item.userId._id) : '',
          userName: item.userId?.name ?? 'Unknown',
          odId: item.userId?.odId ?? '',
          employeeCode: item.userId?.employeeCode ?? '',
          team: (() => {
            const u = userFromMap || item.userId;
            const asOf = lastDayOfMonthYear(monthYear);
            return getWorkingUnderPartnerForDate(u, asOf) || u?.team || '';
          })(),
          designation: (() => {
            const u = userFromMap || item.userId;
            return getDesignationForDate(u, lastDayOfMonthYear(monthYear)) || u?.designation || '';
          })(),
          monthYear: monthYear,
          schedules: yearSchedule,
          summary: {
            scheduledHours: "", // Add calculation if needed
            shortHours: "",     // Add calculation if needed
            excessHours: "",    // Add calculation if needed
            totalHour: item.summary?.totalHour ?? 0,
            totalLateArrival: item.summary?.totalLateArrival ?? 0,
            excessHour: item.summary?.excessHour ?? 0,
            totalHalfDay: item.summary?.totalHalfDay ?? 0,
            totalPresent: item.summary?.totalPresent ?? 0,
            totalAbsent: item.summary?.totalAbsent ?? 0,
            totalLeave: item.summary?.totalLeave ?? 0,
          },
          recordDetails: item.recordDetails || {},
          calcScheduled: totalScheduled,
          // Patch: Map backend excessHour to calcExcessDeficit for summary table
          calcExcessDeficit: item.summary?.excessHour ?? 0
        };
      });

      setSummaries(mapped);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error occurred';
      setError(`Error fetching summaries: ${message}`);
    } finally {
      setLoadingSummaries(false);
    }
  }, []);

  const fetchEmployeeMonthly = useCallback(async (userId: string, monthYear: string): Promise<void> => {
    if (!userId || !monthYear) return;

    setEmployeeLoading(true);
    setEmployeeError(null);
    setEmployeeDays([]);
    setEmployeeApprovedRequests([]);

    try {
      // Fetch attendance and requests in parallel
      const [attendanceResponse, requestsResponse] = await Promise.all([
        fetch(`/api/attendance?userId=${encodeURIComponent(userId)}&monthYear=${encodeURIComponent(monthYear)}`),
        fetch(`/api/employee/request-correction?userId=${encodeURIComponent(userId)}`, hrCredentialsInit())
      ]);
      
      const attendanceResult = await attendanceResponse.json();
      const requestsResult = await requestsResponse.json();

      // Process requests for this month (include pending so calendar can show them)
      let filteredRequests: any[] = [];
      if (requestsResult.success && requestsResult.data) {
        filteredRequests = requestsResult.data.filter((req: any) => {
          const reqMonthYear = req.monthYear || (req.date ? req.date.substring(0, 7) : '');
          return reqMonthYear === monthYear;
        });
        setEmployeeApprovedRequests(filteredRequests);
      }

      if (!attendanceResponse.ok || !attendanceResult.success) {
        throw new Error(attendanceResult.error || 'Failed to fetch employee attendance');
      }

      const docs: any[] = Array.isArray(attendanceResult.data) ? attendanceResult.data : [];
      const doc = docs[0];
      const recordsObj = doc?.records || {};
      const userDefaults = {
        id: doc?.userId?._id ? String(doc.userId._id) : userId,
        name: doc?.userId?.name ?? 'Unknown',
      };

      const days: AttendanceRecord[] = Object.entries(recordsObj).map(([dateKey, value]: [string, any]) => {
        // Use edited times for display if available, otherwise use original times
        const effectiveCheckin = value.editedCheckin || value.checkin;
        const effectiveCheckout = value.editedCheckout || value.checkout;

        let status: any = 'Present';

        // Determine status based on typeOfPresence
        if (value.typeOfPresence === 'Leave' || value.typeOfPresence === 'On leave') {
          status = 'Leave';
        } else if (value.typeOfPresence === 'Holiday') {
          status = 'Holiday';
        } else if (value.typeOfPresence === 'Absent') {
          status = 'Absent';
        } else if (value.halfDay) {
          status = 'HalfDay';
        } else if (value.typeOfPresence && value.typeOfPresence.includes('Present')) {
          status = 'Present';
        } else if (!effectiveCheckin && !effectiveCheckout) {
          status = 'Absent';
        } else {
          status = 'Present'; // Default for any other case with times
        }

        // Ensure AttendanceRecord structure
        return {
          id: userDefaults.id,
          name: userDefaults.name,
          date: dateKey,
          inTime: effectiveCheckin ?? '',
          outTime: effectiveCheckout ?? '',
          status: status,
          typeOfPresence: value.typeOfPresence ?? '',
          value: value.value ?? undefined,
          remarks: value.remarks ?? '',
          checkin: value.checkin ?? '',
          checkout: value.checkout ?? '',
          editedCheckin: value.editedCheckin ?? '',
          editedCheckout: value.editedCheckout ?? '',
          schedule: undefined,
          extraWorkEntries: Array.isArray(value.extraWorkEntries) ? value.extraWorkEntries : [],
          ...(value.totalHour !== undefined ? { totalHour: value.totalHour } : {}),
          ...(value.halfDay !== undefined ? { halfDay: value.halfDay } : {}),
        } satisfies AttendanceRecord;
      });

      for (const req of filteredRequests) {
        if (!req?.date || !req?.requestedStatus) continue;
        const existingIdx = days.findIndex((d) => d.date === req.date);
        const existingDay = existingIdx >= 0 ? days[existingIdx] : null;
        if (!shouldOverlayApprovedRequestOnAttendance(existingDay, req)) continue;

        const merged = buildDisplayRecordFromApprovedRequest(
          existingDay,
          req,
          req.date,
          userDefaults
        );
        if (existingIdx >= 0) {
          days[existingIdx] = merged;
        } else {
          days.push(merged);
        }
      }

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
  }, []);

  // Login UI (when not authenticated)
  if (!isAuthenticated) {
    return (
      <LoginView
        loginStep={loginStep}
        password={password}
        onPasswordChange={setPassword}
        onPasswordSubmit={handlePasswordSubmit}
        email={loginEmail}
        onEmailChange={setLoginEmail}
        otp={otp}
        onOtpChange={(val) => setOtp(val.replace(/\D/g, '').slice(0, 6))}
        onOtpSubmit={handleOTPSubmit}
        onBackToPassword={() => {
          setLoginStep('password');
          setOtp('');
          setSessionId(null);
          setOtpExpiresAt(null);
          setLoginError(null);
        }}
        otpSecondsLeft={loginStep === 'otp' ? otpSecondsLeft : null}
        isLoading={loginLoading}
        error={loginError}
      />
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="flex h-screen max-h-screen">
        <Sidebar
          activeSection={activeSection}
          setActiveSection={(section) => {
            if (hrPermState) {
              if (hrPermState.sections[section] === 'none') return;
            } else if (userRole === 'restricted_admin' && section !== 'upload') {
              return;
            }
            if (section !== 'summary') {
              setEmployeeManagementModal({ open: false, userId: null });
            }
            setActiveSection(section);
          }}
          uploadTotal={uploadTotal}
          uploadSaved={uploadSaved}
          uploadFailed={uploadFailed}
          currentMonthYear={currentMonthYear}
          onLogout={handleLogout}
          sectionAccess={hrPermState?.sections ?? null}
          permissionsLoaded={hrPermState !== null}
          userRole={userRole}
          userEmail={userEmail}
        />

        {/* Main content */}
        <main className="flex-1 overflow-y-auto bg-background">
          <div className="mx-auto min-h-full max-w-6xl space-y-6 bg-surface px-8 py-6 shadow-[inset_0_0_0_1px_rgba(147,197,253,0.35)]">
            {/* Upload Section */}
            

                
            {activeSection === 'employee' && (
              <EmployeeMonthView
                summaries={summaries}
                users={allUsers}
                selectedEmployeeId={selectedEmployeeId}
                setSelectedEmployeeId={setSelectedEmployeeId}
                selectedMonthYear={selectedEmployeeMonth}
                onMonthYearChange={(val) => {
                  setSelectedEmployeeMonth(val);
                  if (selectedEmployeeId && val) fetchEmployeeMonthly(selectedEmployeeId, val);
                }}
                employeeDays={employeeDays}
                isLoading={employeeLoading}
                error={employeeError}
                onLoadAttendance={fetchEmployeeMonthly}
                showEmployeeSelector={true}
                approvedRequests={employeeApprovedRequests}
                holidays={holidays}
              />
            )}
            {/* Article Credits Manager Section */}
            {activeSection === 'articleCredits' && (
              <ArticleCreditsManager />
            )}
               {/* Upload Section */}
                      {activeSection === 'upload' && (
                        <UploadSection
                          file={file}
                          files={files}
                          fixedFile={fixedFile}
                          fixedFiles={fixedFiles}
                          onFileChange={handleFileChange}
                          onFilesChange={handleFilesChange}
                          onFixedFileChange={handleFixedFileChange}
                          onFixedFilesChange={handleFixedFilesChange}
                          onProcessMultiple={processMultipleFiles}
                          onProcessMultipleFixed={processMultipleFixedFiles}
                          onProcessFixedFile={() => {
                            processFixedDataFile();
                          }}
                          onProcessFile={() => {
                            if (machineFormat === 'machine1') {
                              processMachine1File();
                            } else if (machineFormat === 'machine2' || machineFormat === 'machine3') {
                              processMachine2File();
                            } else {
                              setError('Unknown machine format selected');
                            }
                          }}
                          processing={processing}
                          error={error}
                          saveMessage={saveMessage}
                          uploadErrors={uploadErrors}
                          machineFormat={machineFormat}
                          onMachineFormatChange={setMachineFormat}
                        />
                      )}
                      
             {/* Employee Management Section */}
            {activeSection === 'employees' && (
              <EmployeeManagementSection
                onRefreshUsers={fetchUsers}
                employeesSectionAccess={hrPermState?.sections.employees ?? 'edit'}
                employeeTabAccess={hrPermState?.employeeTabs}
              />
            )}

            {activeSection === 'employeeMasterUpload' && (
              <EmployeeMasterUploadSection onRefreshUsers={fetchUsers} />
            )}

            {activeSection === 'teamAccess' && (
              <TeamAttendanceAccessSection allUsers={allUsers} />
            )}
            {/* Summary Section */}
            {activeSection === 'summary' && (
              <SummarySection
                summaries={summaries}
                allUsers={allUsers}
                holidays={holidays}
                uploadTotal={uploadTotal}
                uploadSaved={uploadSaved}
                uploadFailed={uploadFailed}
                isLoading={loadingSummaries}
                onFilterChange={fetchSummaries}
                onRefreshUsers={fetchUsers}
                onEmployeeClick={(userId, monthYear) => {
                  setEmployeeMonthModal({ open: true, userId, monthYear });
                  setSelectedEmployeeId(userId);
                  setSelectedEmployeeMonth(monthYear);
                  fetchEmployeeMonthly(userId, monthYear);
                }}
                onEmployeeDetailClick={(userId) => {
                  setEmployeeManagementModal({ open: true, userId });
                }}
              />
            )}
                
            {/* Modal for "Affected Info" Only */}
            {selectedEmployeeId && showAffectedModal && (
              <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
                <div className="relative w-full max-w-2xl bg-slate-900 border border-slate-800 rounded-xl shadow-2xl overflow-hidden">
                  <div className="flex items-center justify-between p-4 border-b border-slate-800 bg-slate-950/50">
                    <h3 className="text-lg font-semibold text-white">
                        Exceptions & Attendance Issues
                        <span className="ml-2 text-sm font-normal text-slate-400">
                           {allUsers.find(u => u._id === selectedEmployeeId)?.name || selectedEmployeeId}
                        </span>
                    </h3>
                    <button
                        onClick={() => {
                            setShowAffectedModal(false);
                            setSelectedEmployeeId(null);
                        }}
                        className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-full transition-colors"
                    >
                        <X className="w-5 h-5" />
                    </button>
                  </div>
                  
                  <div className="p-0 max-h-[60vh] overflow-y-auto">
                    {employeeLoading ? (
                        <div className="p-8 text-center text-slate-500">Loading details...</div>
                    ) : (
                        <table className="w-full text-sm text-left">
                            <thead className="bg-slate-950 text-slate-400 font-medium">
                                <tr>
                                    <th className="px-4 py-3">Date</th>
                                    <th className="px-4 py-3">Status</th>
                                    <th className="px-4 py-3">Times</th>
                                    <th className="px-4 py-3">Note</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-800">
                                {(() => {
                                    // 1. Get filtered list of issues
                                    const summary = summaries.find(s => s.userId === selectedEmployeeId);
                                    
                                    const issues = employeeDays.filter(rec => {
                                        const status = rec.status;
                                        // A. Status is NOT standard 'Present'
                                        if (['Absent', 'Leave', 'Holiday', 'HalfDay'].includes(status)) return true;
                                        
                                        // B. Check Late
                                        if (status === 'Present' && summary?.schedules && rec.inTime) {
                                            const parseMin = (t: string) => {
                                                const [h, m] = t.split(':').map(Number);
                                                return h * 60 + m;
                                            };
                                            const actual = parseMin(rec.inTime);
                                            const d = new Date(rec.date);
                                            const dow = d.getDay();
                                            const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
                                            const dayName = dayNames[dow] as keyof DailySchedule;
                                            const daySchedule = summary.schedules?.daily?.[dayName];
                                            let schedStr = daySchedule?.inTime;
                                            
                                            // Sunday/Holiday skipped
                                            if (dow === 0) return false;

                                            if (schedStr) {
                                                const sched = parseMin(schedStr);
                                                if (actual > sched) return true; // Late
                                            }
                                        }
                                        return false;
                                    });

                                    if (issues.length === 0) {
                                        return (
                                            <tr>
                                                <td colSpan={4} className="px-4 py-8 text-center text-slate-500 italic">
                                                    No attendance issues or exceptions found for this month. Good job!
                                                </td>
                                            </tr>
                                        );
                                    }

                                    return issues.map(rec => {
                                        const d = new Date(rec.date);
                                        const dateLabel = d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', weekday: 'short' });
                                        
                                        // Re-check Late for display
                                        let isLate = false;
                                        if (rec.status === 'Present' && summary?.schedules) {
                                             const parseMin = (t: string) => { const [h, m] = t.split(':').map(Number); return h*60+m; };
                                             const actual = rec.inTime ? parseMin(rec.inTime) : 0;
                                             const dow = d.getDay();
                                             const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
                                             const dayName = dayNames[dow];
                                             const daySchedule = summary.schedules?.daily?.[dayName as keyof DailySchedule];
                                             const schedStr = daySchedule?.inTime;
                                             if (dow !== 0 && !daySchedule?.isHoliday && schedStr && actual > parseMin(schedStr)) isLate = true;
                                        }

                                        let statusColor = 'text-slate-300';
                                        if (rec.status === 'Absent') statusColor = 'text-rose-400 bg-rose-400/10';
                                        if (isLate) statusColor = 'text-amber-400 bg-amber-400/10';
                                        if (rec.status === 'Leave' || rec.status === 'On leave') statusColor = 'text-sky-400 bg-sky-400/10';
                                        if (rec.status === 'Holiday') statusColor = 'text-amber-200 bg-amber-500/10';
                                        if (rec.status === 'HalfDay') statusColor = 'text-orange-400 bg-orange-400/10';

                                        return (
                                            <tr key={rec.date} className="hover:bg-slate-800/30">
                                                <td className="px-4 py-3 font-mono text-slate-300">{dateLabel}</td>
                                                <td className="px-4 py-3">
                                                    <span className={`px-2 py-0.5 rounded textxs font-medium ${statusColor}`}>
                                                        {isLate ? 'Late Arrival' : rec.status}
                                                    </span>
                                                </td>
                                                <td className="px-4 py-3 font-mono text-slate-400">
                                                    {rec.inTime || '--:--'} - {rec.outTime || '--:--'}
                                                </td>
                                                <td className="px-4 py-3 text-slate-500 italic text-xs">
                                                    {rec.typeOfPresence || (isLate ? 'Checked in late' : '-')}
                                                </td>
                                            </tr>
                                        );
                                    });
                                })()}
                            </tbody>
                        </table>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Employee Month View Modal Popup */}
            {employeeMonthModal.open && (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
                <div className="relative w-full max-w-4xl bg-slate-900 border border-slate-800 rounded-xl shadow-2xl overflow-hidden">
                  <div className="flex items-center justify-between p-4 border-b border-slate-800 bg-slate-950/50">
                    <h3 className="text-lg font-semibold text-white">
                      Employee Month View
                      <span className="ml-2 text-sm font-normal text-slate-400">
                        {allUsers.find(u => u._id === employeeMonthModal.userId)?.name || employeeMonthModal.userId}
                      </span>
                    </h3>
                    <button
                      onClick={() => setEmployeeMonthModal({ open: false, userId: null, monthYear: '' })}
                      className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-full transition-colors"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  </div>
                  <div className="p-0 max-h-[90vh] overflow-y-auto">
                    <EmployeeMonthView
                      summaries={summaries}
                      users={allUsers}
                      selectedEmployeeId={employeeMonthModal.userId}
                      setSelectedEmployeeId={setSelectedEmployeeId}
                      selectedMonthYear={employeeMonthModal.monthYear}
                      onMonthYearChange={(val) => {
                        setSelectedEmployeeMonth(val);
                        setEmployeeMonthModal(modal => ({ ...modal, monthYear: val }));
                        if (employeeMonthModal.userId && val) fetchEmployeeMonthly(employeeMonthModal.userId, val);
                      }}
                      employeeDays={employeeDays}
                      isLoading={employeeLoading}
                      error={employeeError}
                      onLoadAttendance={fetchEmployeeMonthly}
                      showEmployeeSelector={false}
                      approvedRequests={employeeApprovedRequests}
                      holidays={holidays}
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Employee Management Section Modal Popup */}
            {employeeManagementModal.open && (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
                <div className="relative w-full max-w-4xl bg-slate-900 border border-slate-800 rounded-xl shadow-2xl overflow-hidden">
                  <div className="flex items-center justify-between p-4 border-b border-slate-800 bg-slate-950/50">
                    <h3 className="text-lg font-semibold text-white">
                      Employee Details
                      <span className="ml-2 text-sm font-normal text-slate-400">
                        {allUsers.find(u => u._id === employeeManagementModal.userId)?.name || employeeManagementModal.userId}
                      </span>
                    </h3>
                    <button
                      onClick={() => setEmployeeManagementModal({ open: false, userId: null })}
                      className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-full transition-colors"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  </div>
                  <div className="p-0 max-h-[90vh] overflow-y-auto">
                    <EmployeeManagementSection
                      selectedUserId={employeeManagementModal.userId}
                      onRefreshUsers={fetchUsers}
                      employeesSectionAccess={hrPermState?.sections.employees ?? 'edit'}
                      employeeTabAccess={hrPermState?.employeeTabs}
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Attendance Requests Section */}
            {activeSection === 'requests' && (
              <AttendanceRequestsSection 
                isAdminView={true}
                userRole="HR"
              />
            )}

            {/* Holiday Management Section */}
            {activeSection === 'holidays' && (
              <HolidayManagement />
            )}

            {/* Database Backup Section */}
            {activeSection === 'backup' && (
              <BackupManagementSection />
            )}

            {/* Leave Management Section */}
            {activeSection === 'leave' && (
              <LeaveManagementSection
                isLoading={false}
                error={null}
                onRefresh={() => {}}
              />
            )}

            {/* Fine Management Section */}
            {activeSection === 'fines' && (
              <FineManagementSection />
            )}

            {/* Invalid Attendance Section */}
            {activeSection === 'invalid' && (
              <InvalidAttendanceSection onRefresh={fetchUsers} />
            )}

            {activeSection === 'misExceptions' && <EmployeeMisExceptionsSection />}

            {activeSection === 'daywiseCompare' && (
              <DaywiseCompareSection allUsers={allUsers} holidays={holidays} />
            )}

            {/* Client Places Section */}
            {activeSection === 'clientPlaces' && (
              <ClientPlaceManagement allUsers={allUsers} />
            )}

            {activeSection === 'accessControl' && (
              <HrConsoleAccessSection
                onSaved={async () => {
                  const res = await fetch('/api/hr-console-permissions?me=1', hrCredentialsInit());
                  const j = await res.json();
                  if (res.ok && j.success && j.data) {
                    setHrPermState({
                      sections: j.data.sections,
                      employeeTabs: j.data.employeeTabs,
                    });
                  }
                }}
              />
            )}

            {activeSection === 'settings' && <HrConsoleSettingsSection />}
          </div>
        </main>
      </div>
    </div>
  );
}
