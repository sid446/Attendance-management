import dotenv from 'dotenv';

// Load environment variables first
dotenv.config({ path: '.env.local' });

import mongoose from 'mongoose';
import dbConnect from '../src/lib/mongodb';
import User from '../src/models/User';

async function migrateLeaveBalance() {
  try {
    await dbConnect();
    console.log('Connected to database');

    // Find all users (both with and without leaveBalance field)
    const allUsers = await User.find({});

    console.log(`Found ${allUsers.length} total users`);

    // Update each user to reset leave balance
    for (const user of allUsers) {
      // Start fresh - no earned leave initially, only earn when attendance is uploaded
      const initialEarned = 0; // Reset to 0, will earn 2 days per month when attendance is uploaded

      await User.findByIdAndUpdate(user._id, {
        leaveBalance: {
          earned: initialEarned,
          used: user.leaveBalance?.used || 0, // Keep existing used leave
          remaining: initialEarned - (user.leaveBalance?.used || 0),
          lastUpdated: null, // Don't set lastUpdated so leave can be incremented when attendance is uploaded
          monthlyEarned: 2
        }
      });

      console.log(`Updated user ${user.name} (${user._id}) with ${initialEarned} earned leave days (kept ${user.leaveBalance?.used || 0} used days)`);
    }

    console.log('Migration completed successfully');

    // Verify the migration
    const totalUsers = await User.countDocuments();
    const usersWithLeaveBalance = await User.countDocuments({
      leaveBalance: { $exists: true, $ne: null }
    });

    console.log(`Total users: ${totalUsers}`);
    console.log(`Users with leave balance: ${usersWithLeaveBalance}`);

  } catch (error) {
    console.error('Migration failed:', error);
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected from database');
  }
}

// Run the migration
migrateLeaveBalance();