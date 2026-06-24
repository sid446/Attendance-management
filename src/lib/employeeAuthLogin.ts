import { NextResponse } from 'next/server';
import User from '@/models/User';
import { attachEmployeeAuthCookie } from '@/lib/employeeAuthCookieServer';
import { createEmployeeAuthSessionToken } from '@/lib/employeeAuthSessionCreate';
import { employeeAuthUserPayload } from '@/lib/employeeAuthUserPayload';

export async function buildEmployeeLoginResponse(userId: string): Promise<NextResponse> {
  const user = await User.findById(userId).lean();
  if (!user) {
    return NextResponse.json({ success: false, error: 'User not found' }, { status: 404 });
  }

  if (user.isActive === false) {
    return NextResponse.json(
      { success: false, error: 'User account is inactive' },
      { status: 403 }
    );
  }

  let authToken: string;
  try {
    authToken = await createEmployeeAuthSessionToken(String(user._id));
  } catch (sessionErr) {
    console.error('EmployeeAuthSession persist error:', sessionErr);
    return NextResponse.json(
      { success: false, error: 'Could not create session. Please try again.' },
      { status: 500 }
    );
  }

  const res = NextResponse.json({
    success: true,
    data: employeeAuthUserPayload(user),
  });
  attachEmployeeAuthCookie(res, authToken);
  return res;
}
