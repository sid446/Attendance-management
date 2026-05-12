import { NextRequest, NextResponse } from 'next/server';
import { assignPendingAttendanceToUser } from '@/lib/reconcilePendingAttendance';

/** Body: { pendingId: string, userId: string } — HR confirms machine name belongs to this employee */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const pendingId = body?.pendingId as string | undefined;
    const userId = body?.userId as string | undefined;
    if (!pendingId?.trim() || !userId?.trim()) {
      return NextResponse.json(
        { success: false, error: 'Missing pendingId or userId' },
        { status: 400 }
      );
    }

    const result = await assignPendingAttendanceToUser(pendingId.trim(), userId.trim());
    if (result.error) {
      return NextResponse.json(
        { success: false, error: result.error, data: result },
        { status: result.error.includes('not found') ? 404 : 400 }
      );
    }

    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    console.error('pending-attendance/assign POST:', error);
    return NextResponse.json({ success: false, error: 'Failed to assign pending attendance' }, { status: 500 });
  }
}
