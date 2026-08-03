
import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import Attendance from '@/models/Attendance';
import User from '@/models/User';
import { reapplyExtraWorkEntriesToRecord } from '@/lib/extraWorkRequest';
import { calculateSummary } from '@/lib/attendanceSummaryCalculation';
import { isLaterThanScheduledIn } from '@/lib/attendanceHours';

export async function POST(request: NextRequest) {
    try {
        await dbConnect();
        const { updates, newStatus } = await request.json(); // updates: [{ userId, date, monthYear }]

        if (!updates || !Array.isArray(updates) || updates.length === 0) {
            return NextResponse.json({ success: false }, { status: 400 });
        }

        // Group by user+monthYear to limit DB writes
        // Key: "userId|monthYear" -> [dates...]
        const groups = new Map<string, string[]>();

        for (const up of updates) {
            const key = `${up.userId}|${up.monthYear}`;
            if (!groups.has(key)) groups.set(key, []);
            groups.get(key)?.push(up.date);
        }

        let updateCount = 0;

        for (const [key, dates] of groups.entries()) {
            const [userId, monthYear] = key.split('|');

            const attendance = await Attendance.findOne({ userId, monthYear });
            if (attendance) {
                let modified = false;
                for (const date of dates) {
                    if (attendance.records.has(date)) {
                        const rec = attendance.records.get(date);
                        if (rec) {
                            rec.typeOfPresence = newStatus || 'Leave';
                             // If changing to Leave, assume not Late? 
                             // Usually absent is not late anyway.
                            attendance.records.set(date, rec);
                            modified = true;
                            updateCount++;
                        }
                    }
                }

                if (modified) {
                    // Recalculate summary totals
                     // We need to fetch User details if we want accurate Late Arrival calc, 
                     // but if we just swap counts we can do simpler math.
                     // However, best to be safe.
                    const user = await User.findById(userId);
                    // Use the duplicated logic inside this file or simpler math
                    const calc = calculateSummary(attendance.records, user); 
                    
                    // Preserve existing late calc if possible? No, recalc is safer.
                    // But our local calcSummary above is missing the "Late" logic loop.
                    // Let's copy-paste the loop logic from route.ts in next step if critical, 
                    // OR just act on the counts:
                    // Since Absent -> Leave doesn't affect checkin times or late status (0 hours), 
                    // we can arguably just trust the simple counters.
                    
                    // BUT: totalLateArrival is stored in summary. We must preserve it if we don't recalculate it properly.
                    // The simple calculateSummary above returns 0 for totalLateArrival because logic is missing.
                    // Lets Restore original lateness if the record didn't change 'Present' status?
                    // Actually, if we change Absent -> Leave, 'totalLateArrival' shouldn't change.
                    // So we can just take the old one? No, `calculateSummary` returns a fresh object.
                    
                    // BETTER: Let's impl full logic or partial update.
                    // Let's use `attendance.summary.totalAbsent--` etc? No, risky.
                    
                    // BEST: The code block below includes the relevant logic if user is found.
                    if (user) {
                        // ... (Need full calc logic here for safety? Or just update fields)
                        // For MVP: let's update counters manually which is faster and safer for 'Absent->Leave'
                        
                        // We can iterate again `calculateSummary` is robust. 
                        // Let's Paste full logic into calculateSummary above or here.
                        
                        // RE-INSERT FULL LOGIC:
                        let tHour = 0, tLate = 0, tExcess = 0, tHalf = 0, tPres = 0, tAbs = 0, tLea = 0;
                        attendance.records.forEach((r: any, dStr: string) => { // dStr needed for weekday
                           tHour += r.totalHour || 0;
                           tExcess += r.excessHour || 0;
                           if (r.halfDay) tHalf++;
                           
                           // Late Logic
                           let scheduledIn = '10:00'; 
                           const d = new Date(dStr);
                           const dow = d.getDay();
                           const m = d.getMonth() + 1;
                           if (m === 12 || m === 1) scheduledIn = user.scheduleInOutTimeMonth?.inTime || '09:00';
                           else if (dow === 6) scheduledIn = user.scheduleInOutTimeSat?.inTime || '09:00';
                           else if (dow !== 0) scheduledIn = user.scheduleInOutTime?.inTime || '09:00';
                           if (dow === 0) scheduledIn = user.scheduleInOutTime?.inTime || '09:00';

                           const isPartner = user && (user.category === 'Partner' || (user.designation && user.designation.toLowerCase().includes('partner')));
                           // Halftime can be marked late; partners remain excluded here as before.
                           if (r.checkin && isLaterThanScheduledIn(r.checkin, scheduledIn) && !isPartner) tLate++;

                           // Status (align with global summary logic)
                            switch (r.typeOfPresence) {
                                case 'ThumbMachine':
                                case 'Manual':
                                case 'Remote':
                                case 'Weekly Off - Present (WO-Present)':
                                case 'Half Day (HD)':
                                case 'Work From Home (WFH)':
                                case 'Weekly Off - Work From Home (WO-WFH)':
                                case 'Onsite Presence (OS-P)':
                                  if (r.totalHour > 0) {
                                    tPres++;
                                  } else {
                                    tAbs++;
                                  }
                                  break;
                                case 'On leave':
                                  tLea++;
                                  break;
                                case 'Holiday':
                                  break;
                                case 'Absent':
                                  tAbs++;
                                  break;
                                default:
                                  tAbs++;
                            }
                        });

                        attendance.summary = {
                            totalHour: tHour,
                            totalLateArrival: tLate,
                            excessHour: tExcess,
                            totalHalfDay: tHalf,
                            totalPresent: tPres,
                            totalAbsent: tAbs,
                            totalLeave: tLea
                        };
                    }
                    
                    await attendance.save();

                    // If the newStatus represents a leave/absent change, update leave balances
                    try {
                      const statusLower = (newStatus || '').toString().toLowerCase();
                      const isLeaveRequest = statusLower.includes('leave') || statusLower.includes('absent') || (newStatus === 'On leave');
                      if (isLeaveRequest && user) {
                        const { calculateLeaveUsageForMultipleDays, updateLeaveBalanceOnApproval } = await import('@/lib/leaveManagement');
                        const leaveCalc = await calculateLeaveUsageForMultipleDays(user._id as any, dates, newStatus);
                        if (leaveCalc && Array.isArray(leaveCalc.leaveDetails) && leaveCalc.leaveDetails.length > 0) {
                          // Update leave balances (will internally no-op for unpaid leaves)
                          await updateLeaveBalanceOnApproval(user._id as any, leaveCalc.leaveDetails as any);
                        }
                      }
                    } catch (leaveErr) {
                      console.error('Error updating leave balance for bulk status update:', leaveErr);
                      // Don't fail the entire bulk update if leave update fails
                    }
                }
            }
        }

        return NextResponse.json({ success: true, updated: updateCount });

    } catch (e) {
        console.error(e);
        return NextResponse.json({ error: 'Update failed' }, { status: 500 });
    }
}
