/**
 * Migrate User person-name fields from dotted form (A.K.Sharma) to spaced form (A K Sharma).
 *
 * Updates:
 * - name
 * - workingUnderPartner
 * - registeredUnderPartner
 * - fieldHistories.workingUnderPartner[].value
 * - fieldHistories.registeredUnderPartner[].value
 *
 * Usage:
 *   npx tsx --env-file=.env.local scripts/migrate-names-dots-to-spaces.ts --dry-run
 *   npx tsx --env-file=.env.local scripts/migrate-names-dots-to-spaces.ts --apply
 */
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

import dbConnect from '../src/lib/mongodb';
import User from '../src/models/User';
import { normalizeStoredPersonName } from '../src/lib/attendanceNameMatch';

const PARTNER_HISTORY_FIELDS = ['workingUnderPartner', 'registeredUnderPartner'] as const;

function needsNormalize(value: unknown): boolean {
  if (typeof value !== 'string' || !value.includes('.')) return false;
  return normalizeStoredPersonName(value) !== value.trim();
}

async function main() {
  const apply = process.argv.includes('--apply');
  const dryRun = !apply;

  await dbConnect();
  console.log(dryRun ? 'DRY RUN — no writes' : 'APPLY — writing changes');

  const users = await User.find({}).select(
    'name odId employeeCode workingUnderPartner registeredUnderPartner fieldHistories'
  );
  console.log(`Loaded ${users.length} users`);

  let usersTouched = 0;
  let nameChanges = 0;
  let partnerFieldChanges = 0;
  let historyEntryChanges = 0;

  for (const user of users) {
    let dirty = false;
    const beforeName = user.name;

    if (needsNormalize(user.name)) {
      const next = normalizeStoredPersonName(user.name);
      console.log(`  name: "${beforeName}" → "${next}" (${user.odId || user.employeeCode || user._id})`);
      if (!dryRun) user.name = next;
      nameChanges++;
      dirty = true;
    }

    for (const field of PARTNER_HISTORY_FIELDS) {
      const current = (user as any)[field];
      if (needsNormalize(current)) {
        const next = normalizeStoredPersonName(String(current));
        console.log(`  ${field}: "${current}" → "${next}" (${user.name})`);
        if (!dryRun) (user as any)[field] = next;
        partnerFieldChanges++;
        dirty = true;
      }
    }

    if (user.fieldHistories && typeof user.fieldHistories === 'object') {
      for (const field of PARTNER_HISTORY_FIELDS) {
        const history = (user.fieldHistories as any)[field];
        if (!Array.isArray(history)) continue;
        let historyDirty = false;
        for (const entry of history) {
          if (!entry || typeof entry.value !== 'string') continue;
          if (!needsNormalize(entry.value)) continue;
          const next = normalizeStoredPersonName(entry.value);
          console.log(
            `  fieldHistories.${field}: "${entry.value}" → "${next}" (${user.name || beforeName})`
          );
          if (!dryRun) entry.value = next;
          historyEntryChanges++;
          historyDirty = true;
        }
        if (historyDirty) {
          dirty = true;
          if (!dryRun) user.markModified(`fieldHistories.${field}`);
        }
      }
    }

    if (dirty) {
      usersTouched++;
      if (!dryRun) await user.save();
    }
  }

  console.log('\n--- Summary ---');
  console.log(`Users touched: ${usersTouched}`);
  console.log(`name changes: ${nameChanges}`);
  console.log(`partner field changes: ${partnerFieldChanges}`);
  console.log(`history entry changes: ${historyEntryChanges}`);
  if (dryRun) {
    console.log('\nRe-run with --apply to write these changes.');
  } else {
    console.log('\nDone.');
  }

  process.exit(0);
}

main().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
