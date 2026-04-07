import dotenv from 'dotenv';
import mongoose from 'mongoose';
import dbConnect from '../src/lib/mongodb';
import Attendance from '../src/models/Attendance';

dotenv.config({ path: '.env.local' });

const NON_WORKING_TYPES = new Set([
  'Holiday',
  'Sunday',
  'Weekoff',
  'Weekoff - special allowance',
]);

function isSunday(dateStr: string): boolean {
  const d = new Date(dateStr);
  return !Number.isNaN(d.getTime()) && d.getDay() === 0;
}

async function backfillNonWorkingDayAttendance() {
  try {
    await dbConnect();
    console.log('Connected to database');

    const attendances = await Attendance.find({});
    console.log(`Scanned ${attendances.length} attendance documents`);

    let updatedDocuments = 0;
    let updatedRecords = 0;
    let clearedHalfDay = 0;
    let zeroedExcess = 0;
    let updatedSummaries = 0;

    for (const attendance of attendances) {
      if (!attendance.records || attendance.records.size === 0) continue;

      let documentChanged = false;

      attendance.records.forEach((record: any, dateStr: string) => {
        const isNonWorkingDay = NON_WORKING_TYPES.has(record?.typeOfPresence) || isSunday(dateStr);
        if (!isNonWorkingDay) return;

        let recordChanged = false;

        if (record?.halfDay === true) {
          record.halfDay = false;
          clearedHalfDay++;
          recordChanged = true;
        }

        if (typeof record?.excessHour === 'number' && record.excessHour !== 0) {
          record.excessHour = 0;
          zeroedExcess++;
          recordChanged = true;
        }

        if (recordChanged) {
          attendance.records.set(dateStr, record);
          updatedRecords++;
          documentChanged = true;
        }
      });

      if (documentChanged) {
        let totalHalfDay = 0;
        let excessHour = 0;

        attendance.records.forEach((record: any) => {
          if (record?.halfDay) totalHalfDay += 1;
          if (typeof record?.excessHour === 'number') excessHour += record.excessHour;
        });

        if (!attendance.summary) {
          attendance.summary = {
            totalHour: 0,
            totalLateArrival: 0,
            excessHour: 0,
            totalHalfDay: 0,
            totalPresent: 0,
            totalAbsent: 0,
            totalLeave: 0,
          } as any;
        }

        attendance.summary.totalHalfDay = totalHalfDay;
        attendance.summary.excessHour = Number(excessHour.toFixed(2));
        updatedSummaries++;

        await attendance.save();
        updatedDocuments++;
      }
    }

    console.log('Backfill complete.');
    console.log(`Updated attendance documents: ${updatedDocuments}`);
    console.log(`Updated records: ${updatedRecords}`);
    console.log(`halfDay cleared: ${clearedHalfDay}`);
    console.log(`excessHour zeroed: ${zeroedExcess}`);
    console.log(`summary fields updated: ${updatedSummaries}`);
  } catch (error) {
    console.error('Backfill failed:', error);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected from database');
  }
}

backfillNonWorkingDayAttendance();
