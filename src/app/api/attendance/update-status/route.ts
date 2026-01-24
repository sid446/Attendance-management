
import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import Attendance from '@/models/Attendance';
import User from '@/models/User';

// Helper to recalculate summary (duplicated from main route, ideally moved to lib)
function calculateSummary(
    records: Map<string, any>,
    user?: any
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
  
// Determine if this is an articleship employee
    const isArticleship = user && user.designation && user.designation.toLowerCase() === 'article';
    // Determine half-day based on user type and check-in time
    let isHalfDay = false;
    if (record.checkin) {
      const checkinTime = record.checkin;
      const isAfter1PM = checkinTime >= '13:00';
      
      if (isArticleship) {
        // For articleship: half-day if arrive after 1 PM
        isHalfDay = isAfter1PM;
      } else {
        // For others: half-day if arrive after 1 PM AND less than 6 hours worked
        isHalfDay = isAfter1PM && (record.totalHour < 6);
      }
    }

    // Update the record's halfDay flag
    record.halfDay = isHalfDay;

    if (record.halfDay) {
        totalHalfDay++;
      }
  
      // Light summary calculation - full logic depends on schedule which we may not have fully here
      // But standard counters usually fine
      
      switch (record.typeOfPresence) {
        case 'ThumbMachine':
        case 'Manual':
        case 'Remote':
        case 'Weekly Off - Present (WO-Present)':
        case 'Half Day (HD)':
        case 'Work From Home (WFH)':
        case 'Weekly Off - Work From Home (WO-WFH)':
        case 'Onsite Presence (OS-P)':
          // Match main summary: only present if totalHour > 0
          if (record.totalHour > 0) {
            totalPresent++;
          } else {
            totalAbsent++;
          }
          break;
        case 'On leave':
          totalLeave++;
          break;
        case 'Holiday':
          break;
        case 'Absent':
          totalAbsent++;
          break;
        default:
          totalAbsent++;
      }
    });

    // Note: Late Arrival Logic omitted for safe updates if schedule not available, 
    // BUT we are only changing Absent->Leave, so Late Arrival shouldn't change for those days. 
    // IF we need full recalc, we need full user object.
  
    return {
      totalHour,
      totalLateArrival, // This might be stale if we don't full recalc, but Absent shouldn't be late.
      excessHour,
      totalHalfDay,
      totalPresent,
      totalAbsent,
      totalLeave,
    };
}

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

                           if (r.checkin && r.checkin > scheduledIn) tLate++;

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
                }
            }
        }

        return NextResponse.json({ success: true, updated: updateCount });

    } catch (e) {
        console.error(e);
        return NextResponse.json({ error: 'Update failed' }, { status: 500 });
    }
}
