import mongoose from 'mongoose';
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

async function run() {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('Connected successfully.');

    const users = await User.find({ isActive: true });
    console.log(`Found ${users.length} active users.`);

    let updatedCount = 0;
    let skippedCount = 0;

    for (const user of users) {
      // 1. Skip articles
      const designation = (user.designation || '').toLowerCase();
      const employmentType = (user.employmentType || '').toLowerCase();
      if (designation.includes('article') || employmentType.includes('article')) {
        skippedCount++;
        continue;
      }

      // 2. Determine base schedule to derive from
      let baseDaily: any = null;
      let currentMondayOut = '';

      if (user.schedules && user.schedules.length > 0) {
        // Get the latest schedule entry by effective date
        const sortedSchedules = [...user.schedules].sort((a, b) => b.effectiveFrom.getTime() - a.effectiveFrom.getTime());
        const latest = sortedSchedules[0];
        baseDaily = latest.daily;
        currentMondayOut = latest.daily.monday?.outTime || '';
      } else {
        // Fallback to legacy fields
        currentMondayOut = user.scheduleInOutTime?.outTime || '';
        baseDaily = {
          monday: user.scheduleInOutTime,
          tuesday: user.scheduleInOutTime,
          wednesday: user.scheduleInOutTime,
          thursday: user.scheduleInOutTime,
          friday: user.scheduleInOutTime,
          saturday: user.scheduleInOutTimeSat,
          sunday: { inTime: '00:00', outTime: '00:00', isHoliday: true }
        };
      }

      // 3. Check condition: Monday Out-Time must be 19:00
      if (currentMondayOut === '19:00') {
        console.log(`Updating user: ${user.name} (Code: ${user.employeeCode || 'N/A'}, Monday Out: ${currentMondayOut})`);

        const winterSchedule = {
          name: "Winter Schedule (Dec-Jan)",
          startMonth: 11, // December (0-indexed)
          endMonth: 0,   // January (0-indexed)
          effectiveFrom: new Date('2025-12-01'),
          daily: {
            monday: { ...JSON.parse(JSON.stringify(baseDaily.monday)), outTime: '18:30' },
            tuesday: { ...JSON.parse(JSON.stringify(baseDaily.tuesday)), outTime: '18:30' },
            wednesday: { ...JSON.parse(JSON.stringify(baseDaily.wednesday)), outTime: '18:30' },
            thursday: { ...JSON.parse(JSON.stringify(baseDaily.thursday)), outTime: '18:30' },
            friday: { ...JSON.parse(JSON.stringify(baseDaily.friday)), outTime: '18:30' },
            saturday: baseDaily.saturday ? { ...JSON.parse(JSON.stringify(baseDaily.saturday)) } : undefined,
            sunday: baseDaily.sunday ? { ...JSON.parse(JSON.stringify(baseDaily.sunday)) } : undefined,
          }
        };

        // Check if this seasonal schedule already exists (idempotency)
        const exists = user.seasonalSchedules?.some(s => 
          s.name === winterSchedule.name && 
          s.effectiveFrom.getTime() === winterSchedule.effectiveFrom.getTime()
        );

        if (!exists) {
          if (!user.seasonalSchedules) user.seasonalSchedules = [];
          user.seasonalSchedules.push(winterSchedule as any);
          await user.save();
          updatedCount++;
        } else {
          console.log(`   - Schedule already exists for ${user.name}, skipping.`);
        }
      }
    }

    console.log('\n--- Summary ---');
    console.log(`Total users processed: ${users.length}`);
    console.log(`Users updated: ${updatedCount}`);
    console.log(`Articles skipped: ${skippedCount}`);
    console.log('Done.');

  } catch (error) {
    console.error('Error running script:', error);
  } finally {
    await mongoose.connection.close();
    process.exit(0);
  }
}

run();
