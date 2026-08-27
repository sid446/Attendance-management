/**
 * Repair equal / false late-absent punches for a month.
 * Usage:
 *   npx tsx --env-file=.env.local scripts/repair-equal-punches.ts --month=2026-08
 *   npx tsx --env-file=.env.local scripts/repair-equal-punches.ts --month=2026-08 --user-id=...
 */
import dbConnect from '../src/lib/mongodb';
import { repairEqualPunchesForMonth } from '../src/lib/repairEqualPunchTimes';

async function main() {
  await dbConnect();
  const monthYear =
    process.argv.find((a) => a.startsWith('--month='))?.slice(8) || '2026-08';
  const userId =
    process.argv.find((a) => a.startsWith('--user-id='))?.slice(10) ||
    process.argv.find((a) => a.startsWith('--userId='))?.slice(9);

  console.log('Repairing equal punches for', monthYear, userId || '(all users)');
  const result = await repairEqualPunchesForMonth(
    monthYear,
    userId ? { userId } : undefined
  );
  console.log(result);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
