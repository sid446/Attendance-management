import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import AttendanceRequest from '@/models/AttendanceRequest';
import Attendance from '@/models/Attendance';
import User from '@/models/User';

function calculateDuration(start: string, end: string): number {
    if (!start || !end) return 0;
    const [h1, m1] = start.split(':').map(Number);
    const [h2, m2] = end.split(':').map(Number);
    const totalMinutes = (h2 * 60 + m2) - (h1 * 60 + m1);
    return Math.max(0, Math.round((totalMinutes / 60) * 100) / 100);
}

// Helper found in other files, duplicated here for standalone execution
function calculateSummary(
    records: Map<string, any>,
    user?: any | null
  ) {
    let totalHour = 0;
    let totalLateArrival = 0;
    let excessHour = 0;
    let totalHalfDay = 0;
    let totalPresent = 0;
    let totalAbsent = 0;
    let totalLeave = 0;
  
    records.forEach((record, dateStr) => {
      totalHour += record.totalHour || 0;
      excessHour += record.excessHour || 0;
  
      if (record.halfDay) totalHalfDay++;
  
      let scheduledIn = '10:00'; 
      if (user) {
         const d = new Date(dateStr);
         const dow = d.getDay();
         const m = d.getMonth() + 1;
         
         if (m === 12 || m === 1) scheduledIn = user.scheduleInOutTimeMonth?.inTime || '09:00';
         else if (dow === 6) scheduledIn = user.scheduleInOutTimeSat?.inTime || '09:00';
         else if (dow !== 0) scheduledIn = user.scheduleInOutTime?.inTime || '09:00';
         if (dow === 0) scheduledIn = user.scheduleInOutTime?.inTime || '09:00';
      }
      
      if (record.checkin && record.checkin > scheduledIn) totalLateArrival++;
  
        switch (record.typeOfPresence) {
             case 'ThumbMachine':
             case 'Manual':
             case 'Remote':
             case 'Official Holiday Duty (OHD)':
             case 'Weekly Off - Present (WO-Present)':
             case 'Half Day (HD)':
             case 'Work From Home (WFH)':
             case 'Weekly Off - Work From Home (WO-WFH)':
             case 'Onsite Presence (OS-P)':
                // Align with main attendance summary logic:
                // these types count as Present only if totalHour > 0,
                // otherwise they are treated as Absent.
                if (record.totalHour > 0) {
                    totalPresent++;
                } else {
                    totalAbsent++;
                }
                break;
          case 'Leave':
             totalLeave++;
             break;
          case 'Holiday':
          case 'Week Off':
             break;
          default:
             totalAbsent++;
      }
    });
  
    return { totalHour, totalLateArrival, excessHour, totalHalfDay, totalPresent, totalAbsent, totalLeave };
}

export async function GET(request: NextRequest) {
  try {
    await dbConnect();
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    const action = searchParams.get('action');

    if (!id || !action) return new NextResponse('Missing parameters', { status: 400 });

    const reqRecord = await AttendanceRequest.findById(id);
    if (!reqRecord) return new NextResponse('Request not found', { status: 404 });

    if (reqRecord.status !== 'Pending') {
        return new NextResponse(`Request already ${reqRecord.status}`, { status: 200 });
    }

    if (action === 'reject') {
        reqRecord.status = 'Rejected';
        await reqRecord.save();
        return new NextResponse(`
            <html><body style="font-family:sans-serif; text-align:center; padding:40px;">
                <h1 style="color:red">Rejected</h1>
                <p>You have rejected the attendance correction for ${reqRecord.userName} on ${reqRecord.date}.</p>
            </body></html>
        `, { headers: { 'Content-Type': 'text/html' }});
    }

    if (action === 'approve') {
        reqRecord.status = 'Approved';
        await reqRecord.save();

        // Update Attendance
        const { userId, date, requestedStatus, monthYear, startTime, endTime } = reqRecord;
        
        // Find attendance doc
        let attendance = await Attendance.findOne({ userId, monthYear });
        
        if (!attendance) {
            attendance = new Attendance({
                userId,
                monthYear,
                records: {},
                summary: {
                    totalHour: 0, totalLateArrival: 0, excessHour: 0, 
                    totalHalfDay: 0, totalPresent: 0, totalAbsent: 0, totalLeave: 0
                }
            });
        }

        // Get or create record for date
        let rec = attendance.records.get(date);
        
        if (!rec) { // If undefined, create new object
                rec = {
                checkin: '', checkout: '', totalHour: 0, excessHour: 0,
                typeOfPresence: 'Absent', halfDay: false
            };
        }
        
        // Update presence type
        rec.typeOfPresence = requestedStatus as any;

        // Update times if provided
        if (startTime && endTime) {
                rec.checkin = startTime;
                rec.checkout = endTime;
                rec.totalHour = calculateDuration(startTime, endTime);
                // Assuming 9 hours standard for excess calculation logic roughly
                rec.excessHour = rec.totalHour > 9 ? parseFloat((rec.totalHour - 9).toFixed(2)) : 0;
        }

        attendance.records.set(date, rec);
        

        // Recalculate summary
        const user = await User.findById(userId);
        attendance.summary = calculateSummary(attendance.records, user);
        
        await attendance.save();

        return new NextResponse(`
            <html><body style="font-family:sans-serif; text-align:center; padding:40px;">
                <h1 style="color:green">Approved</h1>
                <p>Attendance for ${reqRecord.userName} on ${reqRecord.date} updated to <strong>${reqRecord.requestedStatus}</strong>.</p>
            </body></html>
        `, { headers: { 'Content-Type': 'text/html' }});
    }

    return new NextResponse('Invalid action', { status: 400 });

  } catch (error) {
    console.error(error);
    return new NextResponse('Internal Server Error', { status: 500 });
  }
}
