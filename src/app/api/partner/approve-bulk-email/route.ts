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

// Helper function to calculate summary (copied from request-action/route.ts to avoid circular deps or complex imports for now)
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

        // Simplified summary logic for bulk update
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
            return new NextResponse('Invalid JSON body', { status: 400 });
        }

        const { ids, remark, value } = body;

        if (!ids || !Array.isArray(ids) || ids.length === 0) {
             return new NextResponse('Missing or invalid IDs', { status: 400 });
        }

        // Validate value if needed, but we trust the partner mostly
        const appliedValue = typeof value === 'number' ? value : 1;
        const appliedRemark = remark || 'Bulk Approved';

        const requestIds = ids;
        const results = [];
        let successCount = 0;

        for (const id of requestIds) {
            const reqRecord = await AttendanceRequest.findById(id);
            if (!reqRecord || reqRecord.status !== 'Pending') continue;

            reqRecord.status = 'Approved';
            reqRecord.partnerRemarks = appliedRemark;
            await reqRecord.save();

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

            // Update details
            rec.typeOfPresence = requestedStatus as any; // Still use the requested status type (e.g. On leave)
            rec.remarks = appliedRemark; // Apply bulk remark to daily record too? Or just keep in request? Let's add it to record for visibility.
            
            if (startTime && endTime) {
                rec.checkin = startTime;
                rec.checkout = endTime;
                rec.totalHour = calculateDuration(startTime, endTime);
            }
            
            // Apply Manual Value Override
            rec.value = appliedValue;
            
            // Infer half day flag from value for consistency
            if (rec.value > 0 && rec.value < 1) {
                rec.halfDay = true;
            } else {
                rec.halfDay = false;
            }

            attendance.records.set(date, rec);
            
            const user = await User.findById(userId);
            attendance.summary = calculateSummary(attendance.records, user);
            await attendance.save();
            
            successCount++;
        }

        return NextResponse.json({ success: true, count: successCount });

    } catch (error) {
        console.error('Bulk Approve Error:', error);
        return new NextResponse('Internal Server Error', { status: 500 });
    }
}
