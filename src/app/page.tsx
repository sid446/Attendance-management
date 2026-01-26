"use client";
import React, { useState, ChangeEvent, useEffect } from "react";
import * as XLSX from 'xlsx';
import { X } from 'lucide-react';
import { AttendanceRecord, AttendanceSummaryView, User } from '@/types/ui';
import { LoginView } from '@/components/LoginView';
import { Sidebar } from '@/components/Sidebar';
import { UploadSection } from '@/components/UploadSection';
import { SummarySection } from '@/components/SummarySection';
import { EmployeeMonthView } from '@/components/EmployeeMonthView';
import { EmployeeManagementSection } from '@/components/EmployeeManagementSection';
import { AttendanceRequestsSection } from '@/components/AttendanceRequestsSection';
import { HolidayManagement } from '@/components/HolidayManagement';
import { get } from "http";

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
  const [activeSection, setActiveSection] = useState<'upload' | 'summary' | 'employee' | 'employees' | 'requests' | 'holidays'>('summary');
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string | null>(null);
  const [selectedEmployeeMonth, setSelectedEmployeeMonth] = useState<string>('');
  const [employeeDays, setEmployeeDays] = useState<AttendanceRecord[]>([]);
  const [employeeLoading, setEmployeeLoading] = useState<boolean>(false);
  const [employeeError, setEmployeeError] = useState<string | null>(null);
  const [loadingSummaries, setLoadingSummaries] = useState<boolean>(false);
  const [machineFormat, setMachineFormat] = useState<string>('machine2');
  
  // New State for "Affected" Modal
  const [showAffectedModal, setShowAffectedModal] = useState<boolean>(false);

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

  const processMachine2File = async (): Promise<void> => {
    if (!file) {
      setError('Please select a file first');
      return;
    }

    setProcessing(true);
    setError(null);
    setSaveMessage(null);

    try {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data, { cellDates: false, cellNF: false, cellText: false });
      const worksheet = workbook.Sheets[workbook.SheetNames[0]];
      const jsonData: any[][] = XLSX.utils.sheet_to_json(worksheet, { header: 1, raw: true, defval: '' });

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

  const processMachine1File = async (): Promise<void> => {
    if (!file) {
      setError('Please select a file first');
      return;
    }

    setProcessing(true);
    setError(null);
    setSaveMessage(null);

    try {
      const data = await file.arrayBuffer();//takes the data turn into into raw binary format as XLSX OR shetjs accept binary format
      const workbook = XLSX.read(data, { cellDates: false, cellNF: false, cellText: false });//cellDates: false to prevent automatic conversion of date cells into JS Date objects,cellNF: false to avoid applying number formatting, cellText: false to get raw cell values without text formatting
      const worksheet = workbook.Sheets[workbook.SheetNames[0]];//selects the first sheet in the workbook
      const jsonData: any[][] = XLSX.utils.sheet_to_json(worksheet, { header: 1, raw: true, defval: '' });//converts the worksheet into a 2D array (array of arrays) where each inner array represents a row in the sheet. header: 1 indicates that the first row should be treated as data, raw: true ensures raw cell values are returned, defval: '' fills empty cells with an empty string instead of undefined


      // Find header row (contains 'EMP Code', 'Emp Name', etc.)
      const headerRowIndex = jsonData.findIndex(row => 
        row.some(cell => cell === 'EMP Code' || cell === 'Emp Name')
      );//seraches the excel for the header row index value as it is saved like this [['EMP Code', 'Emp Name', 'In Time', 'Out Time', 'Date'],[...],[...]]


      if (headerRowIndex === -1) {
        throw new Error('Could not find header row in Excel file. Expected columns: EMP Code, Emp Name, In Time, Out Time, Date');
      }

      const headers: any[] = jsonData[headerRowIndex];//extracts the header row based on the found index
      const dataRows = jsonData.slice(headerRowIndex + 1);//select the data after the header row

      // Find column indices
      const empCodeIndex = headers.findIndex(h => h === 'EMP Code'); //finds the index of EMP Code example in this {'EMP Code', 'Emp Name', 'In Time', 'Out Time', 'Date'} we get 0
      const empNameIndex = headers.findIndex(h => h === 'Emp Name');//finds the index of Emp Name example in this {'EMP Code', 'Emp Name', 'In Time', 'Out Time', 'Date'} we get 1
      const inTimeIndex = headers.findIndex(h => h === 'In Time');//we get 2
      const outTimeIndex = headers.findIndex(h => h === 'Out Time');//we get 3
      const dateIndex = headers.findIndex(h => h === 'Date');//we get 4

      if (empCodeIndex === -1 || empNameIndex === -1 || inTimeIndex === -1 || outTimeIndex === -1 || dateIndex === -1) {
        throw new Error('Missing required columns. Expected: EMP Code, Emp Name, In Time, Out Time, Date');
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
    setUploadErrors([]);//check if the attendance is empty also help user know data saving  and set the error to null


    if (data && data.length > 0) {
      setUploadTotal(data.length);
    }
    
    // Chunking Logic
    const CHUNK_SIZE = 50;
    let localSaved = 0;
    let localFailed = 0;
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

         localSaved += processedCount;
         localFailed += errorCount;
         localErrors.push(...errorsList);

         // Update state progressively
         setUploadSaved(localSaved);
         setUploadFailed(localFailed);
         setUploadErrors(prev => [...prev, ...errorsList]);
      }

      const baseMessage = `Saved ${localSaved} attendance record${localSaved === 1 ? '' : 's'} to the server.`;

      let errorMessage = '';
      if (localFailed > 0) {
        errorMessage = ` ${localFailed} record${localFailed === 1 ? '' : 's'} failed to save. See details below.`;
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

 
  const calculateScheduledHoursForDate = (date: Date, schedules: any): number => {
    if (!schedules) return 0;

    const timeToHours = (t?: string) => {
      if (!t) return 0;
      const [h, m] = t.split(':').map(Number);
      return h + (m / 60);
    };

    const dow = date.getDay();
    if (dow === 0) return 0; // Sunday off

    let inTime, outTime;
    if (dow === 6) {
      inTime = schedules.saturday?.inTime || schedules.regular?.inTime;
      outTime = schedules.saturday?.outTime || schedules.regular?.outTime;
    } else {
      const month = date.getMonth() + 1;
      if (month === 1 || month === 12) {
        inTime = schedules.monthly?.inTime || schedules.regular?.inTime;
        outTime = schedules.monthly?.outTime || schedules.regular?.outTime;
      } else {
        inTime = schedules.regular?.inTime;
        outTime = schedules.regular?.outTime;
      }
    }

    const start = timeToHours(inTime);
    const end = timeToHours(outTime);
    return (start && end && end > start) ? (end - start) : 9; // Default 9 hours
  };

  const fetchSummaries = async (filter: string | {start: string, end: string} | {startDate: string, endDate: string}): Promise<void> => {
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

      // Fetch all months
      const allItems: any[] = [];
      for (const monthYear of monthYears) {
        const url = `/api/attendance?monthYear=${encodeURIComponent(monthYear)}`;
        const response = await fetch(url);
        const result = await response.json();

        if (!response.ok || !result.success) {
          throw new Error(result.error || 'Failed to fetch attendance summaries');
        }

        const items: any[] = Array.isArray(result.data) ? result.data : [];
        allItems.push(...items);
      }

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

      // If date range, filter records and calculate summary
      if (startDate && endDate) {
        for (const user of userMap.values()) {
          const filteredRecords: any = {};
          for (const [date, rec] of Object.entries(user.recordDetails)) {
            const d = new Date(date);
            if (d >= startDate && d <= endDate) {
              filteredRecords[date] = rec;
            }
          }
          // Calculate summary from filtered records
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
            if (rec.typeOfPresence !== 'Holiday') {
              summary.totalHour += rec.totalHour || 0;
            }
            if (rec.typeOfPresence === 'Leave' || rec.typeOfPresence === 'On leave') {
              summary.totalLeave += 1;
            } else if (rec.typeOfPresence !== 'Holiday' && rec.halfDay) {
              summary.totalHalfDay += 1;
              summary.totalPresent += 1;
            } else if (rec.typeOfPresence !== 'Holiday' && rec.checkin && rec.checkin !== "00:00") {
              summary.totalPresent += 1;
              // Check late
              // Need schedule to check late, but for simplicity, assume totalLateArrival is not calculated here
            } else if (rec.typeOfPresence !== 'Holiday') {
              summary.totalAbsent += 1;
            }
          }
          user.summary = summary;
          user.recordDetails = filteredRecords;
        }
      } else {
        // For month ranges, sum the monthly summaries
        for (const item of allItems) {
          const userId = item.userId?._id ? String(item.userId._id) : '';
          const user = userMap.get(userId);
          if (user) {
            user.summary.totalHour += item.summary?.totalHour ?? 0;
            user.summary.totalLateArrival += item.summary?.totalLateArrival ?? 0;
            user.summary.excessHour += item.summary?.excessHour ?? 0;
            user.summary.totalHalfDay += item.summary?.totalHalfDay ?? 0;
            user.summary.totalPresent += item.summary?.totalPresent ?? 0;
            user.summary.totalAbsent += item.summary?.totalAbsent ?? 0;
            user.summary.totalLeave += item.summary?.totalLeave ?? 0;
          }
        }
      }

      const mapped: AttendanceSummaryView[] = Array.from(userMap.values()).map((item) => {
        let totalScheduled = 0;
        // Calculate scheduled hours for each day that has attendance data
        for (const date of Object.keys(item.recordDetails)) {
          const d = new Date(date);
          const rec = item.recordDetails[date];
          // Only add scheduled hours if it's not a holiday
          if (rec.typeOfPresence !== 'Holiday') {
            totalScheduled += calculateScheduledHoursForDate(d, {
              regular: item.userId?.scheduleInOutTime,
              saturday: item.userId?.scheduleInOutTimeSat,
              monthly: item.userId?.scheduleInOutTimeMonth
            });
          }
        }

        return {
          id: String(item._id),
          userId: item.userId?._id ? String(item.userId._id) : '',
          userName: item.userId?.name ?? 'Unknown',
          odId: item.userId?.odId ?? '',
          employeeCode: item.userId?.employeeCode ?? '',
          team: item.userId?.workingUnderPartner || item.userId?.team || '',
          designation: item.userId?.designation || '',
          monthYear: typeof filter === 'string' ? filter : ('end' in filter ? filter.end : filter.endDate),
          schedules: {
              regular: item.userId?.scheduleInOutTime,
              saturday: item.userId?.scheduleInOutTimeSat,
              monthly: item.userId?.scheduleInOutTimeMonth
          },
          summary: {
            totalHour: Object.values(item.recordDetails).reduce((sum: number, rec: any) => 
              rec.typeOfPresence !== 'Holiday' ? sum + (rec.totalHour || 0) : sum, 0),
            totalLateArrival: item.summary?.totalLateArrival ?? 0,
            excessHour: item.summary?.excessHour ?? 0,
            totalHalfDay: Object.values(item.recordDetails).filter((rec: any) => 
              rec.typeOfPresence !== 'Holiday' && rec.halfDay).length,
            totalPresent: Object.values(item.recordDetails).filter((rec: any) => 
              rec.typeOfPresence !== 'Holiday' && ((rec.checkin && rec.checkin !== "00:00") || rec.halfDay)).length,
            totalAbsent: Object.values(item.recordDetails).filter((rec: any) => 
              rec.totalHour === 0 && rec.typeOfPresence !== 'Leave' && rec.typeOfPresence !== 'Holiday').length,
            totalLeave: item.summary?.totalLeave ?? 0,
          },
          recordDetails: item.recordDetails || {},
          calcScheduled: totalScheduled
        };
      });

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

      const days: AttendanceRecord[] = Object.entries(recordsObj).map(([dateKey, value]: [string, any]) => {
        let status: any = 'Present';
        if (value.typeOfPresence === 'Leave' || value.typeOfPresence === 'On leave') status = 'On leave';
        else if (value.typeOfPresence === 'Holiday') status = 'Holiday';
        else if (value.halfDay) status = 'HalfDay';
        else if (!value.checkin && !value.checkout && (value.typeOfPresence !== 'Leave' && value.typeOfPresence !== 'On leave') && value.typeOfPresence !== 'Holiday') status = 'Absent';
        
        // Fallback for explicit absent if type isn't set but no time
         if (status === 'Present' && !value.checkin && !value.checkout) status = 'Absent';

        return {
          id: doc.userId?._id ? String(doc.userId._id) : '',
          name: doc.userId?.name ?? 'Unknown',
          date: dateKey,
          inTime: value.checkin ?? '',
          outTime: value.checkout ?? '',
          status: status,
          typeOfPresence: value.typeOfPresence
        };
      });

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
                onProcessFile={() => {
                  if (machineFormat === 'machine1') {
                    processMachine1File();
                  } else if (machineFormat === 'machine2') {
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

            {/* Summary Section */}
            {activeSection === 'summary' && (
              <SummarySection
                summaries={summaries}
                allUsers={allUsers}
                uploadTotal={uploadTotal}
                uploadSaved={uploadSaved}
                uploadFailed={uploadFailed}
                isLoading={loadingSummaries}
                onFilterChange={fetchSummaries}
                onEmployeeClick={(userId, monthYear) => {
                  setSelectedEmployeeId(userId);
                  setActiveSection('employees');
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
                                            let schedStr = summary.schedules.regular?.inTime;
                                            if (dow === 6 && summary.schedules.saturday?.inTime) schedStr = summary.schedules.saturday.inTime;
                                            
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
                                             // (Simplification of logic above for display flag)
                                              const parseMin = (t: string) => { const [h, m] = t.split(':').map(Number); return h*60+m; };
                                              const actual = rec.inTime ? parseMin(rec.inTime) : 0;
                                              const dow = d.getDay();
                                              let schedStr = summary.schedules.regular?.inTime;
                                              if (dow === 6 && summary.schedules.saturday?.inTime) schedStr = summary.schedules.saturday.inTime;
                                              if (dow !== 0 && schedStr && actual > parseMin(schedStr)) isLate = true;
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

            {/* Employee month-wise Section - Standard View (via Sidebar) */}
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
              <EmployeeManagementSection selectedUserId={selectedEmployeeId} />
            )}

            {/* Attendance Requests Section */}
            {activeSection === 'requests' && (
              <AttendanceRequestsSection />
            )}

            {/* Holiday Management Section */}
            {activeSection === 'holidays' && (
              <HolidayManagement />
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
