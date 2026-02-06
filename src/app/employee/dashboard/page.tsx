"use client";
import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { EmployeeMonthView } from '@/components/EmployeeMonthView';
import { AttendanceRecord, AttendanceSummaryView, User } from '@/types/ui';
import { LogOut, X, Loader2, Send } from 'lucide-react';

const TIMED_CATEGORIES = [
  'Present - in office',
  'Present - client place',
  'Present - weekoff',
  'Half Day - weekdays',
  'WFH - weekdays',
  'Thumb machine - not working'
];

export default function EmployeeDashboard() {
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
             // Transform Summary
             const mappedSum: AttendanceSummaryView = {
                id: doc._id,
                userId: doc.userId._id,
                userName: doc.userId.name,
                monthYear: doc.monthYear,
                schedules: {
                   effectiveFrom: new Date().toISOString(), // Default effective date for display
                   daily: {
                      monday: doc.userId.scheduleInOutTime ? { inTime: doc.userId.scheduleInOutTime.inTime, outTime: doc.userId.scheduleInOutTime.outTime, isHoliday: false, isHalfDay: false } : undefined,
                      tuesday: doc.userId.scheduleInOutTime ? { inTime: doc.userId.scheduleInOutTime.inTime, outTime: doc.userId.scheduleInOutTime.outTime, isHoliday: false, isHalfDay: false } : undefined,
                      wednesday: doc.userId.scheduleInOutTime ? { inTime: doc.userId.scheduleInOutTime.inTime, outTime: doc.userId.scheduleInOutTime.outTime, isHoliday: false, isHalfDay: false } : undefined,
                      thursday: doc.userId.scheduleInOutTime ? { inTime: doc.userId.scheduleInOutTime.inTime, outTime: doc.userId.scheduleInOutTime.outTime, isHoliday: false, isHalfDay: false } : undefined,
                      friday: doc.userId.scheduleInOutTime ? { inTime: doc.userId.scheduleInOutTime.inTime, outTime: doc.userId.scheduleInOutTime.outTime, isHoliday: false, isHalfDay: false } : undefined,
                      saturday: doc.userId.scheduleInOutTimeSat ? { inTime: doc.userId.scheduleInOutTimeSat.inTime, outTime: doc.userId.scheduleInOutTimeSat.outTime, isHoliday: false, isHalfDay: true } : undefined,
                      sunday: { inTime: '09:00', outTime: '18:00', isHoliday: true, isHalfDay: false },
                   }
                },
                summary: doc.summary
             };
             setSummary(mappedSum);

             // Transform Records
             const recordsObj = doc.records || {};
             const days: AttendanceRecord[] = Object.entries(recordsObj).map(([dateKey, value]: [string, any]) => {
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
                  id: doc.userId._id,
                  name: doc.userId.name,
                  date: dateKey,
                  inTime: effectiveCheckin ?? '',
                  outTime: effectiveCheckout ?? '',
                  status: status,
                  typeOfPresence: value.typeOfPresence,
                  value: value.value
                };
            });
            setEmployeeDays(days);
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
      // Clear any ongoing selection when changing months
      setCalendarSelectionStart(null);
      setFutureStartDate('');
      setFutureEndDate('');
      setFutureReason('');
      setFutureStartTime('');
      setFutureEndTime('');
      setFutureCustomType('');
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
      
      // Validate required fields
      if (!requestReason.trim()) {
          alert('Please provide a reason for your attendance correction request.');
          return;
      }
      
      let finalStartTime = startTime;
      let finalEndTime = endTime;
      
      // For Present - outstation, use scheduled times automatically
      if (requestStatus === 'Present - outstation' && summary?.schedules) {
          const date = new Date(selectedDate);
          const dayOfWeek = date.getDay(); // 0 = Sunday, 1 = Monday, ..., 6 = Saturday

          const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
          const dayName = dayNames[dayOfWeek];

          const scheduleToUse = summary?.schedules?.daily?.[dayName as keyof typeof summary.schedules.daily];

          if (scheduleToUse && !scheduleToUse.isHoliday) {
              finalStartTime = scheduleToUse.inTime;
              finalEndTime = scheduleToUse.outTime;
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
                  requestedStatus: requestStatus,
                  reason: requestReason,
                  startTime: finalStartTime || undefined,
                  endTime: finalEndTime || undefined
              })
          });
          const json = await res.json();

          if (!res.ok) {
              // Specific handling for duplicate request on same date
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
              // Refresh data to show updated request status
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

      // Validate custom type if "Other" is selected
      if (futureType === 'Other' && !futureCustomType.trim()) {
          alert('Please specify the request type.');
          return;
      }

      // Get the actual request type
      const actualRequestType = futureType === 'Other' ? futureCustomType.trim() : futureType;

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
          // For Present - outstation, scheduled times will be calculated by the API
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
                  requestType: actualRequestType,
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
              // Refresh data to show updated request status
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

  const statusOptions = [  
    // Keep original leave and weekoff
    'On leave',
    
    // Present categories
    'Present - in office',
    'Present - client place',
    'Present - outstation',
    'Present - weekoff',
    
    // Half Day categories
    'Half Day - weekdays',
    'Half Day - weekoff',
    
    // WFH categories
    'WFH - weekdays',
    'WFH - weekoff',
    
    // Other categories
    'Weekoff - special allowance',
    'Thumb machine - not working'
  ];

  // Week off options for Holiday/Week Off days
  const weekOffStatusOptions = [
    'Weekoff - special allowance',
    'Present - weekoff',
    'Half Day - weekoff',
    'WFH - weekoff'
  ];

  // Get the appropriate options based on selected date status
  const getCorrectionStatusOptions = () => {
    if (selectedDateStatus === 'Holiday') {
      return weekOffStatusOptions;
    }
    return statusOptions;
  };

  // Limited options for future requests
  const futureStatusOptions = [
    'On leave',
    'Half Day - weekdays',
    'Half Day - weekoff',
    'WFH - weekdays',
    'WFH - weekoff',
    'Weekoff - special allowance',
    'Other'
  ];

  return (
    <div className="min-h-screen bg-slate-950 text-slate-50 flex flex-col">
       {/* Header */}
       <header className="bg-slate-900 border-b border-slate-800 p-2 px-3 sm:px-4 sticky top-0 z-40">
           <div className="flex items-center justify-between gap-2">
               <div className="min-w-0 flex-1 flex items-center gap-2">
                   <img src="/lg.png" alt="Logo" className="w-12 h-12 object-contain flex-shrink-0" />
                   <div>
                       <h1 className="text-base sm:text-xl font-bold text-white truncate">My Attendance</h1>
                       <p className="text-[11px] sm:text-xs text-slate-400 truncate"><span className="hidden sm:inline">Asija and Associates LLP • </span>Welcome, {user.name}</p>
                   </div>
               </div>

               <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
                   <button onClick={handleLogout} className="p-2 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-rose-400 transition-colors touch-manipulation active:scale-95" title="Sign Out">
                       <LogOut className="w-5 h-5" />
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

       {/* Content */}
       <main className="flex-1 p-3 sm:p-6 lg:p-8 max-w-7xl mx-auto w-full">
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
       </main>

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
