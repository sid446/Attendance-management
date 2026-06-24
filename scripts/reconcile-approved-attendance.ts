/**
 * Apply approved attendance requests that were never written to monthly attendance.
 *
 * Usage:
 *   npx tsx --env-file=.env.local scripts/reconcile-approved-attendance.ts --userId=ID --monthYear=2026-06
 *   npx tsx --env-file=.env.local scripts/reconcile-approved-attendance.ts --monthYear=2026-06
 */
import dbConnect from '../src/lib/mongodb';
import AttendanceRequest from '../src/models/AttendanceRequest';
import { reconcileApprovedRequestsForMonth } from '../src/lib/applyApprovedAttendanceRequest';

function readArg(name: string): string | undefined {
  const prefix = `--${name}=`;
  const hit = process.argv.find((arg) => arg.startsWith(prefix));
  return hit ? hit.slice(prefix.length) : undefined;
}

async function main() {
  const userId = readArg('userId');
  const monthYear = readArg('monthYear');

  if (!monthYear) {
    console.error('Pass --monthYear=YYYY-MM (optional --userId=...)');
    process.exit(1);
  }

  await dbConnect();

  if (userId) {
    const repaired = await reconcileApprovedRequestsForMonth(userId, monthYear);
    console.log(`User ${userId}: repaired ${repaired} day(s) for ${monthYear}`);
    process.exit(0);
  }

  const userIds = await AttendanceRequest.distinct('userId', {
    monthYear,
    status: 'Approved',
  });

  let total = 0;
  for (const id of userIds) {
    const repaired = await reconcileApprovedRequestsForMonth(String(id), monthYear);
    if (repaired > 0) {
      console.log(`User ${id}: repaired ${repaired} day(s)`);
      total += repaired;
    }
  }

  console.log(`Done. Repaired ${total} day(s) across ${userIds.length} user(s) for ${monthYear}.`);
  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
