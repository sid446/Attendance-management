/**
 * Backfill attendance so schedule holidays (for example Saturday off) are Holiday,
 * for every employee from January 2026 through the current month. Then replay leave
 * for anyone whose days changed.
 */
import dotenv from 'dotenv';
import path from 'path';
import mongoose from 'mongoose';
import dbConnect from '../src/lib/mongodb';
import User from '../src/models/User';
import Attendance from '../src/models/Attendance';
import { calculateSummary } from '../src/lib/attendanceSummaryCalculation';
import {
  loadActiveHolidayNameByDate,
  repairHolidayAndSundayRecords,
} from '../src/lib/fillHolidaySundayAttendance';
import {
  reconcileLeaveFromAttendance,
  currentMonthKey,
  EARN_FROM_MONTH,
} from '../src/lib/leaveReconciliation';

dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

async function main() {
  await dbConnect();
  console.log('Connected. Repairing schedule holidays from', EARN_FROM_MONTH);
  const toMonth = currentMonthKey();
  const holidayNameByDate = await loadActiveHolidayNameByDate([2026]);

  const users = await User.find({})
    .select(
      'name schedules seasonalSchedules scheduleInOutTime scheduleInOutTimeSat scheduleInOutTimeMonth joiningDate inactiveAsOf isActive employmentType'
    )
    .lean();

  const changedUserIds: string[] = [];
  const byName: { name: string; days: number }[] = [];

  for (const user of users) {
    const docs = await Attendance.find({
      userId: user._id,
      monthYear: { $gte: EARN_FROM_MONTH, $lte: toMonth },
    });
    let days = 0;
    for (const attendance of docs) {
      const result = repairHolidayAndSundayRecords(attendance, holidayNameByDate, { user });
      if (result.changed > 0) {
        attendance.summary = calculateSummary(attendance.records as any, user as any);
        attendance.markModified('records');
        attendance.markModified('summary');
        await attendance.save();
        days += result.changed;
      }
    }
    if (days > 0) {
      changedUserIds.push(String(user._id));
      byName.push({ name: String(user.name || ''), days });
    }
  }

  byName.sort((a, b) => b.days - a.days);
  console.log(`Employees updated: ${byName.length}`);
  console.log(JSON.stringify(byName.slice(0, 40), null, 2));

  let leave: Record<string, unknown> | null = null;
  if (changedUserIds.length > 0) {
    const result = await reconcileLeaveFromAttendance({
      fromMonth: EARN_FROM_MONTH,
      toMonth,
      userIds: changedUserIds,
      dryRun: false,
      sampleChangeLimit: 30,
    });
    const padmaja = result.users.find((u) => /padmaja/i.test(u.userName));
    leave = {
      usersProcessed: result.usersProcessed,
      recordsUpdated: result.recordsUpdated,
      padmaja,
    };
  }

  console.log(JSON.stringify({ leave }, null, 2));
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
