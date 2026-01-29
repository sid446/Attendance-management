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

// Helper function to calculate summary (copied from request-action/route.ts)
function calculateSummary(records: Map<string, any>, user?: any) {
    let totalHour = 0;
    let totalLateArrival = 0;
    let excessHour = 0;
    let totalHalfDay = 0;
    let totalPresent = 0;
    let totalAbsent = 0;
    let totalLeave = 0;

    records.forEach((record) => {
        totalHour += record.totalHour || 0;
        excessHour += record.excessHour || 0;

        if (record.halfDay) totalHalfDay++;
        
        switch (record.typeOfPresence) {
            case 'On leave': totalLeave++; break;
            case 'Holiday': break;
            case 'ThumbMachine':
            case 'Manual':
            case 'Remote':
            case 'Weekly Off - Present (WO-Present)':
            case 'Half Day (HD)':
            case 'Work From Home (WFH)':
            case 'Weekly Off - Work From Home (WO-WFH)':
            case 'Onsite Presence (OS-P)':
                if (record.totalHour > 0) totalPresent++;
                else totalAbsent++;
                break;
            default: totalAbsent++;
        }
    });

    return { totalHour, totalLateArrival, excessHour, totalHalfDay, totalPresent, totalAbsent, totalLeave };
}

export async function POST(request: NextRequest) {
    try {
        await dbConnect();
        
        let body;
        try {
            body = await request.json();
        } catch (e) {
            return NextResponse.json({ success: false, error: 'Invalid JSON body' }, { status: 400 });
        }

        const { action, ids, remark, value } = body;

        if (!action || !['approve', 'reject'].includes(action)) {
            return NextResponse.json({ success: false, error: 'Invalid action' }, { status: 400 });
        }

        if (!ids || !Array.isArray(ids) || ids.length === 0) {
            return NextResponse.json({ success: false, error: 'Missing or invalid IDs' }, { status: 400 });
        }

        const appliedRemark = remark || (action === 'approve' ? 'Bulk Approved' : 'Bulk Rejected');
        let appliedValue: number | undefined;
        if (action === 'approve') {
            appliedValue = typeof value === 'number' ? value : 1;
        }

        let successCount = 0;

        for (const id of ids) {
            const reqRecord = await AttendanceRequest.findById(id);
            if (!reqRecord || reqRecord.status !== 'Pending') continue;

            reqRecord.status = action === 'approve' ? 'Approved' : 'Rejected';
            reqRecord.partnerRemarks = appliedRemark;
            await reqRecord.save();

            if (action === 'approve') {
                // Update Attendance Logic
                const { userId, date, requestedStatus, monthYear, startTime, endTime } = reqRecord;

                let attendance = await Attendance.findOne({ userId, monthYear });
                if (!attendance) {
                    attendance = new Attendance({
                        userId,
                        monthYear,
                        records: {},
                        summary: { totalHour: 0, totalLateArrival: 0, excessHour: 0, totalHalfDay: 0, totalPresent: 0, totalAbsent: 0, totalLeave: 0 }
                    });
                }

                let rec = attendance.records.get(date);
                if (!rec) {
                    rec = {
                        checkin: '', checkout: '', totalHour: 0, excessHour: 0,
                        typeOfPresence: 'Absent', halfDay: false, value: 0
                    };
                }

                rec.typeOfPresence = requestedStatus as any;
                
                // Determine value based on request type
                const isLeaveRequest = requestedStatus.toLowerCase().includes('leave') ||
                                      requestedStatus.toLowerCase().includes('absent') ||
                                      requestedStatus === 'On leave';
                
                if (isLeaveRequest) {
                  // For leave requests, calculate paid/unpaid based on balance
                  const { calculateLeaveUsage } = await import('@/lib/leaveManagement');
                  const leaveUsage = await calculateLeaveUsage(userId, date, requestedStatus);
                  rec.value = leaveUsage.value;
                  rec.halfDay = false; // Leave is either full day paid or unpaid
                } else {
                  rec.value = appliedValue!;
                  if (rec.value > 0 && rec.value < 1) {
                      rec.halfDay = true;
                  } else {
                      rec.halfDay = false;
                  }
                }

                if (startTime && endTime) {
                    rec.checkin = startTime;
                    rec.checkout = endTime;
                    rec.totalHour = calculateDuration(startTime, endTime);
                }

                attendance.records.set(date, rec);
                
                const user = await User.findById(userId);
                attendance.summary = calculateSummary(attendance.records, user);
                await attendance.save();

                // Update leave balance if this is a leave request
                if (isLeaveRequest && rec.value === 1) {
                  const { updateLeaveBalanceOnApproval } = await import('@/lib/leaveManagement');
                  await updateLeaveBalanceOnApproval(userId, date, true);
                }
            }

            successCount++;
        }

        return NextResponse.json({ success: true, count: successCount });

    } catch (error) {
        console.error('Bulk Action Error:', error);
        return NextResponse.json({ success: false, error: 'Internal Server Error' }, { status: 500 });
    }
}