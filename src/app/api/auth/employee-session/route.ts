import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import User from '@/models/User';
import { getEmployeeUserIdFromRequest } from '@/lib/employeeAuthServer';
import { employeeAuthUserPayload } from '@/lib/employeeAuthUserPayload';

export async function GET(request: NextRequest) {
  try {
    const userId = await getEmployeeUserIdFromRequest(request);
    if (!userId) {
      return NextResponse.json({ success: false, error: 'Not signed in' }, { status: 401 });
    }

    await dbConnect();
    const user = await User.findById(userId).lean();
    if (!user || user.isActive === false) {
      return NextResponse.json({ success: false, error: 'Not signed in' }, { status: 401 });
    }

    return NextResponse.json({
      success: true,
      data: employeeAuthUserPayload(user),
    });
  } catch (error) {
    console.error('employee-session error:', error);
    return NextResponse.json({ success: false, error: 'Failed to load session' }, { status: 500 });
  }
}
