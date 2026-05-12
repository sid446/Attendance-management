import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import HrAuthSession from '@/models/HrAuthSession';
import { getHrAuthTokenFromRequest } from '@/lib/hrAuthServer';
import { clearHrAuthCookie } from '@/lib/hrAuthCookieServer';

export async function POST(request: NextRequest) {
  try {
    await dbConnect();
    const token = getHrAuthTokenFromRequest(request);
    if (token) {
      await HrAuthSession.deleteMany({ token });
    }
    const res = NextResponse.json({ success: true });
    clearHrAuthCookie(res);
    return res;
  } catch (e) {
    console.error('hr-logout', e);
    const res = NextResponse.json({ success: false, error: 'Logout failed' }, { status: 500 });
    clearHrAuthCookie(res);
    return res;
  }
}
