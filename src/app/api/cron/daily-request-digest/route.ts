import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import { getCronSecret, isCronAuthorized } from '@/lib/cronAuth';
import { sendDailyRequestDigestEmails } from '@/lib/dailyRequestDigest';

/**
 * Daily digest of yesterday's still-pending attendance requests (one email per partner).
 *
 * Auth: Authorization: Bearer <CRON_SECRET>
 *   or  x-cron-secret: <CRON_SECRET>
 * Env: CRON_SECRET or PENDING_REQUEST_DIGEST_SECRET
 *
 * Query:
 *   dryRun=1 — build recipient list without sending mail
 *   sampleTo=email — send one preview to that address
 *
 * Suggested schedule (IST): every day 08:00
 */
async function handle(request: NextRequest) {
  if (!getCronSecret()) {
    return NextResponse.json(
      {
        success: false,
        error:
          'CRON_SECRET (or PENDING_REQUEST_DIGEST_SECRET) is not configured on the server',
      },
      { status: 500 }
    );
  }

  if (!isCronAuthorized(request)) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  try {
    await dbConnect();

    const dryRun =
      request.nextUrl.searchParams.get('dryRun') === '1' ||
      request.nextUrl.searchParams.get('dryRun') === 'true';
    const sampleTo = request.nextUrl.searchParams.get('sampleTo')?.trim() || undefined;

    const baseUrl =
      process.env.NEXT_PUBLIC_BASE_URL ||
      request.headers.get('origin') ||
      'https://attendance.asija.in';

    const result = await sendDailyRequestDigestEmails({ baseUrl, dryRun, sampleTo });

    return NextResponse.json({
      success: true,
      dryRun,
      sampleTo: result.sampleTo,
      message: dryRun
        ? 'Dry run complete — no emails sent'
        : sampleTo
          ? `Sample daily digest sent to ${sampleTo}`
          : `Sent ${result.sentCount} daily digest email(s)`,
      ...result,
    });
  } catch (error) {
    console.error('Daily request digest cron failed:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to send daily request digests' },
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
