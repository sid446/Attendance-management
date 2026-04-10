import dotenv from 'dotenv';
import mongoose from 'mongoose';
import dbConnect from '../src/lib/mongodb';
import User from '../src/models/User';

dotenv.config({ path: '.env.local' });

const BASELINE_DATE = new Date('2025-12-31T00:00:00.000Z');
const MANAGED_FIELDS = [
  'registeredUnderPartner',
  'workingUnderPartner',
  'basicSalary',
  'laptopAllowance',
  'totalSalaryPerMonth',
  'totalSalaryPerAnnum',
] as const;

type ManagedField = (typeof MANAGED_FIELDS)[number];

function normalizeValue(value: unknown): string {
  if (value === null || value === undefined) return '';
  return String(value).trim();
}

function toDate(value: unknown): Date | null {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value as any);
  return Number.isNaN(d.getTime()) ? null : d;
}

async function backfillManagedFieldHistories() {
  try {
    await dbConnect();
    console.log('Connected to database');

    const users = await User.find({});
    console.log(`Found ${users.length} users`);

    let usersUpdated = 0;
    let fieldsSeeded = 0;
    let fieldsAdjusted = 0;

    for (const user of users) {
      let modified = false;
      const fieldHistories = { ...((user as any).fieldHistories || {}) };

      for (const field of MANAGED_FIELDS) {
        const currentValue = normalizeValue((user as any)[field]);
        if (!currentValue) continue;

        const existingHistory = Array.isArray(fieldHistories[field]) ? [...fieldHistories[field]] : [];

        if (existingHistory.length === 0) {
          fieldHistories[field] = [
            {
              value: currentValue,
              effectiveFrom: BASELINE_DATE,
              effectiveTo: null,
              source: 'system',
            },
          ];
          modified = true;
          fieldsSeeded++;
          continue;
        }

        const sorted = existingHistory
          .map((entry: any) => ({ entry, parsed: toDate(entry?.effectiveFrom) }))
          .sort((a: any, b: any) => {
            const at = a.parsed ? a.parsed.getTime() : Number.MAX_SAFE_INTEGER;
            const bt = b.parsed ? b.parsed.getTime() : Number.MAX_SAFE_INTEGER;
            return at - bt;
          });

        const first = sorted[0]?.entry;
        const firstDate = toDate(first?.effectiveFrom);
        if (!first || !firstDate || firstDate.getTime() !== BASELINE_DATE.getTime()) {
          if (first) {
            first.effectiveFrom = BASELINE_DATE;
            fieldHistories[field] = existingHistory;
            modified = true;
            fieldsAdjusted++;
          }
        }
      }

      if (modified) {
        (user as any).fieldHistories = fieldHistories;
        user.markModified('fieldHistories');
        await user.save();
        usersUpdated++;
      }
    }

    console.log('Backfill complete');
    console.log(`Users updated: ${usersUpdated}`);
    console.log(`Fields seeded: ${fieldsSeeded}`);
    console.log(`Fields adjusted: ${fieldsAdjusted}`);
  } catch (error) {
    console.error('Backfill failed:', error);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected from database');
  }
}

backfillManagedFieldHistories();
