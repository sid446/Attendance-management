import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });
console.log('DEBUG MONGODB_URI:', process.env.MONGODB_URI);

import mongoose from 'mongoose';
import dbConnect from '../src/lib/mongodb';
import User from '../src/models/User';

async function migrateEmploymentTypeHistory() {
  try {
    await dbConnect();
    console.log('Connected to database');

    // Find users with employmentType set and no or empty employmentTypeHistory
    const users = await User.find({
      employmentType: { $exists: true, $ne: null },
      $or: [
        { employmentTypeHistory: { $exists: false } },
        { employmentTypeHistory: { $size: 0 } }
      ]
    });
    console.log(`Found ${users.length} users to update`);

    let updatedCount = 0;
    for (const user of users) {
      if (!user.employmentType) continue;
      await User.findByIdAndUpdate(user._id, {
        employmentTypeHistory: [{
          employmentType: user.employmentType,
          effectiveFrom: new Date('2026-01-01')
        }]
      });
      console.log(`[UPDATED] ${user.name}: employmentTypeHistory set to [${user.employmentType}, 2026-01-01]`);
      updatedCount++;
    }

    console.log(`\nMigration complete. Updated ${updatedCount} users.`);
  } catch (error) {
    console.error('Migration failed:', error);
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected from database');
  }
}

migrateEmploymentTypeHistory();
