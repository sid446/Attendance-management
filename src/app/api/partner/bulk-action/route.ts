// Enum for all typeOfPresence values
export enum TypeOfPresence {
    ThumbMachine = 'ThumbMachine',
    Manual = 'Manual',
    Remote = 'Remote',
    OnLeave = 'On leave',
    Holiday = 'Holiday',
    Absent = 'Absent',
    PresentInOffice = 'Present - in office',
    PresentInOfficeWeekdays = 'Present - in office - weekdays',
    PresentInOfficeWeekoff = 'Present - in office - weekoff',
    PresentClientPlace = 'Present - client place',
    PresentOutstation = 'Present - outstation',
    PresentWeekoff = 'Present - weekoff',
    HalfDayWeekdays = 'Half Day - weekdays',
    HalfDayWeekoff = 'Half Day - weekoff',
    WFHWeekdays = 'WFH - weekdays',
    WFHWeekoff = 'WFH - weekoff',
    WeekoffSpecialAllowance = 'Weekoff - special allowance',
    WeeklyOffPresent = 'Weekly Off - Present (WO-Present)',
    HalfDayHD = 'Half Day (HD)',
    WorkFromHome = 'Work From Home (WFH)',
    WeeklyOffWFH = 'Weekly Off - Work From Home (WO-WFH)',
    OnsitePresence = 'Onsite Presence (OS-P)',
    ThumbMachineNotWorking = 'Thumb machine - not working'
}
import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import AttendanceRequest from '@/models/AttendanceRequest';
import Attendance from '@/models/Attendance';
import User from '@/models/User';
import { getScheduledTimes } from '@/lib/scheduleUtils';
import LeaveTransaction from '@/models/LeaveTransaction';
import { verifyPartnerReviewToken } from '@/lib/partnerReviewToken';
import { transporter, mailOptions } from '@/lib/mailer';

function normalizePartnerName(name: string): string {
    return String(name || '').replace(/[.\s]/g, '').toLowerCase();
}

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
            return NextResponse.json({ success: false, error: 'Invalid JSON body' }, { status: 400 });
        }

        const { action, ids, remark, value, approvedBy, approvedByEmail, accessToken } = body;

        if (!action || !['approve', 'reject'].includes(action)) {
            return NextResponse.json({ success: false, error: 'Invalid action' }, { status: 400 });
        }

        if (!ids || !Array.isArray(ids) || ids.length === 0) {
            return NextResponse.json({ success: false, error: 'Missing or invalid IDs' }, { status: 400 });
        }

        let secureApprovedBy: string | null = null;
        let secureApprovedByEmail: string | null = null;

        if (typeof accessToken === 'string' && accessToken.trim()) {
            const tokenCheck = verifyPartnerReviewToken(accessToken.trim());
            if (!tokenCheck.valid) {
                return NextResponse.json({ success: false, error: tokenCheck.error }, { status: 401 });
            }
            secureApprovedBy = tokenCheck.claims.partnerName;
            secureApprovedByEmail = tokenCheck.claims.partnerEmail;
        } else if (process.env.NODE_ENV === 'production') {
            return NextResponse.json(
                { success: false, error: 'Secure token is required for partner actions' },
                { status: 401 }
            );
        }

        const appliedRemark = remark || (action === 'approve' ? 'Bulk Approved' : 'Bulk Rejected');
        const appliedApprovedBy = secureApprovedBy || approvedBy || 'HR';
        const appliedApprovedByEmail = secureApprovedByEmail || approvedByEmail || 'hr@asija.in';
        let appliedValue: number | undefined;
        if (action === 'approve') {
            if (typeof value === 'number') {
                appliedValue = value;
            } else if (typeof value === 'string' && value.trim() !== '' && !isNaN(parseFloat(value))) {
                appliedValue = parseFloat(value);
            } else {
                appliedValue = 1;
            }
        }

        let successCount = 0;
        const processedRequestsByUser: Record<string, { user: any; requests: any[] }> = {};

        for (const id of ids) {
            const reqRecord = await AttendanceRequest.findById(id);
            if (!reqRecord || reqRecord.status !== 'Pending') continue;

            let isAuthorized = false;
            
            if (!secureApprovedBy) {
                isAuthorized = true; // No token provided or not required
            } else if (normalizePartnerName(reqRecord.partnerName) === normalizePartnerName(secureApprovedBy)) {
                isAuthorized = true;
            } else if (secureApprovedByEmail) {
                const requestUser = await User.findById(reqRecord.userId);
                if (requestUser && requestUser.attendanceEmail && secureApprovedByEmail.toLowerCase() === requestUser.attendanceEmail.toLowerCase()) {
                    isAuthorized = true;
                }
            }

            if (!isAuthorized) {
                return NextResponse.json(
                    { success: false, error: 'Unauthorized: request does not belong to this partner token' },
                    { status: 403 }
                );
            }

            reqRecord.status = action === 'approve' ? 'Approved' : 'Rejected';
            if (action === 'approve') {
                reqRecord.approvedBy = appliedApprovedBy;
                reqRecord.approvedByEmail = appliedApprovedByEmail;
                reqRecord.approvedAt = new Date();
                reqRecord.hrRemarks = appliedRemark;
                if (appliedValue !== undefined) reqRecord.hrValue = String(appliedValue);
            } else {
                reqRecord.rejectedBy = appliedApprovedBy;
                reqRecord.rejectedByEmail = appliedApprovedByEmail;
                reqRecord.rejectedAt = new Date();
                reqRecord.hrRemarks = appliedRemark;
            }
            await reqRecord.save();

            const { userId, date, requestedStatus, monthYear, startTime, endTime } = reqRecord;
            const userObj = await User.findById(userId);

            if (action === 'approve') {
                // Update Attendance Logic
                let attendance = await Attendance.findOne({ userId, monthYear });
                const isNewAttendanceRecord = !attendance;
                
                if (!attendance) {
                    attendance = new Attendance({
                        userId,
                        monthYear,
                        records: new Map(),
                        summary: { totalHour: 0, totalLateArrival: 0, excessHour: 0, totalHalfDay: 0, totalPresent: 0, totalAbsent: 0, totalLeave: 0 }
                    });

                    // Increment leave balance for non-articles if this is a new attendance record for month >= Jan 2026
                    if (monthYear >= '2026-01') {
                        const userForLeave = await User.findById(userId);
                        if (userForLeave && userForLeave.isActive) {
                            const designationLower = (userForLeave.designation || '').toLowerCase();
                            const employmentTypeLower = (userForLeave.employmentType || '').toLowerCase();
                            const isArticle = employmentTypeLower.includes('article') || designationLower.includes('article');
                            
                            if (!isArticle) {
                                const currentEarned = userForLeave.leaveBalance?.earned || 0;
                                const currentUsed = userForLeave.leaveBalance?.used || 0;
                                const currentUsedAfterJan26 = userForLeave.leaveBalance?.usedAfterJan26 || 0;
                                const currentBalanceAsOfJan26 = userForLeave.leaveBalance?.balanceAsOfJan26 || 0;
                                
                                const increment = 2;
                                const newEarned = currentEarned + increment;
                                const newRemaining = currentBalanceAsOfJan26 + newEarned - currentUsed - currentUsedAfterJan26;
                                
                                await User.findByIdAndUpdate(userForLeave._id, {
                                    'leaveBalance.earned': newEarned,
                                    'leaveBalance.remaining': newRemaining,
                                    'leaveBalance.lastUpdated': new Date(),
                                    'leaveBalance.monthlyEarned': 2,
                                });
                                console.log(`Leave balance incremented for user ${userForLeave.name} (new attendance record via bulk approval for ${monthYear})`);
                                try {
                                    await LeaveTransaction.create({
                                        userId: userForLeave._id,
                                        date: new Date().toISOString().split('T')[0],
                                        monthYear,
                                        type: 'earned',
                                        amount: increment,
                                        source: 'attendance-create-increment-bulk',
                                        reference: reqRecord._id?.toString()
                                    });
                                } catch (e) {
                                    console.error('Failed to write LeaveTransaction for bulk attendance-create increment', e);
                                }
                            }
                        }
                    }
                }

                let rec = attendance.records.get(date);
                if (!rec) {
                    rec = {
                        checkin: '', checkout: '', totalHour: 0, excessHour: 0,
                        typeOfPresence: 'Absent', halfDay: false, value: 0
                    };
                }

                                // If existing record was a paid leave and the approved action moves it to non-leave,
                                // remove prior 'used' leave transactions so snapshots stay consistent.
                                const prevRec = attendance.records.get(date);
                                const prevValue = prevRec ? (typeof prevRec.value === 'string' ? parseFloat(prevRec.value) : (prevRec.value || 0)) : 0;
                                const prevIsPaidLeave = !!prevRec && (prevValue >= 1 || (prevRec.typeOfPresence && String(prevRec.typeOfPresence).toLowerCase().includes('leave')));
                                const newIsLeaveRequest = (requestedStatus || '').toLowerCase().includes('leave') || (requestedStatus || '').toLowerCase().includes('absent') || requestedStatus === 'On leave';
                                if (prevIsPaidLeave && !newIsLeaveRequest) {
                                    try {
                                        const { removePaidLeaveForDate } = await import('@/lib/leaveManagement');
                                        await removePaidLeaveForDate(userId, date);
                                        console.log(`Removed prior paid leave transactions for ${userId} on ${date} (bulk HR)`);
                                    } catch (e) {
                                        console.error('Failed to remove prior paid leave transactions in bulk-action', e);
                                    }
                                }

                                 // Fetch user schedule for the day early so mapping logic can use it
                                 let scheduledInTime = '';
                                let scheduledOutTime = '';
                                let scheduledMinutes = 0;
                                if (userObj) {
                                        const schedule = getScheduledTimes(userObj, date);
                                        scheduledInTime = schedule.inTime;
                                        scheduledOutTime = schedule.outTime;
                                        if (scheduledInTime && scheduledOutTime) {
                                                const [schInH, schInM] = scheduledInTime.split(':').map(Number);
                                                const [schOutH, schOutM] = scheduledOutTime.split(':').map(Number);
                                                const schInMin = schInH * 60 + schInM;
                                                const schOutMin = schOutH * 60 + schOutM;
                                                scheduledMinutes = schOutMin - schInMin >= 0 ? schOutMin - schInMin : (24 * 60 + schOutMin - schInMin);
                                        }
                                }

                                rec.typeOfPresence = requestedStatus as any;

                                // Map generic 'Present' or 'Present - in office' (without weekday/weekoff)
                                // to 'Present - in office - weekdays' or 'Present - in office - weekoff'
                                try {
                                    const reqLower = (requestedStatus || '').toLowerCase();
                                    const alreadyQualified = /weekoff|weekday|week-off|weekdays|week day/i.test(requestedStatus || '');
                                    if (reqLower.includes('present') && !alreadyQualified) {
                                        const d = new Date(date);
                                        const isSunday = d.getDay() === 0;
                                        let isHolidaySchedule = false;
                                        if (userObj) {
                                            const sch = getScheduledTimes(userObj, date);
                                            isHolidaySchedule = !!sch.isHoliday;
                                        }
                                        const useWeekoff = isSunday || isHolidaySchedule;
                                        
                                        if (useWeekoff) {
                                            if (reqLower.includes('clientplace') || reqLower.includes('client place')) {
                                                rec.typeOfPresence = 'Present - ClientPlace (Weekoff)';
                                            } else {
                                                rec.typeOfPresence = 'Present - in office - weekoff';
                                            }
                                        } else {
                                            if (reqLower.includes('clientplace') || reqLower.includes('client place')) {
                                                rec.typeOfPresence = 'Present - ClientPlace (Weekdays)';
                                            } else {
                                                rec.typeOfPresence = 'Present - in office - weekdays';
                                            }
                                        }
                                    } else if (requestedStatus === 'Present - ClientPlace (Weekdays)') {
                                        const d = new Date(date);
                                        const isSunday = d.getDay() === 0;
                                        let isHolidaySchedule = false;
                                        if (userObj) {
                                            const sch = getScheduledTimes(userObj, date);
                                            isHolidaySchedule = !!sch.isHoliday;
                                        }
                                        if (isSunday || isHolidaySchedule) {
                                            rec.typeOfPresence = 'Present - ClientPlace (Weekoff)';
                                        }
                                    }
                                } catch (e) {
                                    console.error('Failed to map generic Present to detailed type in bulk action:', e);
                                }

                                // Determine value based on request type
                                const isLeaveRequest = requestedStatus.toLowerCase().includes('leave') ||
                                                                            requestedStatus.toLowerCase().includes('absent') ||
                                                                            requestedStatus === 'On leave';

                                // Helper to check type
                                const isType = (type: string) => requestedStatus.toLowerCase().includes(type.toLowerCase());

                                let leaveIsPaid = false; // Track if this is a paid leave
                                if (isLeaveRequest) {
                                    // For leave requests, calculate paid/unpaid based on balance
                                    // Article employees always get value 0 (no paid leave concept)
                                    // Other employees get value based on their balance
                                    const { calculateLeaveUsage } = await import('@/lib/leaveManagement');
                                    const leaveUsage = await calculateLeaveUsage(userId, date, requestedStatus);
                                    rec.value = leaveUsage.value;
                                    leaveIsPaid = leaveUsage.isPaidLeave;
                                    rec.halfDay = false; // Leave is either full day paid or unpaid
                                } else {
                                    rec.value = appliedValue!;
                                    // Only Half Day types should have halfDay=true
                                    // Other types (WFH-weekoff, Present-weekoff, etc.) with value < 1 are NOT half days
                                    rec.halfDay = false;
                                }

                                // Recalculation for special types
                                let isWeekoff = /weekoff|week-off|week off/i.test(requestedStatus);
                                
                                // If request provides startTime/endTime, use those for editedCheckin/editedCheckout
                                if (startTime && startTime !== '00:00') {
                                    rec.editedCheckin = startTime;
                                }
                                if (endTime && endTime !== '00:00') {
                                    rec.editedCheckout = endTime;
                                }
                                
                                // For weekoff types, use weekday (Monday) schedule instead of actual day schedule
                                let effectiveScheduledMinutes = scheduledMinutes;
                                let effectiveScheduledInTime = scheduledInTime;
                                let effectiveScheduledOutTime = scheduledOutTime;
                                if (isWeekoff && userObj) {
                                    // Get Monday schedule for weekoff calculations
                                    const mondayDate = new Date(date);
                                    // Find next Monday from this date for schedule lookup
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
                                        const mInMin = mInH * 60 + mInM;
                                        const mOutMin = mOutH * 60 + mOutM;
                                        effectiveScheduledMinutes = mOutMin - mInMin >= 0 ? mOutMin - mInMin : (24 * 60 + mOutMin - mInMin);
                                    }
                                }
                                
                                // WFH
                                if (isType('WFH - weekdays')) {
                                    rec.totalHour = Number((rec.value * (effectiveScheduledMinutes / 60)).toFixed(2));
                                    rec.excessHour = Number((rec.totalHour - (effectiveScheduledMinutes / 60)).toFixed(2));
                                    // Set editedCheckin/editedCheckout based on schedule if not already set
                                    if (!rec.editedCheckin || rec.editedCheckin === '00:00') rec.editedCheckin = effectiveScheduledInTime;
                                    if (!rec.editedCheckout || rec.editedCheckout === '00:00') rec.editedCheckout = effectiveScheduledOutTime;
                                } else if (isType('WFH - weekoff')) {
                                    rec.totalHour = 0;
                                    rec.excessHour = Number((rec.value * (effectiveScheduledMinutes / 60)).toFixed(2));
                                    // Set editedCheckin/editedCheckout based on weekday schedule
                                    if (!rec.editedCheckin || rec.editedCheckin === '00:00') rec.editedCheckin = effectiveScheduledInTime;
                                    if (!rec.editedCheckout || rec.editedCheckout === '00:00') rec.editedCheckout = effectiveScheduledOutTime;
                                }
                                // Half Day
                                else if (isType('Half Day - weekdays')) {
                                    rec.value = 0.5;
                                    rec.halfDay = true;
                                    rec.totalHour = Number((0.5 * (effectiveScheduledMinutes / 60)).toFixed(2));
                                    rec.excessHour = Number((rec.totalHour - (effectiveScheduledMinutes / 60)).toFixed(2));
                                    // Set editedCheckin/editedCheckout based on schedule (half day)
                                    if (!rec.editedCheckin || rec.editedCheckin === '00:00') rec.editedCheckin = effectiveScheduledInTime;
                                    if (!rec.editedCheckout || rec.editedCheckout === '00:00') rec.editedCheckout = effectiveScheduledOutTime;
                                } else if (isType('Half Day - weekoff')) {
                                    rec.value = 0.5;
                                    rec.halfDay = true;
                                    rec.totalHour = 0;
                                    rec.excessHour = Number((0.5 * (effectiveScheduledMinutes / 60)).toFixed(2));
                                    // Set editedCheckin/editedCheckout based on weekday schedule
                                    if (!rec.editedCheckin || rec.editedCheckin === '00:00') rec.editedCheckin = effectiveScheduledInTime;
                                    if (!rec.editedCheckout || rec.editedCheckout === '00:00') rec.editedCheckout = effectiveScheduledOutTime;
                                }
                                 // Present - Outstation / ClientPlace
                                 else if (isType('Present - Outstation (Weekdays)') || isType('Present - ClientPlace (Weekdays)')) {
                                     rec.totalHour = Number((rec.value * (effectiveScheduledMinutes / 60)).toFixed(2));
                                     rec.excessHour = Number((rec.totalHour - (effectiveScheduledMinutes / 60)).toFixed(2));
                                 } else if (isType('Present - Outstation (Weekoff)') || isType('Present - ClientPlace (Weekoff)')) {
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
                                // Default: use time if provided (time corrections)
                                else if (startTime && endTime) {
                                        // Use editedCheckin/editedCheckout for corrections (never modify original checkin/checkout)
                                        rec.editedCheckin = startTime;
                                        rec.editedCheckout = endTime;
                                        // Recalculate totalHour and excessHour using edited times
                                        rec.totalHour = calculateDuration(startTime, endTime);
                                        // Recalculate excessHour for this day
                                        const inTime = startTime;
                                        const outTime = endTime;
                                        let dayExcess = 0;
                                        if (scheduledInTime && scheduledOutTime && inTime && outTime && inTime !== '00:00' && outTime !== '00:00') {
                                                const [schInH, schInM] = scheduledInTime.split(':').map(Number);
                                                const [schOutH, schOutM] = scheduledOutTime.split(':').map(Number);
                                                const [actInH, actInM] = inTime.split(':').map(Number);
                                                const [actOutH, actOutM] = outTime.split(':').map(Number);
                                                const schInMin = schInH * 60 + schInM;
                                                const schOutMin = schOutH * 60 + schOutM;
                                                const actInMin = actInH * 60 + actInM;
                                                const actOutMin = actOutH * 60 + actOutM;
                                                const scheduledMinutes = schOutMin - schInMin >= 0 ? schOutMin - schInMin : (24 * 60 + schOutMin - schInMin);
                                                const actualMinutes = actOutMin - actInMin >= 0 ? actOutMin - actInMin : (24 * 60 + actOutMin - actInMin);
                                                if (actualMinutes < scheduledMinutes) {
                                                        dayExcess = -(scheduledMinutes - actualMinutes) / 60;
                                                } else {
                                                        dayExcess = (actualMinutes - scheduledMinutes) / 60;
                                                }
                                        }
                                        rec.excessHour = Number(dayExcess.toFixed(2));
                                        
                                        // Recalculate halfDay based on corrected times
                                        // Default to false, but set true if rules are violated
                                        rec.halfDay = false;
                                        rec.value = 1;
                                        
                                        // Check halfDay rules:
                                        // 1. If checkin is 00:00 but checkout is valid - mark as half day
                                        // 2. For article employees: half-day if arrive after 1 PM
                                        // 3. For others: half-day if arrive after 1 PM AND less than 6 hours worked
                                        const checkinTime = startTime;
                                        const checkoutTime = endTime;
                                        const isArticleship = userObj && userObj.designation && userObj.designation.toLowerCase() === 'article';
                                        
                                        if (checkinTime === '00:00' && checkoutTime !== '00:00' && checkoutTime !== '' && rec.totalHour > 0) {
                                          // Missing check-in but has valid checkout
                                          rec.halfDay = true;
                                          rec.value = 0.5;
                                        } else if (checkinTime !== '00:00') {
                                          const isAfter1PM = checkinTime >= '13:00';
                                          
                                          if (isArticleship) {
                                            // For articleship: half-day if arrive after 1 PM
                                            if (isAfter1PM) {
                                              rec.halfDay = true;
                                              rec.value = 0.5;
                                            }
                                          } else {
                                            // For others: half-day if arrive after 1 PM AND less than 6 hours worked
                                            if (isAfter1PM && rec.totalHour < 6) {
                                              rec.halfDay = true;
                                              rec.value = 0.5;
                                            }
                                          }
                                        }
                                }

                attendance.records.set(date, rec);
                
                // Mark records as modified so Mongoose saves changes to existing Map entries
                attendance.markModified('records');
                
                attendance.summary = calculateSummary(attendance.records, userObj);
                await attendance.save();

                // Update leave balance if this is a paid leave request
                if (isLeaveRequest && leaveIsPaid) {
                  const { updateLeaveBalanceOnApproval } = await import('@/lib/leaveManagement');
                  await updateLeaveBalanceOnApproval(userId, date, true);
                }
            }

            // Collect for email
            const uIdStr = userId.toString();
            if (!processedRequestsByUser[uIdStr]) {
                processedRequestsByUser[uIdStr] = { user: userObj, requests: [] };
            }
            processedRequestsByUser[uIdStr].requests.push(reqRecord);
            successCount++;
        }

        // Send summary emails to each user
        const now = new Date();
        const istDate = now.toLocaleDateString('en-GB', { timeZone: 'Asia/Kolkata' });
        const istTime = now.toLocaleTimeString('en-GB', { timeZone: 'Asia/Kolkata', hour12: true });
        const processingTime = `${istDate} ${istTime} (IST)`;

        for (const uId in processedRequestsByUser) {
            const { user, requests } = processedRequestsByUser[uId];
            if (user && (user.attendanceEmail || user.email)) {
                try {
                    const subject = `Attendance Requests ${action === 'approve' ? 'Approved' : 'Rejected'}`;
                    const requestsHtml = requests.map((req: any) => `
                        <tr style="border-bottom: 1px solid #e5e5e7;">
                            <td style="padding: 12px 0; font-size: 14px; color: #1d1d1f;">${new Date(req.date).toLocaleDateString('en-GB')}</td>
                            <td style="padding: 12px 0; font-size: 14px; color: #1d1d1f; text-align: center;">${req.requestedStatus}</td>
                            <td style="padding: 12px 0; font-size: 14px; color: #1d1d1f; text-align: right;">${req.reason || '-'}</td>
                        </tr>
                    `).join('');

                    const html = `
                        <div style="background-color: #f5f5f7; padding: 40px 20px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #1d1d1f; line-height: 1.5;">
                            <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 20px; overflow: hidden; box-shadow: 0 4px 24px rgba(0,0,0,0.04);">
                                <div style="padding: 40px 40px 20px; text-align: center;">
                                    <img src="https://attendance.asija.in/lg.png" alt="Asija Logo" style="width: 56px; height: 56px; margin-bottom: 24px;">
                                    <h1 style="font-size: 26px; font-weight: 600; margin: 0; letter-spacing: -0.02em;">Bulk Action Update</h1>
                                    <div style="margin-top: 16px; display: inline-block; padding: 6px 14px; border-radius: 20px; font-size: 13px; font-weight: 600; background-color: ${action === 'approve' ? '#e6f4ea' : '#fce8e6'}; color: ${action === 'approve' ? '#008040' : '#d21a0c'}; text-transform: uppercase;">
                                        ${action === 'approve' ? 'Approved' : 'Rejected'}
                                    </div>
                                </div>
                                <div style="padding: 0 40px 40px;">
                                    <p style="font-size: 17px; color: #424245; margin-bottom: 32px; text-align: center;">
                                        Hello ${user.name},<br>Multiple attendance correction requests have been ${action === 'approve' ? 'approved' : 'rejected'}.
                                    </p>
                                    <div style="background-color: #fbfbfd; border-radius: 14px; padding: 24px; border: 1px solid #d2d2d7;">
                                        <table style="width: 100%; border-collapse: collapse;">
                                            <thead>
                                                <tr style="border-bottom: 1px solid #d2d2d7;">
                                                    <th style="padding-bottom: 12px; font-size: 12px; color: #86868b; text-align: left; font-weight: 500;">DATE</th>
                                                    <th style="padding-bottom: 12px; font-size: 12px; color: #86868b; text-align: center; font-weight: 500;">STATUS</th>
                                                    <th style="padding-bottom: 12px; font-size: 12px; color: #86868b; text-align: right; font-weight: 500;">REASON</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                ${requestsHtml}
                                            </tbody>
                                        </table>
                                        <div style="margin-top: 20px;">
                                            <p style="font-size: 14px; color: #86868b; margin-bottom: 4px;">Approver Remarks</p>
                                            <p style="font-size: 14px; font-weight: 600; color: ${action === 'approve' ? '#008040' : '#d21a0c'}; margin: 0;">${appliedRemark || 'N/A'}</p>
                                        </div>
                                        <div style="margin-top: 16px; padding-top: 16px; border-top: 1px solid #e5e5e7;">
                                            <p style="font-size: 12px; color: #86868b; margin: 0;">Processed By: <strong>${appliedApprovedBy}</strong></p>
                                            <p style="font-size: 12px; color: #86868b; margin: 4px 0 0;">Processed On: <strong>${processingTime}</strong></p>
                                        </div>
                                    </div>
                                    <div style="margin-top: 40px; text-align: center;">
                                        <a href="https://attendance.asija.in/employee/dashboard" style="display: inline-block; background-color: #0071e3; color: #ffffff; padding: 12px 32px; border-radius: 980px; font-size: 17px; font-weight: 500; text-decoration: none;">View Dashboard</a>
                                    </div>
                                </div>
                                <div style="background-color: #f5f5f7; padding: 32px 40px; text-align: center; border-top: 1px solid #d2d2d7;">
                                    <p style="font-size: 12px; color: #86868b; margin: 0;">Automated notification from Asija Attendance System.</p>
                                </div>
                            </div>
                        </div>
                    `;

                    await transporter.sendMail({
                        ...mailOptions,
                        to: user.attendanceEmail || user.email,
                        subject,
                        html
                    });
                } catch (e) {
                    console.error('Failed to send bulk action email to', user.email, e);
                }
            }
        }

        return NextResponse.json({ success: true, count: successCount });

    } catch (error) {
        console.error('Bulk Action Error:', error);
        return NextResponse.json({ success: false, error: 'Internal Server Error' }, { status: 500 });
    }
}