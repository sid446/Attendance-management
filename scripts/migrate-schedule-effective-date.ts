import dotenv from 'dotenv';
import mongoose from 'mongoose';
import dbConnect from '../src/lib/mongodb';
import User from '../src/models/User';

dotenv.config({ path: '.env.local' });

async function migrateScheduleEffectiveDate() {
  try {
    await dbConnect();
    console.log('Connected to database');

    const fromDate = new Date('2026-01-01T00:00:00.000Z');
    const toDate = new Date('2025-12-31T00:00:00.000Z');

    const users = await User.find({
      schedules: {
        $elemMatch: {
          effectiveFrom: {
            $gte: new Date('2026-01-01T00:00:00.000Z'),
            $lt: new Date('2026-01-02T00:00:00.000Z'),
          },
        },
      },
    });

    console.log(`Found ${users.length} users with schedule effectiveFrom on 2026-01-01`);

    let updatedUsers = 0;
    let updatedEntries = 0;

    for (const user of users) {
      let changed = false;
      const schedules = Array.isArray(user.schedules) ? [...user.schedules] : [];

      for (const entry of schedules) {
        const effective = entry?.effectiveFrom ? new Date(entry.effectiveFrom as any) : null;
        if (!effective || Number.isNaN(effective.getTime())) continue;

        if (effective.getTime() >= fromDate.getTime() && effective.getTime() < new Date('2026-01-02T00:00:00.000Z').getTime()) {
          entry.effectiveFrom = toDate as any;
          changed = true;
          updatedEntries++;
        }
      }

      if (changed) {
        schedules.sort((a: any, b: any) => new Date(a.effectiveFrom).getTime() - new Date(b.effectiveFrom).getTime());
        user.schedules = schedules as any;
        await user.save();
        updatedUsers++;
      }
    }

    console.log(`Migration complete. Updated ${updatedUsers} users and ${updatedEntries} schedule entries.`);
  } catch (error) {
    console.error('Migration failed:', error);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected from database');
  }
}

migrateScheduleEffectiveDate();
