"use client";
import React, { useEffect, useState } from 'react';
import { isHolidayDate } from '@/lib/holidaysClient';
import { useRouter } from 'next/navigation';
import { EmployeeMonthView } from '@/components/EmployeeMonthView';
import { AttendanceRecord, AttendanceSummaryView, User } from '@/types/ui';
// Helper to fetch users working under a partner
async function fetchSubordinates(partnerIdOrName: string) {
  const res = await fetch(`/api/users?workingUnderPartner=${encodeURIComponent(partnerIdOrName)}`);
  const json = await res.json();
  if (json.success && Array.isArray(json.data)) {
    return json.data;
  }
  return [];
}

// Helper to fetch attendance for a user
async function fetchAttendanceForUser(userId: string, monthYear: string) {
  const res = await fetch(`/api/attendance?userId=${userId}&monthYear=${monthYear}`);
  const json = await res.json();
  if (json.success && json.data && json.data.length > 0) {
    return json.data[0];
  }
  return null;
}
import { LocationAttendanceSection } from '@/components/LocationAttendanceSection';
import { LogOut, X, Loader2, Send } from 'lucide-react';

const TIMED_CATEGORIES = [
  'Present - in office',
  'Half Day',
  'WFH',
  'Present - outstation',
  'Present - client place'
];

export default function EmployeeDashboard() {
  // Sidebar tab state
  const [activeTab, setActiveTab] = useState<'my' | 'employees'>('my');
  // Collapsible sidebar state
  const [sidebarOpen, setSidebarOpen] = useState(false);
  // Selected subordinate for dropdown
  const [selectedSubordinateId, setSelectedSubordinateId] = useState<string | null>(null);
  // Search state for filtering subordinates
  const [searchTerm, setSearchTerm] = useState('');
  // Sidebar tab state

    // State for subordinates (if any)
    const [subordinates, setSubordinates] = useState<User[]>([]);
    const [subordinateAttendance, setSubordinateAttendance] = useState<Record<string, { summary: AttendanceSummaryView | null, employeeDays: AttendanceRecord[] }>>({});
    const [subLoading, setSubLoading] = useState(false);
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  // Attendance Data State
  const [summary, setSummary] = useState<AttendanceSummaryView | null>(null);
  const [employeeDays, setEmployeeDays] = useState<AttendanceRecord[]>([]);
  const [monthYear, setMonthYear] = useState<string>(
    new Date().toISOString().substring(0, 7) // YYYY-MM
  );
  const [fetchLoading, setFetchLoading] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);

  // Modal State
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [selectedDateStatus, setSelectedDateStatus] = useState<string | null>(null); // Track the status of selected date
  const [requestStatus, setRequestStatus] = useState('Official Holiday Duty (OHD)');
  const [requestReason, setRequestReason] = useState('');
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [sendingRequest, setSendingRequest] = useState(false);

  // Future Request Modal State
  const [showFutureModal, setShowFutureModal] = useState(false);
  const [futureStartDate, setFutureStartDate] = useState('');
  const [futureEndDate, setFutureEndDate] = useState('');
  const [futureType, setFutureType] = useState('On leave');
  const [futureCustomType, setFutureCustomType] = useState(''); // For "Other" option
  const [futureReason, setFutureReason] = useState('');
  const [futureStartTime, setFutureStartTime] = useState('');
  const [futureEndTime, setFutureEndTime] = useState('');
  const [sendingFutureRequest, setSendingFutureRequest] = useState(false);

  // Calendar selection state
  const [calendarSelectionStart, setCalendarSelectionStart] = useState<string | null>(null);

  // Employee requests state
  const [employeeRequests, setEmployeeRequests] = useState<Array<{
    _id: string;
    date: string;
    requestedStatus: string;
    status: 'Pending' | 'Approved' | 'Rejected';
    approvedBy?: string;
    approvedByEmail?: string;
    approvedAt?: string;
    updatedAt?: string;
  }>>([]);

  useEffect(() => {
    const stored = localStorage.getItem('employeeUser');
    if (!stored) {
      router.push('/employee/login');
      return;
    }
    const userData = JSON.parse(stored);
    setUser(userData);
    setLoading(false);
    
    // Initial Load
    fetchAttendance(userData._id, monthYear);

    // Fetch subordinates if this user is a partner
    // Try both by _id and by name
    (async () => {
      setSubLoading(true);
      let subs: User[] = [];
      // Try by _id
      subs = await fetchSubordinates(userData._id);
      // If none, try by name
      if (!subs.length && userData.name) {
        subs = await fetchSubordinates(userData.name);
      }
      setSubordinates(subs);
      setSubLoading(false);
      // Fetch attendance for each subordinate
      const att: Record<string, { summary: AttendanceSummaryView | null, employeeDays: AttendanceRecord[] }> = {};
      for (const sub of subs) {
        const attData = await fetchAttendanceForUser(sub._id, monthYear);
        if (attData) {
          // Build summary and employeeDays as in main fetchAttendance
          const recordsObj = attData.records || {};
          const days: AttendanceRecord[] = Object.entries(recordsObj).map(([dateKey, value]: [string, any]) => {
            const userForDay = attData.userId;
            const dateObj = new Date(dateKey);
            const dayOfWeek = dateObj.getDay();
            const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
            const dayName = dayNames[dayOfWeek];
            let schedule = undefined;
            if (userForDay.schedules && Array.isArray(userForDay.schedules) && userForDay.schedules.length > 0) {
              const effSchedules = userForDay.schedules
                .filter((s: any) => new Date(s.effectiveFrom) <= dateObj)
                .sort((a: any, b: any) => Number(new Date(b.effectiveFrom).getTime()) - Number(new Date(a.effectiveFrom).getTime()));
              if (effSchedules.length > 0) {
                const eff = effSchedules[0];
                if (eff.daily && eff.daily[dayName]) {
                  schedule = { ...eff.daily[dayName] };
                }
              }
            }
            if (!schedule) {
              if (dayName === 'saturday' && userForDay.scheduleInOutTimeSat) {
                schedule = { ...userForDay.scheduleInOutTimeSat, isHoliday: false, isHalfDay: true };
              } else if (userForDay.scheduleInOutTime) {
                schedule = { ...userForDay.scheduleInOutTime, isHoliday: false, isHalfDay: false };
              } else if (dayName === 'sunday') {
                schedule = { inTime: '09:00', outTime: '18:00', isHoliday: true, isHalfDay: false };
              }
            }
            const effectiveCheckin = value.editedCheckin || value.checkin;
            const effectiveCheckout = value.editedCheckout || value.checkout;
            let status: any = 'Present';
            if (value.typeOfPresence === 'Leave' || value.typeOfPresence === 'On leave') status = 'On leave';
            else if (value.typeOfPresence === 'Holiday') status = 'Holiday';
            else if (value.halfDay) status = 'HalfDay';
            else if (!effectiveCheckin && !effectiveCheckout && value.typeOfPresence !== 'Leave' && value.typeOfPresence !== 'On leave') status = 'Absent';
            if (status === 'Present' && !effectiveCheckin && !effectiveCheckout) status = 'Absent';
            return {
              id: userForDay._id,
              name: userForDay.name,
              date: dateKey,
              inTime: effectiveCheckin ?? '',
              outTime: effectiveCheckout ?? '',
              status: status,
              typeOfPresence: value.typeOfPresence,
              value: value.value,
              schedule: schedule
            };
          });
          const daily: any = {};
          const weekdays = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
          weekdays.forEach((day) => {
            if (day === 'saturday' && attData.userId.scheduleInOutTimeSat) {
              daily[day] = { ...attData.userId.scheduleInOutTimeSat, isHoliday: false, isHalfDay: true };
            } else if (day === 'sunday') {
              daily[day] = { inTime: '09:00', outTime: '18:00', isHoliday: true, isHalfDay: false };
            } else if (attData.userId.scheduleInOutTime) {
              daily[day] = { ...attData.userId.scheduleInOutTime, isHoliday: false, isHalfDay: false };
            } else {
              daily[day] = undefined;
            }
          });
          const mappedSum: AttendanceSummaryView = {
            id: attData._id,
            userId: attData.userId._id,
            userName: attData.userId.name,
            monthYear: attData.monthYear,
            schedules: {
              effectiveFrom: new Date().toISOString(),
              daily
            },
            summary: {
              ...attData.summary,
              excessHours: '' // Not used
            }
          };
          att[sub._id] = { summary: mappedSum, employeeDays: days };
        } else {
          att[sub._id] = { summary: null, employeeDays: [] };
        }
      }
      setSubordinateAttendance(att);
    })();
  }, []);

  const fetchAttendance = async (userId: string, my: string) => {
    setFetchLoading(true);
    setFetchError(null);
    try {
        // Fetch Summary and Employee Requests in parallel
        const [resSum, resRequests] = await Promise.all([
          fetch(`/api/attendance?userId=${userId}&monthYear=${my}`),
          fetch(`/api/employee/request-correction?userId=${userId}`)
        ]);
        
        const jsonSum = await resSum.json();
        const jsonRequests = await resRequests.json();

        // Process employee requests
        if (jsonRequests.success && jsonRequests.data) {
          // Filter requests for the selected month
          const filteredRequests = jsonRequests.data.filter((req: any) => {
            const reqDate = req.date.split('T')[0];
            return reqDate.startsWith(my);
          });
          setEmployeeRequests(filteredRequests);
        } else {
          setEmployeeRequests([]);
        }
        
        if (jsonSum.success && jsonSum.data && jsonSum.data.length > 0) {
             const doc = jsonSum.data[0];
             // For each day, fetch the latest user schedule (in case of changes mid-month)
             const recordsObj = doc.records || {};
             const days: AttendanceRecord[] = await Promise.all(
               Object.entries(recordsObj).map(async ([dateKey, value]: [string, any]) => {
                 const userForDay = doc.userId;
                 const dateObj = new Date(dateKey);
                 const dayOfWeek = dateObj.getDay();
                 const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
                 const dayName = dayNames[dayOfWeek];
                 let schedule = undefined;
                 // --- NEW LOGIC: Use schedules array with effective date ---
                 if (userForDay.schedules && Array.isArray(userForDay.schedules) && userForDay.schedules.length > 0) {
                   // Find the most recent schedule effective on or before this date
                   const effSchedules = userForDay.schedules
                     .filter((s: any) => new Date(s.effectiveFrom) <= dateObj)
                     .sort((a: any, b: any) => Number(new Date(b.effectiveFrom).getTime()) - Number(new Date(a.effectiveFrom).getTime()));
                   if (effSchedules.length > 0) {
                     const eff = effSchedules[0];
                     if (eff.daily && eff.daily[dayName]) {
                       schedule = { ...eff.daily[dayName] };
                     }
                   }
                 }
                 // Fallback to legacy fields if no schedule found
                 if (!schedule) {
                   if (dayName === 'saturday' && userForDay.scheduleInOutTimeSat) {
                     schedule = { ...userForDay.scheduleInOutTimeSat, isHoliday: false, isHalfDay: true };
                   } else if (userForDay.scheduleInOutTime) {
                     schedule = { ...userForDay.scheduleInOutTime, isHoliday: false, isHalfDay: false };
                   } else if (dayName === 'sunday') {
                     schedule = { inTime: '09:00', outTime: '18:00', isHoliday: true, isHalfDay: false };
                   }
                 }

                 // Use edited times for display if available, otherwise use original times
                 const effectiveCheckin = value.editedCheckin || value.checkin;
                 const effectiveCheckout = value.editedCheckout || value.checkout;

                 let status: any = 'Present';
                 if (value.typeOfPresence === 'Leave' || value.typeOfPresence === 'On leave') status = 'On leave';
                 else if (value.typeOfPresence === 'Holiday') status = 'Holiday';
                 else if (value.halfDay) status = 'HalfDay';
                 else if (!effectiveCheckin && !effectiveCheckout && value.typeOfPresence !== 'Leave' && value.typeOfPresence !== 'On leave') status = 'Absent';

                 // Fallback
                 if (status === 'Present' && !effectiveCheckin && !effectiveCheckout) status = 'Absent';

                 return {
                   id: userForDay._id,
                   name: userForDay.name,
                   date: dateKey,
                   inTime: effectiveCheckin ?? '',
                   outTime: effectiveCheckout ?? '',
                   status: status,
                   typeOfPresence: value.typeOfPresence,
                   value: value.value,
                   schedule: schedule // Attach schedule for this day
                 };
               })
             );
             setEmployeeDays(days);

             // Build summary.schedules.daily using the latest user schedule for each weekday
             const daily: any = {};
             const weekdays = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
             weekdays.forEach((day) => {
               if (day === 'saturday' && doc.userId.scheduleInOutTimeSat) {
                 daily[day] = { ...doc.userId.scheduleInOutTimeSat, isHoliday: false, isHalfDay: true };
               } else if (day === 'sunday') {
                 daily[day] = { inTime: '09:00', outTime: '18:00', isHoliday: true, isHalfDay: false };
               } else if (doc.userId.scheduleInOutTime) {
                 daily[day] = { ...doc.userId.scheduleInOutTime, isHoliday: false, isHalfDay: false };
               } else {
                 daily[day] = undefined;
               }
             });
             // Format excessHour as string for legacy UI fields
             const formatExcessHour = (val: number) => {
               const sign = val < 0 ? '-' : '';
               const abs = Math.abs(val);
               const h = Math.floor(abs);
               const m = Math.round((abs % 1) * 60);
               return `${sign}${h}:${m.toString().padStart(2, '0')}`;
             };
             const mappedSum: AttendanceSummaryView = {
               id: doc._id,
               userId: doc.userId._id,
               userName: doc.userId.name,
               monthYear: doc.monthYear,
               schedules: {
                 effectiveFrom: new Date().toISOString(),
                 daily
               },
               summary: {
                 ...doc.summary,
                 excessHours: formatExcessHour(doc.summary?.excessHour ?? 0),
               }
             };
             setSummary(mappedSum);
        } else {
            setSummary(null);
            setEmployeeDays([]);
        }

    } catch (e) {
        setFetchError('Failed to load data');
    } finally {
        setFetchLoading(false);
    }
  };

  const handleMonthChange = (val: string) => {
    setMonthYear(val);
    if (user) fetchAttendance(user._id, val);
    setCalendarSelectionStart(null);
    setFutureStartDate('');
    setFutureEndDate('');
    setFutureReason('');
    setFutureStartTime('');
    setFutureEndTime('');
    setFutureCustomType('');
    // Also reload subordinate attendance for new month
    (async () => {
      if (!user) return;
      let subs: User[] = subordinates;
      if (!subs.length) {
        subs = await fetchSubordinates(user._id);
        if (!subs.length && user.name) {
          subs = await fetchSubordinates(user.name);
        }
      }
      const att: Record<string, { summary: AttendanceSummaryView | null, employeeDays: AttendanceRecord[] }> = {};
      for (const sub of subs) {
        const attData = await fetchAttendanceForUser(sub._id, val);
        if (attData) {
          const recordsObj = attData.records || {};
          const days: AttendanceRecord[] = Object.entries(recordsObj).map(([dateKey, value]: [string, any]) => {
            const userForDay = attData.userId;
            const dateObj = new Date(dateKey);
            const dayOfWeek = dateObj.getDay();
            const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
            const dayName = dayNames[dayOfWeek];
            let schedule = undefined;
            if (userForDay.schedules && Array.isArray(userForDay.schedules) && userForDay.schedules.length > 0) {
              const effSchedules = userForDay.schedules
                .filter((s: any) => new Date(s.effectiveFrom) <= dateObj)
                .sort((a: any, b: any) => Number(new Date(b.effectiveFrom).getTime()) - Number(new Date(a.effectiveFrom).getTime()));
              if (effSchedules.length > 0) {
                const eff = effSchedules[0];
                if (eff.daily && eff.daily[dayName]) {
                  schedule = { ...eff.daily[dayName] };
                }
              }
            }
            if (!schedule) {
              if (dayName === 'saturday' && userForDay.scheduleInOutTimeSat) {
                schedule = { ...userForDay.scheduleInOutTimeSat, isHoliday: false, isHalfDay: true };
              } else if (userForDay.scheduleInOutTime) {
                schedule = { ...userForDay.scheduleInOutTime, isHoliday: false, isHalfDay: false };
              } else if (dayName === 'sunday') {
                schedule = { inTime: '09:00', outTime: '18:00', isHoliday: true, isHalfDay: false };
              }
            }
            const effectiveCheckin = value.editedCheckin || value.checkin;
            const effectiveCheckout = value.editedCheckout || value.checkout;
            let status: any = 'Present';
            if (value.typeOfPresence === 'Leave' || value.typeOfPresence === 'On leave') status = 'On leave';
            else if (value.typeOfPresence === 'Holiday') status = 'Holiday';
            else if (value.halfDay) status = 'HalfDay';
            else if (!effectiveCheckin && !effectiveCheckout && value.typeOfPresence !== 'Leave' && value.typeOfPresence !== 'On leave') status = 'Absent';
            if (status === 'Present' && !effectiveCheckin && !effectiveCheckout) status = 'Absent';
            return {
              id: userForDay._id,
              name: userForDay.name,
              date: dateKey,
              inTime: effectiveCheckin ?? '',
              outTime: effectiveCheckout ?? '',
              status: status,
              typeOfPresence: value.typeOfPresence,
              value: value.value,
              schedule: schedule
            };
          });
          const daily: any = {};
          const weekdays = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
          weekdays.forEach((day) => {
            if (day === 'saturday' && attData.userId.scheduleInOutTimeSat) {
              daily[day] = { ...attData.userId.scheduleInOutTimeSat, isHoliday: false, isHalfDay: true };
            } else if (day === 'sunday') {
              daily[day] = { inTime: '09:00', outTime: '18:00', isHoliday: true, isHalfDay: false };
            } else if (attData.userId.scheduleInOutTime) {
              daily[day] = { ...attData.userId.scheduleInOutTime, isHoliday: false, isHalfDay: false };
            } else {
              daily[day] = undefined;
            }
          });
          const mappedSum: AttendanceSummaryView = {
            id: attData._id,
            userId: attData.userId._id,
            userName: attData.userId.name,
            monthYear: attData.monthYear,
            schedules: {
              effectiveFrom: new Date().toISOString(),
              daily
            },
            summary: {
              ...attData.summary,
              excessHours: ''
            }
          };
          att[sub._id] = { summary: mappedSum, employeeDays: days };
        } else {
          att[sub._id] = { summary: null, employeeDays: [] };
        }
      }
      setSubordinateAttendance(att);
    })();
  };

  const handleDayClick = (date: string) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const clickedDate = new Date(date);
    clickedDate.setHours(0, 0, 0, 0);
    
    if (clickedDate >= today) {
      // Future date - handle future request
      if (!futureStartDate) {
        // First future date clicked - set as start date, don't open modal yet
        setFutureStartDate(date);
        setFutureEndDate(date); // Default to same date
        setFutureType('On leave');
        setFutureReason('');
        setFutureStartTime('');
        setFutureEndTime('');
        setCalendarSelectionStart(date); // Set calendar selection for highlighting
        // Don't open modal yet - let user select second date
      } else if (futureStartDate === date) {
        // Clicking the same date - open modal for single date request
        setShowFutureModal(true);
        setCalendarSelectionStart(null); // Clear calendar selection
      } else {
        // Second future date clicked - set as end date and open modal
        const start = new Date(futureStartDate);
        const end = new Date(date);
        if (end >= start) {
          setFutureEndDate(date);
        } else {
          // If clicked date is before start, swap them
          setFutureEndDate(futureStartDate);
          setFutureStartDate(date);
        }
        setShowFutureModal(true);
        setCalendarSelectionStart(null); // Clear calendar selection
      }
    } else {
      // Past date - handle correction request
      // Find the attendance record for this date
      const dayRecord = employeeDays.find(d => d.date === date);
      
      // Check if correction request is allowed
      // Allowed when: Absent, Half Day, Holiday/Week Off, or in/out time is missing
      const status = dayRecord?.status;
      const inTime = dayRecord?.inTime;
      const outTime = dayRecord?.outTime;
      const typeOfPresence = dayRecord?.typeOfPresence;
      
      const isAbsent = status === 'Absent' || !dayRecord;
      const isHalfDay = status === 'HalfDay' || typeOfPresence?.toLowerCase().includes('half');
      const isHoliday = status === 'Holiday' || typeOfPresence === 'Holiday' || typeOfPresence === 'Week Off';
      const isMissingPunch = !inTime || !outTime || inTime === '00:00' || outTime === '00:00';
      
      // Check if there's already a pending request for this date
      const existingRequest = employeeRequests.find(r => r.date.split('T')[0] === date);
      if (existingRequest && existingRequest.status === 'Pending') {
        alert('You already have a pending request for this date. Please wait for it to be processed.');
        return;
      }
      
      if (!isAbsent && !isHalfDay && !isHoliday && !isMissingPunch) {
        alert('Correction requests are only allowed for days marked as Absent, Half Day, Holiday/Week Off, or when attendance in/out is not marked.');
        return;
      }
      
      setSelectedDate(date);
      setSelectedDateStatus(isHoliday ? 'Holiday' : null);
      // Set default status based on the day type
      if (isHoliday) {
        setRequestStatus('Weekoff - special allowance');
      } else {
        setRequestStatus('On leave');
      }
      setRequestReason('');
      setStartTime('');
      setEndTime('');
    }
  };

  const submitRequest = async () => {
    if (!selectedDate || !user) return;
    if (!requestReason.trim()) {
      alert('Please provide a reason for your attendance correction request.');
      return;
    }
    let finalStartTime = startTime;
    let finalEndTime = endTime;
    // Determine if selectedDate is Sunday or holiday (from DB)
    let isSunday = false;
    let isHoliday = false;
    const dateObj = new Date(selectedDate);
    isSunday = dateObj.getDay() === 0;
    isHoliday = await isHolidayDate(selectedDate);
    // Map requestStatus to correct suffix
    let mappedStatus = requestStatus;
    if (
      requestStatus.startsWith('WFH') ||
      requestStatus.startsWith('Half Day') ||
      requestStatus.startsWith('Present - in office') ||
      requestStatus.startsWith('Present - outstation') ||
      requestStatus.startsWith('Present - client place')
    ) {
      if (isSunday || isHoliday) {
        if (requestStatus.startsWith('WFH')) mappedStatus = 'WFH - weekoff';
        else if (requestStatus.startsWith('Half Day')) mappedStatus = 'Half Day - weekoff';
        else if (requestStatus.startsWith('Present - in office')) mappedStatus = 'Present - in office - weekoff';
        else if (requestStatus.startsWith('Present - outstation')) mappedStatus = 'Present - Outstation (Weekoff)';
        else if (requestStatus.startsWith('Present - client place')) mappedStatus = 'Present - ClientPlace (Weekoff)';
      } else {
        if (requestStatus.startsWith('WFH')) mappedStatus = 'WFH - weekdays';
        else if (requestStatus.startsWith('Half Day')) mappedStatus = 'Half Day - weekdays';
        else if (requestStatus.startsWith('Present - in office')) mappedStatus = 'Present - in office - weekdays';
        else if (requestStatus.startsWith('Present - outstation')) mappedStatus = 'Present - Outstation (Weekdays)';
        else if (requestStatus.startsWith('Present - client place')) mappedStatus = 'Present - ClientPlace (Weekdays)';
      }
    }
    // For Present - outstation, use the actual schedule attached to the attendance record for that date if available
    const dayRecord = employeeDays.find(d => d.date === selectedDate);
    if (requestStatus.startsWith('Present - outstation')) {
      if (dayRecord && dayRecord.schedule && !dayRecord.schedule.isHoliday) {
        finalStartTime = dayRecord.schedule.inTime;
        finalEndTime = dayRecord.schedule.outTime;
      } else if (summary?.schedules) {
        const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
        const dayName = dayNames[dateObj.getDay()];
        let scheduleToUse = summary?.schedules?.daily?.[dayName];
        if (scheduleToUse && !scheduleToUse.isHoliday) {
          finalStartTime = scheduleToUse.inTime;
          finalEndTime = scheduleToUse.outTime;
        }
      }
    }
    setSendingRequest(true);
    try {
      const res = await fetch('/api/employee/request-correction', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user._id,
          date: selectedDate,
          requestedStatus: mappedStatus,
          reason: requestReason,
          startTime: finalStartTime || undefined,
          endTime: finalEndTime || undefined
        })
      });
      const json = await res.json();
      if (!res.ok) {
        if (res.status === 400 && typeof json.error === 'string' && json.error.includes('already have a correction request for this date')) {
          alert('You have already sent a correction request for this date. Please wait until it is approved or rejected before sending another.');
        } else {
          alert(json.error || 'Failed to send request');
        }
        return;
      }
      if (json.success) {
        alert(`Request sent successfully to ${json.sentTo}!`);
        setSelectedDate(null);
        fetchAttendance(user._id, monthYear);
      } else {
        alert(json.error || 'Failed to send request');
      }
    } catch (e) {
      alert('Error sending request');
    } finally {
      setSendingRequest(false);
    }
  };

  const submitFutureRequest = async () => {
    if (!user) return;
    if (!futureStartDate || !futureEndDate) {
      alert('Please select start and end dates.');
      return;
    }
    const isTimed = TIMED_CATEGORIES.includes(futureType);
    if (isTimed) {
      if (futureStartDate !== futureEndDate) {
        alert('For this category, only singular date selection is allowed (Start Date must equal End Date).');
        return;
      }
      if (!futureStartTime || !futureEndTime) {
        alert('Please provide Start Time and End Time.');
        return;
      }
    }
    if (!futureReason.trim()) {
      alert('Please provide a reason.');
      return;
    }
    if (futureType === 'Other' && !futureCustomType.trim()) {
      alert('Please specify the request type.');
      return;
    }
    // Determine if the chosen date is a Sunday or holiday (from DB)
    let isSunday = false;
    let isHoliday = false;
    const dateObj = new Date(futureStartDate);
    isSunday = dateObj.getDay() === 0;
    isHoliday = await isHolidayDate(futureStartDate);
    // Map requestType to correct suffix
    let mappedType = futureType;
    if (
      futureType.startsWith('WFH') ||
      futureType.startsWith('Half Day') ||
      futureType.startsWith('Present - in office') ||
      futureType.startsWith('Present - outstation') ||
      futureType.startsWith('Present - client place')
    ) {
      if (isSunday || isHoliday) {
        if (futureType.startsWith('WFH')) mappedType = 'WFH - weekoff';
        else if (futureType.startsWith('Half Day')) mappedType = 'Half Day - weekoff';
        else if (futureType.startsWith('Present - in office')) mappedType = 'Present - in office - weekoff';
        else if (futureType.startsWith('Present - outstation')) mappedType = 'Present - Outstation (Weekoff)';
        else if (futureType.startsWith('Present - client place')) mappedType = 'Present - ClientPlace (Weekoff)';
      } else {
        if (futureType.startsWith('WFH')) mappedType = 'WFH - weekdays';
        else if (futureType.startsWith('Half Day')) mappedType = 'Half Day - weekdays';
        else if (futureType.startsWith('Present - in office')) mappedType = 'Present - in office - weekdays';
        else if (futureType.startsWith('Present - outstation')) mappedType = 'Present - Outstation (Weekdays)';
        else if (futureType.startsWith('Present - client place')) mappedType = 'Present - ClientPlace (Weekdays)';
      }
    }
    if (futureType === 'Other') mappedType = futureCustomType.trim();
    // Determine time values
    let reqStartTime: string | undefined = undefined;
    let reqEndTime: string | undefined = undefined;
    const ZERO_TIME_CATEGORIES = [
      'On leave',
      'Weekoff - special allowance'
    ];
    const SCHEDULED_TIME_CATEGORIES = [
      'Present - outstation'
    ];
    if (isTimed) {
      reqStartTime = futureStartTime;
      reqEndTime = futureEndTime;
    } else if (ZERO_TIME_CATEGORIES.includes(futureType)) {
      reqStartTime = '00:00';
      reqEndTime = '00:00';
    } else if (SCHEDULED_TIME_CATEGORIES.includes(futureType)) {
      reqStartTime = undefined;
      reqEndTime = undefined;
    }
    setSendingFutureRequest(true);
    try {
      const res = await fetch('/api/employee/request-future-leave', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user._id,
          startDate: futureStartDate,
          endDate: futureEndDate,
          requestType: mappedType,
          reason: futureReason,
          startTime: reqStartTime,
          endTime: reqEndTime
        })
      });
      const json = await res.json();
      if (!res.ok) {
        alert(json.error || 'Failed to send request');
        return;
      }
      if (json.success) {
        alert(`Future request sent successfully! Created ${json.count} requests.`);
        setShowFutureModal(false);
        setFutureStartDate('');
        setFutureEndDate('');
        setFutureReason('');
        setFutureStartTime('');
        setFutureEndTime('');
        setFutureCustomType('');
        setCalendarSelectionStart(null);
        fetchAttendance(user._id, monthYear);
      } else {
        alert(json.error || 'Failed to send request');
      }
    } catch (e) {
      alert('Error sending request');
    } finally {
      setSendingFutureRequest(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('employeeUser');
    router.push('/employee/login');
  };

  if (loading || !user) return <div className="min-h-screen bg-slate-950 flex items-center justify-center text-white">Loading...</div>;

  // Correction request dropdown options (simplified)
  const statusOptions = [
    'Present - in office',
    'Half Day',
    'WFH',
    'Present - outstation',
    'Present - client place',
    'On leave',
    'Holiday',
    'Absent',
    'Weekoff - special allowance',
    'Other'
  ];

  // Week off options for Holiday/Week Off days (simplified)
  const weekOffStatusOptions = [
    'Weekoff - special allowance',
    'Present - in office',
    'Half Day',
    'WFH',
    'Present - outstation',
    'Present - client place'
  ];

  // Get the appropriate options based on selected date status
  const getCorrectionStatusOptions = () => {
    if (selectedDateStatus === 'Holiday') {
      return weekOffStatusOptions;
    }
    return statusOptions;
  };

  // Limited options for future requests (simplified)
  const futureStatusOptions = [
    'On leave',
    'Half Day',
    'WFH',
    'Present - outstation',
    'Present - client place',
    'Weekoff - special allowance',
    'Other'
  ];

  return (
    <div className="min-h-screen bg-slate-950 text-slate-50 flex flex-col">
      {/* Mobile sidebar toggle button (moved to right in header) */}
      {/* Header */}
      <header className="bg-slate-900 border-b border-slate-800 p-2 px-3 sm:px-4 sticky top-0 z-30">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0 flex-1 flex items-center gap-2">
            <img src="/lg.png" alt="Logo" className="w-12 h-12 object-contain shrink-0" />
            <div>
              <h1 className="text-base sm:text-xl font-bold text-white truncate">My Attendance</h1>
              <p className="text-[11px] sm:text-xs text-slate-400 truncate"><span className="hidden sm:inline">Asija and Associates LLP • </span>Welcome, {user.name}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            <button onClick={handleLogout} className="p-2 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-rose-400 transition-colors touch-manipulation active:scale-95" title="Sign Out">
              <LogOut className="w-5 h-5" />
            </button>
            {/* Mobile sidebar toggle button (right side) */}
            <button
              className="md:hidden ml-2 bg-slate-900 border border-slate-700 rounded-lg p-2 text-slate-200 focus:outline-none"
              onClick={() => setSidebarOpen(!sidebarOpen)}
              aria-label={sidebarOpen ? 'Close sidebar' : 'Open sidebar'}
              type="button"
            >
              {sidebarOpen ? (
                <span>&#10005;</span>
              ) : (
                <span>&#9776;</span>
              )}
            </button>
          </div>
        </div>
           
           {/* Selection banner - shown when dates are selected */}
           {futureStartDate && (
             <div className="mt-2 flex items-center gap-2 bg-emerald-900/30 border border-emerald-500/30 rounded-lg p-2">
               <button
                 onClick={() => setShowFutureModal(true)}
                 className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white px-3 py-1.5 rounded-md text-xs font-medium transition-colors animate-pulse truncate active:scale-95 touch-manipulation"
               >
                 {futureStartDate === futureEndDate
                   ? `Request for ${futureStartDate}`
                   : `${futureStartDate} → ${futureEndDate}`
                 }
               </button>
               <button
                 onClick={() => {
                   setFutureStartDate('');
                   setFutureEndDate('');
                   setFutureReason('');
                   setFutureStartTime('');
                   setFutureEndTime('');
                   setCalendarSelectionStart(null);
                 }}
                 className="p-1.5 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-md transition-colors touch-manipulation active:scale-95"
                 title="Clear selection"
               >
                 <X className="w-4 h-4" />
               </button>
             </div>
           )}
       </header>

      <div className="flex min-h-[80vh]">
        {/* Sidebar */}
        {/* Overlay for mobile when sidebar is open */}
        {sidebarOpen && (
          <div
            className="fixed inset-0 bg-black bg-opacity-40 z-30 md:hidden"
            onClick={() => setSidebarOpen(false)}
          />
        )}
        <aside
          className={`
            fixed md:static top-0 left-0 z-40 h-full md:h-auto w-56 bg-slate-900 border-r border-slate-800 flex flex-col py-8 px-2 gap-2
            transition-transform duration-200 ease-in-out
            ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
            md:translate-x-0
          `}
          style={{ minWidth: '0' }}
        >
          <button
            className={`w-full px-4 py-3 rounded-lg text-left font-semibold transition-colors ${activeTab === 'my' ? 'bg-emerald-600 text-white' : 'bg-slate-800 text-slate-200 hover:bg-slate-700'}`}
            onClick={() => {
              setActiveTab('my');
              setSidebarOpen(false);
            }}
          >
            My Attendance
          </button>
          <button
            className={`w-full px-4 py-3 rounded-lg text-left font-semibold transition-colors ${activeTab === 'employees' ? 'bg-emerald-600 text-white' : 'bg-slate-800 text-slate-200 hover:bg-slate-700'}`}
            onClick={() => {
              setActiveTab('employees');
              setSidebarOpen(false);
            }}
            disabled={subordinates.length === 0}
          >
            Employee Attendance
          </button>
        </aside>
        {/* Main Content */}
        <main className="flex-1 p-3 sm:p-6 lg:p-8 max-w-7xl mx-auto w-full space-y-6 ml-0 md:ml-56 transition-all duration-200">
           {activeTab === 'my' && <LocationAttendanceSection userId={user._id} />}
           {activeTab === 'my' && (
             <EmployeeMonthView 
                summaries={summary ? [summary] : []}
                users={[user]}
                selectedEmployeeId={user._id}
                setSelectedEmployeeId={() => {}} // Disabled for employee view
                selectedMonthYear={monthYear}
                onMonthYearChange={handleMonthChange}
                employeeDays={employeeDays}
                isLoading={fetchLoading}
                error={fetchError}
                onLoadAttendance={() => user && fetchAttendance(user._id, monthYear)}
                onDayClick={handleDayClick}
                selectionStart={calendarSelectionStart}
                onSelectionStartChange={setCalendarSelectionStart}
                onApplyFutureRequest={() => setShowFutureModal(true)}
                approvedRequests={employeeRequests}
             />
           )}
           {activeTab === 'employees' && (
             <>
               {subLoading && (
                 <div className="bg-slate-900 border border-slate-700 rounded-lg p-4 text-slate-300 text-center">Loading subordinates...</div>
               )}
               {!subLoading && subordinates.length > 0 && (
                 <section className="mt-2">
                   <h3 className="text-lg font-bold text-slate-100 mb-4">Attendance of Employees Working Under You</h3>
                   <div className="mb-4 flex flex-col gap-2 max-w-xs">
                     <label htmlFor="search-subordinate" className="text-slate-300 font-medium">Search Employee:</label>
                     <input
                       id="search-subordinate"
                       type="text"
                       className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 min-w-[200px]"
                       placeholder="Type name or OD ID..."
                       value={searchTerm}
                       onChange={e => {
                         setSearchTerm(e.target.value);
                         setSelectedSubordinateId(null); // Reset selection on new search
                       }}
                     />
                     <select
                       id="subordinate-select"
                       className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 min-w-[200px]"
                       value={selectedSubordinateId ?? ''}
                       onChange={e => setSelectedSubordinateId(e.target.value || null)}
                     >
                       <option value="">-- Select --</option>
                       {subordinates
                         .filter(sub =>
                           sub.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                           sub.odId.toLowerCase().includes(searchTerm.toLowerCase())
                         )
                         .map(sub => (
                           <option key={sub._id} value={sub._id}>{sub.name} ({sub.odId})</option>
                         ))}
                     </select>
                   </div>
                   {selectedSubordinateId && subordinateAttendance[selectedSubordinateId] ? (
                     <div className="bg-slate-900 border border-slate-700 rounded-lg p-4 mt-4">
                       <h4 className="text-base font-semibold text-slate-200 mb-2 flex items-center gap-2">
                         <span className="inline-block bg-slate-700 rounded px-2 py-0.5 text-xs font-mono">
                           {subordinates.find(s => s._id === selectedSubordinateId)?.odId}
                         </span>
                         {subordinates.find(s => s._id === selectedSubordinateId)?.name}
                       </h4>
                       <EmployeeMonthView
                         summaries={subordinateAttendance[selectedSubordinateId]?.summary ? [subordinateAttendance[selectedSubordinateId].summary!] : []}
                         users={[subordinates.find(s => s._id === selectedSubordinateId)!]}
                         selectedEmployeeId={selectedSubordinateId}
                         setSelectedEmployeeId={() => {}}
                         selectedMonthYear={monthYear}
                         onMonthYearChange={handleMonthChange}
                         employeeDays={subordinateAttendance[selectedSubordinateId]?.employeeDays || []}
                         isLoading={false}
                         error={null}
                         onLoadAttendance={() => {}}
                       />
                     </div>
                   ) : (
                     <div className="bg-slate-900 border border-slate-700 rounded-lg p-4 mt-4 text-slate-400 text-center">Select an employee to view attendance.</div>
                   )}
                 </section>
               )}
               {!subLoading && subordinates.length === 0 && (
                 <div className="bg-slate-900 border border-slate-700 rounded-lg p-4 text-slate-400 text-center">No employees working under you.</div>
               )}
             </>
           )}
         </main>
       </div>

       {/* Correction Modal */}
       {selectedDate && (
           <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-3 sm:p-4">
               <div className="w-full max-w-md bg-slate-900 border border-slate-700 rounded-xl shadow-2xl overflow-hidden max-h-[90vh] overflow-y-auto">
                   <div className="p-3 sm:p-4 border-b border-slate-800 flex justify-between items-center bg-slate-950">
                       <h3 className="font-semibold text-white text-sm sm:text-base">Request Correction</h3>
                       <button onClick={() => setSelectedDate(null)} className="text-slate-500 hover:text-white"><X className="w-5 h-5"/></button>
                   </div>
                   <div className="p-4 sm:p-6 space-y-4">
                       <div className="p-3 bg-emerald-900/20 border border-emerald-500/30 rounded-lg text-emerald-200 text-sm">
                           Requesting change for <strong>{selectedDate}</strong>
                       </div>

                       <div className="space-y-2">
                           <label className="text-sm font-medium text-slate-300">Select Correct Status</label>
                           <select 
                             value={requestStatus}
                             onChange={(e) => setRequestStatus(e.target.value)}
                             className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-slate-200 outline-none focus:border-emerald-500 text-sm sm:text-base"
                           >
                              {getCorrectionStatusOptions().map(s => <option key={s} value={s}>{s}</option>)}
                           </select>
                       </div>

                       {(requestStatus !== 'On leave' && requestStatus !== 'Present - outstation') && (
                           <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                               <div className="space-y-2">
                                   <label className="text-sm font-medium text-slate-300">Start Time</label>
                                   <input 
                                     type="time" 
                                     value={startTime}
                                     onChange={(e) => setStartTime(e.target.value)}
                                     className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-slate-200 outline-none focus:border-emerald-500 text-sm sm:text-base"
                                   />
                               </div>
                               <div className="space-y-2">
                                   <label className="text-sm font-medium text-slate-300">End Time</label>
                                   <input 
                                     type="time" 
                                     value={endTime}
                                     onChange={(e) => setEndTime(e.target.value)}
                                     className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-slate-200 outline-none focus:border-emerald-500 text-sm sm:text-base"
                                   />
                               </div>
                           </div>
                       )}

                       <div className="space-y-2">
                           <label className="text-sm font-medium text-slate-300">Reason *</label>
                           <textarea 
                             value={requestReason}
                             onChange={(e) => setRequestReason(e.target.value)}
                             placeholder="E.g., Forgot to punch out due to client meeting..."
                             className="w-full bg-slate-950 border border-slate-700 rounded-lg p-3 text-slate-200 outline-none focus:border-emerald-500 min-h-20 text-sm sm:text-base"
                             required
                           />
                       </div>

                       <button 
                         onClick={submitRequest}
                         disabled={sendingRequest || !requestReason.trim()}
                         className="w-full bg-emerald-600 hover:bg-emerald-500 disabled:bg-emerald-800 disabled:cursor-not-allowed text-white font-medium py-2.5 rounded-lg flex items-center justify-center gap-2 mt-4 text-sm sm:text-base"
                       >
                           {sendingRequest ? <Loader2 className="w-4 h-4 animate-spin"/> : <Send className="w-4 h-4"/>}
                           Send Request to Partner
                       </button>
                   </div>
               </div>
           </div>
       )}

       {showFutureModal && (
           <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-3 sm:p-4">
               <div className="w-full max-w-md bg-slate-900 border border-slate-700 rounded-xl shadow-2xl overflow-hidden max-h-[90vh] overflow-y-auto">
                   <div className="p-3 sm:p-4 border-b border-slate-800 flex justify-between items-center bg-slate-950">
                       <h3 className="font-semibold text-white text-sm sm:text-base">Future Request</h3>
                       <button onClick={() => {
                         setShowFutureModal(false);
                         setFutureStartDate('');
                         setFutureEndDate('');
                         setFutureReason('');
                         setFutureStartTime('');
                         setFutureEndTime('');
                         setFutureCustomType('');
                         setCalendarSelectionStart(null);
                       }} className="text-slate-500 hover:text-white"><X className="w-5 h-5"/></button>
                   </div>
                   <div className="p-4 sm:p-6 space-y-4">
                       <div className="p-3 bg-indigo-900/20 border border-indigo-500/30 rounded-lg text-indigo-200 text-sm">
                           {futureStartDate === futureEndDate 
                             ? `Selected date: ${futureStartDate}`
                             : `Selected range: ${futureStartDate} to ${futureEndDate}`
                           }
                           <div className="mt-2 text-xs text-indigo-300">
                             📅 Dates selected from calendar. Click another date to change range, or proceed with request.
                           </div>
                       </div>

                       <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                           <div className={TIMED_CATEGORIES.includes(futureType) ? "col-span-1 sm:col-span-2 space-y-2" : "space-y-2"}>
                               <label className="text-sm font-medium text-slate-300">
                                   {TIMED_CATEGORIES.includes(futureType) ? "Date" : "Start Date"}
                               </label>
                               <input 
                                 type="date" 
                                 value={futureStartDate}
                                 readOnly
                                 className="w-full bg-slate-800 border border-slate-600 rounded-lg p-2.5 text-slate-300 cursor-not-allowed text-sm sm:text-base"
                               />
                           </div>
                           {!TIMED_CATEGORIES.includes(futureType) && (
                               <div className="space-y-2">
                                   <label className="text-sm font-medium text-slate-300">End Date</label>
                                   <input 
                                     type="date" 
                                     value={futureEndDate}
                                     readOnly
                                     className="w-full bg-slate-800 border border-slate-600 rounded-lg p-2.5 text-slate-300 cursor-not-allowed text-sm sm:text-base"
                                   />
                               </div>
                           )}
                       </div>

                       <div className="space-y-2">
                           <label className="text-sm font-medium text-slate-300">Request Type</label>
                           <select 
                             value={futureType}
                             onChange={(e) => {
                                 const val = e.target.value;
                                 setFutureType(val);
                                 if (TIMED_CATEGORIES.includes(val)) {
                                     if (futureStartDate) setFutureEndDate(futureStartDate);
                                     setFutureStartTime('');
                                     setFutureEndTime('');
                                 }
                                 if (val !== 'Other') {
                                     setFutureCustomType('');
                                 }
                             }}
                             className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-slate-200 outline-none focus:border-indigo-500 text-sm sm:text-base"
                           >
                              {futureStatusOptions.map(s => <option key={s} value={s}>{s}</option>)}
                           </select>
                       </div>

                       {futureType === 'Other' && (
                           <div className="space-y-2">
                               <label className="text-sm font-medium text-slate-300">Specify Request Type *</label>
                               <input 
                                 type="text"
                                 value={futureCustomType}
                                 onChange={(e) => setFutureCustomType(e.target.value)}
                                 placeholder="Enter your request type..."
                                 className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-slate-200 outline-none focus:border-indigo-500 text-sm sm:text-base"
                                 required
                               />
                           </div>
                       )}

                       {TIMED_CATEGORIES.includes(futureType) && (
                           <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                               <div className="space-y-2">
                                   <label className="text-sm font-medium text-slate-300">Start Time *</label>
                                   <input 
                                     type="time" 
                                     value={futureStartTime}
                                     onChange={(e) => setFutureStartTime(e.target.value)}
                                     required
                                     className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-slate-200 outline-none focus:border-indigo-500 text-sm sm:text-base"
                                   />
                               </div>
                               <div className="space-y-2">
                                   <label className="text-sm font-medium text-slate-300">End Time *</label>
                                   <input 
                                     type="time" 
                                     value={futureEndTime}
                                     onChange={(e) => setFutureEndTime(e.target.value)}
                                     required
                                     className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-slate-200 outline-none focus:border-indigo-500 text-sm sm:text-base"
                                   />
                               </div>
                           </div>
                       )}

                       <div className="space-y-2">
                           <label className="text-sm font-medium text-slate-300">Reason *</label>
                           <textarea 
                             value={futureReason}
                             onChange={(e) => setFutureReason(e.target.value)}
                             placeholder="Reason for future absence..."
                             className="w-full bg-slate-950 border border-slate-700 rounded-lg p-3 text-slate-200 outline-none focus:border-indigo-500 min-h-20 text-sm sm:text-base"
                             required
                           />
                       </div>

                       <button 
                         onClick={submitFutureRequest}
                         disabled={sendingFutureRequest || !futureReason.trim()}
                         className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-800 disabled:cursor-not-allowed text-white font-medium py-2.5 rounded-lg flex items-center justify-center gap-2 mt-4 text-sm sm:text-base"
                       >
                           {sendingFutureRequest ? <Loader2 className="w-4 h-4 animate-spin"/> : <Send className="w-4 h-4"/>}
                           Send Request
                       </button>
                   </div>
               </div>
           </div>
       )}
    </div>
  );
}
