import mongoose from 'mongoose';
import Attendance from '../src/models/Attendance';
import Holiday from '../src/models/Holiday';
import User from '../src/models/User';
import * as dotenv from 'dotenv';
import * as path from 'path';

// Load environment variables from .env.local
dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

const MONGODB_URI = process.env.MONGODB_URI!;

if (!MONGODB_URI) {
  console.error('Please define the MONGODB_URI environment variable inside .env.local');
  process.exit(1);
}

/**
 * Simplified version of calculateSummary from route.ts
 * to update the monthly totals after changing presence types.
 */
function calculateSummary(recordsMap: any, user: any) {
  let totalHour = 0;
  let totalPresent = 0;
  let totalAbsent = 0;
  let totalLeave = 0;
  let totalHalfDay = 0;
  let totalLateArrival = 0;

  const records = Object.fromEntries(recordsMap);

  for (const [dateStr, record] of Object.entries(records) as any[]) {
    const type = record.typeOfPresence || '';
    const isHolidayLike = [
      'Holiday', 'Sunday', 'Weekoff', 'Weekoff - special allowance',
      'Present - in office - weekoff', 'Present - weekoff', 'WFH - weekoff'
    ].includes(type);

    const isLeave = ['Leave', 'On leave'].includes(type);
    const isAbsent = type === 'Absent';

    if (isLeave) {
      totalLeave++;
      totalAbsent++;
      continue;
    }

    if (isAbsent) {
      totalAbsent++;
      continue;
    }

    // Only count hours for weekdays
    if (!isHolidayLike) {
      totalHour += (record.totalHour || 0);
    }

    if (record.halfDay) {
      totalHalfDay++;
    }

    // Basic presence detection
    if (!isHolidayLike) {
      if (record.halfDay || record.totalHour > 0 || (record.checkin && record.checkin !== '00:00')) {
        totalPresent++;
      } else {
        totalAbsent++;
      }
    }
  }

  return {
    totalHour: Number(totalHour.toFixed(2)),
    totalPresent,
    totalAbsent,
    totalLeave,
    totalHalfDay,
    totalLateArrival, // Keep existing if we can't recalculate perfectly without schedule
    excessHour: 0, // Simplified
  };
}

async function run() {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('Connected successfully.');

    // 1. Fetch all holidays
    const holidays = await Holiday.find({ isActive: true });
    const holidayDates = new Set(holidays.map(h => h.date));
    console.log(`Found ${holidayDates.size} holiday dates.`);

    // 2. Fetch all attendance records
    // Ensure User model is registered before populate
    const UserAlias = User; 
    const attendanceDocs = await Attendance.find({}).populate('userId');
    console.log(`Found ${attendanceDocs.length} attendance monthly documents.`);

    let totalUpdatedDays = 0;
    let totalUpdatedDocs = 0;

    for (const doc of attendanceDocs) {
      let docModified = false;
      const records = doc.records; // This is a Map

      for (const [dateStr, record] of records.entries()) {
        const dateObj = new Date(dateStr);
        const isSunday = dateObj.getDay() === 0;
        const isHoliday = holidayDates.has(dateStr);

        if (isSunday || isHoliday) {
          // Check if it's currently marked as weekday presence but should be weekoff
          if (record.typeOfPresence === 'Present - in office - weekdays') {
            console.log(`Updating ${doc.userId?.name || 'Unknown'} on ${dateStr} (${isSunday ? 'Sunday' : 'Holiday'})`);
            
            record.typeOfPresence = 'Present - in office - weekoff';
            record.value = 1;
            if (isSunday && !record.remarks?.includes('Sunday')) {
              record.remarks = (record.remarks ? record.remarks + ' | ' : '') + 'Weekly Off (Sunday)';
            } else if (isHoliday) {
              const hName = holidays.find(h => h.date === dateStr)?.name || 'Holiday';
              if (!record.remarks?.includes(hName)) {
                record.remarks = (record.remarks ? record.remarks + ' | ' : '') + hName;
              }
            }

            records.set(dateStr, record);
            docModified = true;
            totalUpdatedDays++;
          }
        }
      }

      if (docModified) {
        // Recalculate summary so the dashboard is correct
        const updatedSummary = calculateSummary(records, doc.userId);
        
        // Merge with existing summary to keep fields we didn't calculate (like excessHour or late arrivals)
        doc.summary = {
          ...doc.summary,
          totalHour: updatedSummary.totalHour,
          totalPresent: updatedSummary.totalPresent,
          totalAbsent: updatedSummary.totalAbsent,
          totalLeave: updatedSummary.totalLeave,
          totalHalfDay: updatedSummary.totalHalfDay,
        };

        await doc.save();
        totalUpdatedDocs++;
      }
    }

    console.log('\n--- Update Summary ---');
    console.log(`Total monthly documents updated: ${totalUpdatedDocs}`);
    console.log(`Total daily records corrected: ${totalUpdatedDays}`);
    console.log('Database update completed successfully.');

  } catch (error) {
    console.error('Error running script:', error);
  } finally {
    await mongoose.connection.close();
    process.exit(0);
  }
}

run();
