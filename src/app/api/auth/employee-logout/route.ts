import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import EmployeeAuthSession from '@/models/EmployeeAuthSession';
import { getEmployeeAuthTokenFromRequest } from '@/lib/employeeAuthServer';
import { clearEmployeeAuthCookie } from '@/lib/employeeAuthCookieServer';

export async function POST(request: NextRequest) {
  try {
    await dbConnect();
    const token = getEmployeeAuthTokenFromRequest(request);
    if (token) {
      await EmployeeAuthSession.deleteMany({ token });
    }
    const res = NextResponse.json({ success: true });
    clearEmployeeAuthCookie(res);
    return res;
  } catch (e) {
    console.error('employee-logout', e);
    const res = NextResponse.json({ success: false, error: 'Logout failed' }, { status: 500 });
    clearEmployeeAuthCookie(res);
    return res;
  }
}
