import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import { sendPendingRequestDigestEmails } from '@/lib/pendingRequestDigest';

/**
 * Saturday (or any day) pending-request digest for attendance approvers.
 *
 * Auth: Authorization: Bearer <CRON_SECRET>
 *   or  x-cron-secret: <CRON_SECRET>
 * Env: CRON_SECRET or PENDING_REQUEST_DIGEST_SECRET
 *
 * Query:
 *   dryRun=1 — build recipient list without sending mail
 *
 * Suggested schedule (IST): every Saturday 08:00
 *   Example (cron-job.org / Task Scheduler calling this URL with the secret).
 */
function getCronSecret(): string {
  return (
    process.env.CRON_SECRET?.trim() ||
    process.env.PENDING_REQUEST_DIGEST_SECRET?.trim() ||
    ''
  );
}

function isAuthorized(request: NextRequest): boolean {
  const expected = getCronSecret();
  if (!expected) return false;

  const auth = request.headers.get('authorization') || '';
  if (auth.toLowerCase().startsWith('bearer ')) {
    const token = auth.slice(7).trim();
    if (token && token === expected) return true;
  }

  const headerSecret = request.headers.get('x-cron-secret')?.trim();
  if (headerSecret && headerSecret === expected) return true;

  // Allow secret in query only outside production (local testing).
  if (process.env.NODE_ENV !== 'production') {
    const q = request.nextUrl.searchParams.get('secret');
    if (q && q === expected) return true;
  }

  return false;
}

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

  if (!isAuthorized(request)) {
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

    const result = await sendPendingRequestDigestEmails({ baseUrl, dryRun, sampleTo });

    return NextResponse.json({
      success: true,
      dryRun,
      sampleTo: result.sampleTo,
      message: dryRun
        ? 'Dry run complete — no emails sent'
        : sampleTo
          ? `Sample digest sent to ${sampleTo}`
          : `Sent ${result.sentCount} digest email(s)`,
      ...result,
    });
  } catch (error) {
    console.error('Pending request digest cron failed:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to send pending request digests' },
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
