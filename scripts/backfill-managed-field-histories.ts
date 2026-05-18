import dotenv from 'dotenv';
import mongoose from 'mongoose';
import dbConnect from '../src/lib/mongodb';
import User from '../src/models/User';
import {
  LEGACY_BASELINE_EFFECTIVE_FROM,
  LEGACY_SEED_FIELDS,
  seedFieldHistoryIfMissing,
} from '../src/lib/userFieldHistory';

dotenv.config({ path: '.env.local' });
dotenv.config({ path: '.env' });

async function backfillManagedFieldHistories() {
  try {
    await dbConnect();
    console.log('Connected to database');
    console.log(
      `Baseline effective-from: ${LEGACY_BASELINE_EFFECTIVE_FROM.toISOString().slice(0, 10)}`
    );
    console.log(`Fields: ${LEGACY_SEED_FIELDS.join(', ')}`);

    const users = await User.find({});
    console.log(`Found ${users.length} users`);

    let usersUpdated = 0;
    let segmentsSeeded = 0;

    for (const user of users) {
      let changed = false;
      for (const field of LEGACY_SEED_FIELDS) {
        if (seedFieldHistoryIfMissing(user as any, field, LEGACY_BASELINE_EFFECTIVE_FROM)) {
          changed = true;
          segmentsSeeded += 1;
        }
      }

      if (changed) {
        user.markModified('fieldHistories');
        await user.save();
        usersUpdated += 1;
      }
    }

    console.log('Backfill complete');
    console.log(`Users updated: ${usersUpdated}`);
    console.log(`History segments seeded: ${segmentsSeeded}`);
  } catch (error) {
    console.error('Backfill failed:', error);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected from database');
  }
}

backfillManagedFieldHistories();
