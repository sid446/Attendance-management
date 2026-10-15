import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import { getCronSecret, isCronAuthorized } from '@/lib/cronAuth';
import { createSnapshot } from '@/lib/backup';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/**
 * Daily exact copy of the live database into asija_copy_YYYYMMDD.
 * Keeps the last 7 verified copies. A missed day does not delete them. Does not modify live data.
 *
 * Auth: Authorization: Bearer <CRON_SECRET>
 *   or  x-cron-secret: <CRON_SECRET>
 *
 * Suggested schedule (IST): every day 02:00, when nobody is punching.
 */
async function handle(request: NextRequest) {
  if (!getCronSecret()) {
    return NextResponse.json(
      { success: false, error: 'CRON_SECRET (or PENDING_REQUEST_DIGEST_SECRET) is not configured on the server' },
      { status: 500 }
    );
  }
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  try {
    await dbConnect();
    const result = await createSnapshot({ kind: 'daily', actor: 'cron' });
    if (!result.success) {
      return NextResponse.json({ success: false, error: result.error || 'Backup failed' }, { status: 500 });
    }
    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    console.error('Daily backup cron failed:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  return handle(request);
}

export async function POST(request: NextRequest) {
  return handle(request);
}
