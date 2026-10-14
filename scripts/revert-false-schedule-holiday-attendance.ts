/**
 * Remove Saturday/weekday "Weekly Off" marks that were written because a blank
 * or 00:00 in-time was treated as a schedule holiday.
 *
 * Days whose schedule Holiday checkbox is on, Sundays, and company holidays
 * are left as they are.
 *
 *   npx tsx --env-file=.env.local scripts/revert-false-schedule-holiday-attendance.ts
 *   npx tsx --env-file=.env.local scripts/revert-false-schedule-holiday-attendance.ts --apply
 */
import dotenv from 'dotenv';
import path from 'path';
import mongoose from 'mongoose';
import dbConnect from '../src/lib/mongodb';
import User from '../src/models/User';
import Attendance from '../src/models/Attendance';
import AttendanceRequest from '../src/models/AttendanceRequest';
import { calculateSummary } from '../src/lib/attendanceSummaryCalculation';
import {
  loadActiveHolidayNameByDate,
  revertFalseScheduleHolidayRecords,
} from '../src/lib/fillHolidaySundayAttendance';
import {
  reconcileLeaveFromAttendance,
  currentMonthKey,
  EARN_FROM_MONTH,
} from '../src/lib/leaveReconciliation';

dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

async function main() {
  const apply = process.argv.includes('--apply');
  await dbConnect();
  const toMonth = currentMonthKey();
  console.log(apply ? 'APPLY' : 'DRY RUN', EARN_FROM_MONTH, '→', toMonth);

  const holidayNameByDate = await loadActiveHolidayNameByDate([2026]);
  const holidayGrants = await AttendanceRequest.find({
    status: 'Approved',
    requestedStatus: 'Holiday',
    date: { $gte: `${EARN_FROM_MONTH}-01`, $lte: `${toMonth}-31` },
  })
    .select('userId date')
    .lean();
  const preserveByUser = new Map<string, Set<string>>();
  for (const grant of holidayGrants) {
    const id = String(grant.userId);
    const dates = preserveByUser.get(id) || new Set<string>();
    dates.add(String(grant.date).slice(0, 10));
    preserveByUser.set(id, dates);
  }
  console.log('Approved holiday grants kept:', holidayGrants.length);

  const users = await User.find({})
    .select(
      'name schedules seasonalSchedules scheduleInOutTime scheduleInOutTimeSat scheduleInOutTimeMonth joiningDate inactiveAsOf isActive employmentType designation category'
    )
    .lean();

  const changedUserIds: string[] = [];
  const absentUserIds: string[] = [];
  const byName: { name: string; deleted: number; absent: number; worked: number; remarks: number }[] = [];

  for (const user of users) {
    const docs = await Attendance.find({
      userId: user._id,
      monthYear: { $gte: EARN_FROM_MONTH, $lte: toMonth },
    });
    let deleted = 0;
    let absent = 0;
    let worked = 0;
    let remarks = 0;
    const samples: string[] = [];
    for (const attendance of docs) {
      const result = revertFalseScheduleHolidayRecords(attendance, holidayNameByDate, {
        user,
        preserveDates: preserveByUser.get(String(user._id)),
      });
      if (result.changed === 0) continue;
      for (const change of result.changes) {
        if (samples.length < 40) {
          samples.push(`${change.date} ${change.action} ${change.fromType} → ${change.toType || '(removed)'}`);
        }
      }
      deleted += result.deleted;
      absent += result.restoredAbsent;
      worked += result.restoredWorked;
      remarks += result.remarksCleared;
      if (apply) {
        attendance.summary = calculateSummary(attendance.records as any, user as any);
        attendance.markModified('records');
        attendance.markModified('summary');
        await attendance.save();
      } else {
        attendance.markModified('records');
      }
    }
    if (deleted + absent + worked + remarks > 0) {
      changedUserIds.push(String(user._id));
      if (absent > 0) absentUserIds.push(String(user._id));
      const row = {
        name: String((user as { name?: string }).name || ''),
        deleted,
        absent,
        worked,
        remarks,
      };
      byName.push(row);
      console.log(row.name);
      for (const line of samples) console.log(' ', line);
    }
  }

  byName.sort((a, b) => b.deleted + b.absent + b.worked + b.remarks - (a.deleted + a.absent + a.worked + a.remarks));
  console.log(`Employees affected: ${byName.length}`);
  console.log(JSON.stringify(byName.slice(0, 50), null, 2));
  const totals = byName.reduce(
    (acc, row) => {
      acc.deleted += row.deleted;
      acc.absent += row.absent;
      acc.worked += row.worked;
      acc.remarks += row.remarks;
      return acc;
    },
    { deleted: 0, absent: 0, worked: 0, remarks: 0 }
  );
  console.log('totals', totals);

  if (apply && absentUserIds.length > 0) {
    const leave = await reconcileLeaveFromAttendance({
      fromMonth: EARN_FROM_MONTH,
      toMonth,
      userIds: absentUserIds,
      dryRun: false,
      sampleChangeLimit: 20,
    });
    console.log(
      JSON.stringify(
        {
          leaveUsers: leave.usersProcessed,
          leaveRecordsUpdated: leave.recordsUpdated,
        },
        null,
        2
      )
    );
  }

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
