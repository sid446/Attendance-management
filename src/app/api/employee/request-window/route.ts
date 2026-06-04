import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import { getEffectiveRequestWindowBoundsForUser } from '@/lib/attendanceRequestWindowDb';
import { forbidUnlessSelf, requireEmployeeSession } from '@/lib/employeeRouteAuth';

export async function GET(request: NextRequest) {
  try {
    const auth = await requireEmployeeSession(request);
    if (auth instanceof NextResponse) return auth;

    await dbConnect();
    const userId = request.nextUrl.searchParams.get('userId')?.trim();
    if (!userId) {
      return NextResponse.json({ success: false, error: 'userId is required' }, { status: 400 });
    }

    const forbidden = forbidUnlessSelf(auth.userId, userId);
    if (forbidden) return forbidden;

    const bounds = await getEffectiveRequestWindowBoundsForUser(userId);
    return NextResponse.json({
      success: true,
      data: {
        earliestDate: bounds.earliestDate,
        latestDate: bounds.latestDate,
        config: bounds.config,
      },
    });
  } catch (error) {
    console.error('Employee request window GET error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to load request window' },
      { status: 500 }
    );
  }
}
