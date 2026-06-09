import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import AttendanceRequest from '@/models/AttendanceRequest';
import Attendance from '@/models/Attendance';
import User from '@/models/User';
import { getScheduledTimes } from '@/lib/scheduleUtils';
import { isAttendanceDatePartnerOnlyIst } from '@/lib/attendanceRequestApprovalWindow';
import {
  applyExtraWorkSlotsToRecord,
  isExtraWorkRequest,
  normalizeExtraWorkSlotsFromRequest,
} from '@/lib/extraWorkRequest';

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
                if (record.totalHour > 0 || record.halfDay || (record.checkin && record.checkin !== '00:00')) totalPresent++;
                else totalAbsent++;
                break;
            default:
                // Only count as absent if not a half-day and no checkin
                if (!record.halfDay && (!record.checkin || record.checkin === '00:00')) totalAbsent++;
                else totalPresent++;
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

            if (!isAttendanceDatePartnerOnlyIst(reqRecord.date)) {
                reqRecord.status = 'PendingHr';
                reqRecord.partnerRemarks = appliedRemark;
                reqRecord.partnerApprovedAt = new Date();
                reqRecord.partnerProposedValue = String(appliedValue);
                await reqRecord.save();
                successCount++;
                continue;
            }

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

            const userObj = await User.findById(userId);

            if (isExtraWorkRequest(reqRecord)) {
                const slots = normalizeExtraWorkSlotsFromRequest(reqRecord);
                applyExtraWorkSlotsToRecord(rec, slots, String(reqRecord._id));
                attendance.records.set(date, rec);
                attendance.markModified('records');
                attendance.summary = calculateSummary(attendance.records, userObj);
                await attendance.save();
                successCount++;
                continue;
            }

            // Update details
            rec.typeOfPresence = requestedStatus as any; // Still use the requested status type (e.g. On leave)
            rec.remarks = appliedRemark; // Apply bulk remark to daily record too? Or just keep in request? Let's add it to record for visibility.
            
            // Fetch user schedule for the day
            let scheduledInTime = '';
            let scheduledOutTime = '';
            let scheduledMinutes = 0;
            if (userObj) {
                const schedule = getScheduledTimes(userObj, date);
                scheduledInTime = schedule.inTime;
                scheduledOutTime = schedule.outTime;
                if (scheduledInTime && scheduledOutTime) {
                    const [inH, inM] = scheduledInTime.split(':').map(Number);
                    const [outH, outM] = scheduledOutTime.split(':').map(Number);
                    scheduledMinutes = (outH * 60 + outM) - (inH * 60 + inM);
                }
            }
            
            // Helper to check type
            const isType = (type: string) => requestedStatus.toLowerCase().includes(type.toLowerCase());
            
            // For weekoff types, use weekday (Monday) schedule instead of actual day schedule
            let isWeekoff = /weekoff|week-off|week off/i.test(requestedStatus);
            let effectiveScheduledMinutes = scheduledMinutes;
            let effectiveScheduledInTime = scheduledInTime;
            let effectiveScheduledOutTime = scheduledOutTime;
            if (isWeekoff && userObj) {
                // Get Monday schedule for weekoff calculations
                const mondayDate = new Date(date);
                const dayOfWeek = mondayDate.getDay();
                const daysUntilMonday = dayOfWeek === 0 ? 1 : (dayOfWeek === 1 ? 0 : 8 - dayOfWeek);
                mondayDate.setDate(mondayDate.getDate() + daysUntilMonday);
                const mondayDateStr = mondayDate.toISOString().split('T')[0];
                const mondaySchedule = getScheduledTimes(userObj, mondayDateStr);
                if (mondaySchedule.inTime && mondaySchedule.outTime) {
                    effectiveScheduledInTime = mondaySchedule.inTime;
                    effectiveScheduledOutTime = mondaySchedule.outTime;
                    const [mInH, mInM] = mondaySchedule.inTime.split(':').map(Number);
                    const [mOutH, mOutM] = mondaySchedule.outTime.split(':').map(Number);
                    effectiveScheduledMinutes = (mOutH * 60 + mOutM) - (mInH * 60 + mInM);
                }
            }
            
            // If request provides startTime/endTime, use those for editedCheckin/editedCheckout
            if (startTime && startTime !== '00:00') {
                rec.editedCheckin = startTime;
            }
            if (endTime && endTime !== '00:00') {
                rec.editedCheckout = endTime;
            }
            
            // Apply value - Half Day types ALWAYS get 0.5 regardless of appliedValue
            if (requestedStatus.includes('Half Day')) {
                rec.value = 0.5;
                rec.halfDay = true;
            } else {
                rec.value = appliedValue;
                // Only Half Day types should have halfDay=true
                // Other types (WFH-weekoff, Present-weekoff, etc.) with value < 1 are NOT half days
                rec.halfDay = false;
            }
            
            // Calculate totalHour and excessHour based on request type
            // WFH
            if (isType('WFH - weekdays')) {
                rec.totalHour = Number((rec.value * (effectiveScheduledMinutes / 60)).toFixed(2));
                rec.excessHour = Number((rec.totalHour - (effectiveScheduledMinutes / 60)).toFixed(2));
                if (!rec.editedCheckin || rec.editedCheckin === '00:00') rec.editedCheckin = effectiveScheduledInTime;
                if (!rec.editedCheckout || rec.editedCheckout === '00:00') rec.editedCheckout = effectiveScheduledOutTime;
            } else if (isType('WFH - weekoff')) {
                rec.totalHour = 0;
                rec.excessHour = Number((rec.value * (effectiveScheduledMinutes / 60)).toFixed(2));
                if (!rec.editedCheckin || rec.editedCheckin === '00:00') rec.editedCheckin = effectiveScheduledInTime;
                if (!rec.editedCheckout || rec.editedCheckout === '00:00') rec.editedCheckout = effectiveScheduledOutTime;
            }
            // Half Day
            else if (isType('Half Day - weekdays')) {
                rec.totalHour = Number((0.5 * (effectiveScheduledMinutes / 60)).toFixed(2));
                rec.excessHour = Number((rec.totalHour - (effectiveScheduledMinutes / 60)).toFixed(2));
                if (!rec.editedCheckin || rec.editedCheckin === '00:00') rec.editedCheckin = effectiveScheduledInTime;
                if (!rec.editedCheckout || rec.editedCheckout === '00:00') rec.editedCheckout = effectiveScheduledOutTime;
            } else if (isType('Half Day - weekoff')) {
                rec.totalHour = 0;
                rec.excessHour = Number((0.5 * (effectiveScheduledMinutes / 60)).toFixed(2));
                if (!rec.editedCheckin || rec.editedCheckin === '00:00') rec.editedCheckin = effectiveScheduledInTime;
                if (!rec.editedCheckout || rec.editedCheckout === '00:00') rec.editedCheckout = effectiveScheduledOutTime;
            }
            // Present - Outstation
            else if (isType('Present - Outstation (Weekdays)')) {
                rec.totalHour = Number((rec.value * (effectiveScheduledMinutes / 60)).toFixed(2));
                rec.excessHour = Number((rec.totalHour - (effectiveScheduledMinutes / 60)).toFixed(2));
            } else if (isType('Present - Outstation (Weekoff)')) {
                rec.totalHour = 0;
                rec.excessHour = Number((rec.value * (effectiveScheduledMinutes / 60)).toFixed(2));
            }
            // Present - ClientPlace
            else if (isType('Present - ClientPlace (Weekdays)')) {
                rec.totalHour = Number((rec.value * (effectiveScheduledMinutes / 60)).toFixed(2));
                rec.excessHour = Number((rec.totalHour - (effectiveScheduledMinutes / 60)).toFixed(2));
            } else if (isType('Present - ClientPlace (Weekoff)')) {
                rec.totalHour = 0;
                rec.excessHour = Number((rec.value * (effectiveScheduledMinutes / 60)).toFixed(2));
            }
            // Present - in office
            else if (isType('Present - in office - weekdays')) {
                rec.totalHour = Number((rec.value * (effectiveScheduledMinutes / 60)).toFixed(2));
                rec.excessHour = Number((rec.totalHour - (effectiveScheduledMinutes / 60)).toFixed(2));
                if (!rec.editedCheckin || rec.editedCheckin === '00:00') rec.editedCheckin = effectiveScheduledInTime;
                if (!rec.editedCheckout || rec.editedCheckout === '00:00') rec.editedCheckout = effectiveScheduledOutTime;
            } else if (isType('Present - in office - weekoff')) {
                rec.totalHour = 0;
                rec.excessHour = Number((rec.value * (effectiveScheduledMinutes / 60)).toFixed(2));
                if (!rec.editedCheckin || rec.editedCheckin === '00:00') rec.editedCheckin = effectiveScheduledInTime;
                if (!rec.editedCheckout || rec.editedCheckout === '00:00') rec.editedCheckout = effectiveScheduledOutTime;
            }
            // Default: use provided times if available
            else if (startTime && endTime && startTime !== '00:00' && endTime !== '00:00') {
                rec.totalHour = calculateDuration(startTime, endTime);
                rec.excessHour = Number((rec.totalHour - (effectiveScheduledMinutes / 60)).toFixed(2));
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
