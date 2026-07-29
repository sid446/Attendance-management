import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import AttendanceRequest from '@/models/AttendanceRequest';
import { getHrOperatorEmailFromRequest } from '@/lib/hrAuthServer';
import { daywiseSourceLookupKey } from '@/lib/daywiseAttendanceSource';

/**
 * Approved-request attribution for daywise Source column (covers historical rows
 * that predate approvedBy fields on daily attendance records).
 * GET ?monthYear=YYYY-MM  (repeatable: ?monthYear=a&monthYear=b)
 */
export async function GET(request: NextRequest) {
  try {
    const operatorEmail = await getHrOperatorEmailFromRequest(request);
    if (!operatorEmail) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    await dbConnect();

    const { searchParams } = new URL(request.url);
    const monthYears = searchParams
      .getAll('monthYear')
      .map((m) => m.trim())
      .filter((m) => /^\d{4}-\d{2}$/.test(m));

    if (monthYears.length === 0) {
      return NextResponse.json(
        { success: false, error: 'monthYear query required (YYYY-MM)' },
        { status: 400 }
      );
    }

    const requests = await AttendanceRequest.find({
      status: 'Approved',
      monthYear: { $in: monthYears },
    })
      .select('userId date approvedBy approvedByEmail updatedAt approvedAt')
      .lean();

    // Latest approval wins per user+date
    const sorted = [...requests].sort((a, b) => {
      const at = new Date((a as any).approvedAt || (a as any).updatedAt || 0).getTime();
      const bt = new Date((b as any).approvedAt || (b as any).updatedAt || 0).getTime();
      return at - bt;
    });

    const sources: Record<string, { approvedBy?: string; approvedByEmail?: string }> = {};
    for (const req of sorted) {
      const userId = String((req as any).userId || '');
      const date = String((req as any).date || '').slice(0, 10);
      if (!userId || !date) continue;
      sources[daywiseSourceLookupKey(userId, date)] = {
        approvedBy: (req as any).approvedBy ? String((req as any).approvedBy) : undefined,
        approvedByEmail: (req as any).approvedByEmail
          ? String((req as any).approvedByEmail)
          : undefined,
      };
    }

    return NextResponse.json({ success: true, data: sources });
  } catch (error) {
    console.error('daywise-sources error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to load daywise sources' },
      { status: 500 }
    );
  }
}
