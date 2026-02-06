import dotenv from 'dotenv';

// Load environment variables first
dotenv.config({ path: '.env.local' });

import mongoose from 'mongoose';
import dbConnect from '../src/lib/mongodb';
import User from '../src/models/User';

async function migrateAttendanceEmail() {
  try {
    await dbConnect();
    console.log('Connected to database');

    // Fetch all users
    const allUsers = await User.find({});
    console.log(`Found ${allUsers.length} total users`);

    // Create a lookup map by name for partner email lookup
    const userMapByName = new Map<string, typeof allUsers[0]>();
    for (const user of allUsers) {
      if (user.name) {
        // Store with normalized name (lowercase, trimmed)
        userMapByName.set(user.name.toLowerCase().trim(), user);
        // Also store with dots replaced by spaces
        userMapByName.set(user.name.toLowerCase().trim().replace(/\./g, ' '), user);
        // Also store with spaces replaced by dots
        userMapByName.set(user.name.toLowerCase().trim().replace(/\s+/g, '.'), user);
      }
    }

    let updatedCount = 0;
    let skippedCount = 0;
    let noPartnerCount = 0;
    let partnerNotFoundCount = 0;

    // Update each user's attendanceEmail based on their workingUnderPartner
    for (const user of allUsers) {
      if (!user.workingUnderPartner) {
        // No partner assigned - ensure attendanceEmail is set to user's own email
        if (!user.attendanceEmail) {
          await User.findByIdAndUpdate(user._id, {
            attendanceEmail: user.email
          });
          console.log(`[NO PARTNER] ${user.name}: Set attendanceEmail to own email (${user.email})`);
          noPartnerCount++;
        } else {
          skippedCount++;
        }
        continue;
      }

      // Look up partner's email
      const partnerName = user.workingUnderPartner.trim().toLowerCase();
      const partnerUser = userMapByName.get(partnerName) ||
                          userMapByName.get(partnerName.replace(/\s+/g, '.')) ||
                          userMapByName.get(partnerName.replace(/\./g, ' '));

      if (!partnerUser) {
        console.log(`[PARTNER NOT FOUND] ${user.name}: Could not find partner "${user.workingUnderPartner}"`);
        // Fall back to user's own email if not already set
        if (!user.attendanceEmail) {
          await User.findByIdAndUpdate(user._id, {
            attendanceEmail: user.email
          });
          console.log(`  -> Set attendanceEmail to own email (${user.email})`);
        }
        partnerNotFoundCount++;
        continue;
      }

      const partnerEmail = partnerUser.attendanceEmail || partnerUser.email;

      // Update attendanceEmail to partner's email
      if (user.attendanceEmail !== partnerEmail) {
        const oldEmail = user.attendanceEmail || '(not set)';
        await User.findByIdAndUpdate(user._id, {
          attendanceEmail: partnerEmail
        });
        console.log(`[UPDATED] ${user.name}: ${oldEmail} -> ${partnerEmail} (Partner: ${user.workingUnderPartner})`);
        updatedCount++;
      } else {
        skippedCount++;
      }
    }

    console.log('\n=== Migration Summary ===');
    console.log(`Total users: ${allUsers.length}`);
    console.log(`Updated: ${updatedCount}`);
    console.log(`Skipped (already correct): ${skippedCount}`);
    console.log(`No partner assigned (set to own email): ${noPartnerCount}`);
    console.log(`Partner not found: ${partnerNotFoundCount}`);

  } catch (error) {
    console.error('Migration failed:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\nDisconnected from database');
  }
}

// Run the migration
migrateAttendanceEmail();
