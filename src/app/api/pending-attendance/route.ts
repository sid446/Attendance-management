import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import PendingAttendance from '@/models/PendingAttendance';
import { reconcilePendingAttendanceForUser } from '@/lib/reconcilePendingAttendance';

/** List pending (or other status) rows for review */
export async function GET(request: NextRequest) {
  try {
    await dbConnect();
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status') || 'pending';
    const monthYear = searchParams.get('monthYear');
    const limit = Math.min(Number(searchParams.get('limit')) || 200, 500);

    const query: Record<string, unknown> = {};
    if (status !== 'all') {
      query.status = status;
    }
    if (monthYear) {
      query.monthYear = monthYear;
    }

    const rows = await PendingAttendance.find(query)
      .sort({ createdAt: -1 })
      .limit(limit)
      .populate('mergedUserId', 'name odId employeeCode')
      .lean();

    return NextResponse.json({ success: true, data: rows });
  } catch (error) {
    console.error('pending-attendance GET:', error);
    return NextResponse.json({ success: false, error: 'Failed to list pending attendance' }, { status: 500 });
  }
}

/** Body: { userId: string } — replays pending rows whose normalized name matches this user's name */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const userId = body?.userId as string | undefined;
    if (!userId?.trim()) {
      return NextResponse.json({ success: false, error: 'Missing userId' }, { status: 400 });
    }

    const result = await reconcilePendingAttendanceForUser(userId.trim());
    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    console.error('pending-attendance POST reconcile:', error);
    return NextResponse.json({ success: false, error: 'Failed to reconcile pending attendance' }, { status: 500 });
  }
}
