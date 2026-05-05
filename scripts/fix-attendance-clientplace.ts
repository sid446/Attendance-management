import dbConnect from '../src/lib/mongodb';
import Attendance from '../src/models/Attendance';
import Holiday from '../src/models/Holiday';
import User from '../src/models/User';
import * as dotenv from 'dotenv';
import path from 'path';

// Load environment variables from .env.local
dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

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
    
    const type = record.typeOfPresence || '';
    if (type.includes('Leave') || type === 'On leave') {
        totalLeave++;
    } else if (type === 'Holiday' || type === 'Sunday' || type === 'Weekoff') {
        // Do not count as present or absent
    } else if (type === 'Absent') {
        totalAbsent++;
    } else {
        // Present types
        if (record.value > 0 || record.totalHour > 0 || record.excessHour > 0) {
            totalPresent += record.value || 1;
        } else {
            totalAbsent++;
        }
    }
  });

  return { totalHour, totalLateArrival, excessHour, totalHalfDay, totalPresent, totalAbsent, totalLeave };
}

async function fixAttendanceData() {
  try {
    console.log('Connecting to database...');
    await dbConnect();
    console.log('Connected.');

    const allHolidays = await Holiday.find({ isActive: true });
    const holidayDates = new Set(allHolidays.map(h => h.date));
    console.log(`Found ${holidayDates.size} active holidays.`);

    const allUsers = await User.find({});
    const userMap = new Map(allUsers.map(u => [u._id.toString(), u]));
    console.log(`Cached ${allUsers.length} users.`);

    const attendanceDocs = await Attendance.find({});
    console.log(`Processing ${attendanceDocs.length} attendance documents...`);

    const { getScheduledTimes } = await import('../src/lib/scheduleUtils');

    let updatedDocsCount = 0;
    let totalRecordsFixed = 0;

    for (const doc of attendanceDocs) {
      let docModified = false;
      const records = doc.records;

      if (!records) continue;

      const user = userMap.get(doc.userId.toString());
      if (!user) {
        console.log(`User not found for doc ${doc._id}`);
        continue;
      }

      // Handle Map structure
      if (records instanceof Map) {
        for (const [dateStr, record] of records.entries()) {
          const dateObj = new Date(dateStr);
          const isSunday = dateObj.getDay() === 0;
          const isHoliday = holidayDates.has(dateStr);
          const isHolidayOrSunday = isSunday || isHoliday;

          let wasFixed = false;
          
          // 1. Status normalization (only on Sundays/Holidays)
          if (isHolidayOrSunday) {
            if (record.typeOfPresence === 'Present - ClientPlace (Weekdays)') {
              record.typeOfPresence = 'Present - ClientPlace (Weekoff)';
              wasFixed = true;
            } else if (record.typeOfPresence === 'WFH - weekdays') {
              record.typeOfPresence = 'WFH - weekoff';
              wasFixed = true;
            } else if (record.typeOfPresence === 'Half Day - weekdays') {
              record.typeOfPresence = 'Half Day - weekoff';
              wasFixed = true;
            } else if (record.typeOfPresence === 'Present - in office - weekdays') {
              record.typeOfPresence = 'Present - in office - weekoff';
              wasFixed = true;
            }
          }

          // 2. Time and Excess Hour fix (on ALL days)
          const isWorkType = record.typeOfPresence && (
            record.typeOfPresence.includes('ClientPlace') || 
            record.typeOfPresence.includes('WFH') || 
            record.typeOfPresence.includes('Present - in office') ||
            record.typeOfPresence.includes('Half Day')
          );

          if (isWorkType) {
            let sch;
            if (isHolidayOrSunday) {
              const mondayDate = new Date(dateStr);
              const dayOfWeek = mondayDate.getDay();
              const daysUntilMonday = dayOfWeek === 0 ? 1 : (8 - dayOfWeek);
              mondayDate.setDate(mondayDate.getDate() + daysUntilMonday);
              const mondayStr = mondayDate.toISOString().split('T')[0];
              sch = getScheduledTimes(user, mondayStr);
            } else {
              sch = getScheduledTimes(user, dateStr);
            }

            if (sch && sch.inTime && sch.outTime && sch.inTime !== '00:00') {
              // If times are missing, fill them
              const isMissingTimes = (!record.checkin || record.checkin === '00:00' || record.checkin === '') && 
                                     (!record.checkout || record.checkout === '00:00' || record.checkout === '');
              if (isMissingTimes) {
                record.checkin = sch.inTime;
                record.checkout = sch.outTime;
                record.editedCheckin = sch.inTime;
                record.editedCheckout = sch.outTime;
              }
              
              const currentIn = record.editedCheckin || record.checkin;
              const currentOut = record.editedCheckout || record.checkout;
              
              if (currentIn && currentOut && currentIn !== '00:00') {
                const [h1, m1] = currentIn.split(':').map(Number);
                const [h2, m2] = currentOut.split(':').map(Number);
                let diff = (h2 * 60 + m2) - (h1 * 60 + m1);
                if (diff < 0) diff += 24 * 60;
                let calculatedHours = Math.round((diff / 60) * 100) / 100;

                if (record.halfDay || (record.typeOfPresence && record.typeOfPresence.includes('Half Day'))) {
                  calculatedHours = Math.round((calculatedHours / 2) * 100) / 100;
                }

                // Recalculate scheduled hours for excess calculation
                const [schInH, schInM] = sch.inTime.split(':').map(Number);
                const [schOutH, schOutM] = sch.outTime.split(':').map(Number);
                let schDiff = (schOutH * 60 + schOutM) - (schInH * 60 + schInM);
                if (schDiff < 0) schDiff += 24 * 60;
                const scheduledHours = schDiff / 60;

                const prevTotal = record.totalHour;
                const prevExcess = record.excessHour;

                if (isHolidayOrSunday) {
                  record.totalHour = 0;
                  record.excessHour = calculatedHours;
                } else {
                  record.totalHour = calculatedHours;
                  record.excessHour = Number((calculatedHours - scheduledHours).toFixed(2));
                }
                
                if (record.totalHour !== prevTotal || record.excessHour !== prevExcess) {
                    wasFixed = true;
                }
              }
            }
          }

          if (wasFixed) {
            docModified = true;
            totalRecordsFixed++;
          }
        }
      }

      if (docModified) {
        doc.summary = calculateSummary(doc.records, user);
        doc.markModified('records');
        doc.markModified('summary');
        await doc.save();
        updatedDocsCount++;
      }
    }

    console.log(`\nMigration Summary:`);
    console.log(`------------------`);
    console.log(`Total attendance documents scanned: ${attendanceDocs.length}`);
    console.log(`Total documents updated: ${updatedDocsCount}`);
    console.log(`Total daily records recalculated: ${totalRecordsFixed}`);
    
    process.exit(0);
  } catch (error) {
    console.error('Error during migration:', error);
    process.exit(1);
  }
}

fixAttendanceData();
