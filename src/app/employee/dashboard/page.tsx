"use client";
import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { EmployeeMonthView } from '@/components/EmployeeMonthView';
import { AttendanceRecord, AttendanceSummaryView, User } from '@/types/ui';
import { LogOut, X, Loader2, Send } from 'lucide-react';

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
  const [requestStatus, setRequestStatus] = useState('Official Holiday Duty (OHD)');
  const [requestReason, setRequestReason] = useState('');
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [sendingRequest, setSendingRequest] = useState(false);

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
        // Fetch Summary
        const resSum = await fetch(`/api/attendance?userId=${userId}&monthYear=${my}`);
        const jsonSum = await resSum.json();
        
        if (jsonSum.success && jsonSum.data && jsonSum.data.length > 0) {
             const doc = jsonSum.data[0];
             // Transform Summary
             const mappedSum: AttendanceSummaryView = {
                id: doc._id,
                userId: doc.userId._id,
                userName: doc.userId.name,
                monthYear: doc.monthYear,
                schedules: {
                   regular: doc.userId.scheduleInOutTime,
                   saturday: doc.userId.scheduleInOutTimeSat,
                   monthly: doc.userId.scheduleInOutTimeMonth
                },
                summary: doc.summary
             };
             setSummary(mappedSum);

             // Transform Records
             const recordsObj = doc.records || {};
             const days: AttendanceRecord[] = Object.entries(recordsObj).map(([dateKey, value]: [string, any]) => {
                let status: any = 'Present';
                if (value.typeOfPresence === 'Leave') status = 'Leave';
                else if (value.typeOfPresence === 'Holiday') status = 'Holiday';
                else if (value.halfDay) status = 'HalfDay';
                else if (!value.checkin && !value.checkout && value.typeOfPresence !== 'Leave') status = 'Absent';
                
                // Fallback
                if (status === 'Present' && !value.checkin && !value.checkout) status = 'Absent';

                return {
                  id: doc.userId._id,
                  name: doc.userId.name,
                  date: dateKey,
                  inTime: value.checkin ?? '',
                  outTime: value.checkout ?? '',
                  status: status,
                  typeOfPresence: value.typeOfPresence
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
  };

  const handleDayClick = (date: string) => {
      setSelectedDate(date);
      setRequestStatus('Official Holiday Duty (OHD)');
      setRequestReason('');
      setStartTime('');
      setEndTime('');
  };

  const submitRequest = async () => {
      if (!selectedDate || !user) return;
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
                  startTime: startTime || undefined,
                  endTime: endTime || undefined
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
          } else {
              alert(json.error || 'Failed to send request');
          }
      } catch (e) {
          alert('Error sending request');
      } finally {
          setSendingRequest(false);
      }
  };

  const handleLogout = () => {
    localStorage.removeItem('employeeUser');
    router.push('/employee/login');
  };

  if (loading || !user) return <div className="min-h-screen bg-slate-950 flex items-center justify-center text-white">Loading...</div>;

  const statusOptions = [
    'Leave',
    'Official Holiday Duty (OHD)',
    'Weekly Off - Present (WO-Present)',
    'Half Day (HD)',
    'Work From Home (WFH)',
    'Weekly Off - Work From Home (WO-WFH)',
    'Onsite Presence (OS-P)',
    'Week Off'
  ];

  return (
    <div className="min-h-screen bg-slate-950 text-slate-50 flex flex-col">
       {/* Header */}
       <header className="bg-slate-900 border-b border-slate-800 p-4 px-8 flex justify-between items-center">
           <div>
               <h1 className="text-xl font-bold text-white">My Attendance</h1>
               <p className="text-xs text-slate-400">Welcome, {user.name}</p>
           </div>
           <button onClick={handleLogout} className="flex items-center gap-2 hover:text-rose-400 transition-colors text-sm">
               <LogOut className="w-4 h-4" /> Sign Out
           </button>
       </header>

       {/* Content */}
       <main className="flex-1 p-8 max-w-7xl mx-auto w-full">
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
           />
       </main>

       {/* Correction Modal */}
       {selectedDate && (
           <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
               <div className="w-full max-w-md bg-slate-900 border border-slate-700 rounded-xl shadow-2xl overflow-hidden">
                   <div className="p-4 border-b border-slate-800 flex justify-between items-center bg-slate-950">
                       <h3 className="font-semibold text-white">Request Correction</h3>
                       <button onClick={() => setSelectedDate(null)} className="text-slate-500 hover:text-white"><X className="w-5 h-5"/></button>
                   </div>
                   <div className="p-6 space-y-4">
                       <div className="p-3 bg-emerald-900/20 border border-emerald-500/30 rounded-lg text-emerald-200 text-sm">
                           Requesting change for <strong>{selectedDate}</strong>
                       </div>

                       <div className="space-y-2">
                           <label className="text-sm font-medium text-slate-300">Select Correct Status</label>
                           <select 
                             value={requestStatus}
                             onChange={(e) => setRequestStatus(e.target.value)}
                             className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-slate-200 outline-none focus:border-emerald-500"
                           >
                              {statusOptions.map(s => <option key={s} value={s}>{s}</option>)}
                           </select>
                       </div>

                       {(requestStatus === 'Work From Home (WFH)' || requestStatus === 'Onsite Presence (OS-P)') && (
                           <div className="grid grid-cols-2 gap-4">
                               <div className="space-y-2">
                                   <label className="text-sm font-medium text-slate-300">Start Time</label>
                                   <input 
                                     type="time" 
                                     value={startTime}
                                     onChange={(e) => setStartTime(e.target.value)}
                                     className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-slate-200 outline-none focus:border-emerald-500"
                                   />
                               </div>
                               <div className="space-y-2">
                                   <label className="text-sm font-medium text-slate-300">End Time</label>
                                   <input 
                                     type="time" 
                                     value={endTime}
                                     onChange={(e) => setEndTime(e.target.value)}
                                     className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-slate-200 outline-none focus:border-emerald-500"
                                   />
                               </div>
                           </div>
                       )}

                       <div className="space-y-2">
                           <label className="text-sm font-medium text-slate-300">Reason (Optional)</label>
                           <textarea 
                             value={requestReason}
                             onChange={(e) => setRequestReason(e.target.value)}
                             placeholder="E.g., Forgot to punch out due to client meeting..."
                             className="w-full bg-slate-950 border border-slate-700 rounded-lg p-3 text-slate-200 outline-none focus:border-emerald-500 min-h-[80px]"
                           />
                       </div>

                       <button 
                         onClick={submitRequest}
                         disabled={sendingRequest}
                         className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-medium py-2.5 rounded-lg flex items-center justify-center gap-2 mt-4"
                       >
                           {sendingRequest ? <Loader2 className="w-4 h-4 animate-spin"/> : <Send className="w-4 h-4"/>}
                           Send Request to Partner
                       </button>
                   </div>
               </div>
           </div>
       )}
    </div>
  );
}
