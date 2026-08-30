import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import Fine from '@/models/Fine';
import { requireEmployeeSession } from '@/lib/employeeRouteAuth';

export const dynamic = 'force-dynamic';

/** GET — the signed-in employee's own fine record for a month. */
export async function GET(request: NextRequest) {
  try {
    const auth = await requireEmployeeSession(request);
    if (auth instanceof NextResponse) return auth;

    const monthYear = request.nextUrl.searchParams.get('monthYear')?.trim() || '';
    if (!/^\d{4}-\d{2}$/.test(monthYear)) {
      return NextResponse.json(
        { success: false, error: 'monthYear is required (YYYY-MM)' },
        { status: 400 }
      );
    }

    await dbConnect();

    const fine = await Fine.findOne({ userId: auth.userId, monthYear })
      .select('userId monthYear category fineRecords totalFine totalWarnings')
      .lean();

    return NextResponse.json({ success: true, fine: fine ?? null });
  } catch (error) {
    console.error('Error fetching employee fines:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch fines' },
      { status: 500 }
    );
  }
}
