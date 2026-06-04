import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import EmployeeAuthSession from '@/models/EmployeeAuthSession';
import { EMPLOYEE_AUTH_COOKIE_NAME } from '@/lib/employeeAuthCookieConstants';

export function getEmployeeAuthTokenFromRequest(request: NextRequest): string | null {
  const auth = request.headers.get('authorization') || request.headers.get('Authorization');
  if (auth && auth.toLowerCase().startsWith('bearer ')) {
    const t = auth.slice(7).trim();
    if (t) return t;
  }
  const fromCookie = request.cookies.get(EMPLOYEE_AUTH_COOKIE_NAME)?.value;
  if (fromCookie && fromCookie.trim()) return fromCookie.trim();
  return null;
}

export async function getEmployeeUserIdFromRequest(request: NextRequest): Promise<string | null> {
  const token = getEmployeeAuthTokenFromRequest(request);
  if (!token) return null;

  await dbConnect();
  const session = await EmployeeAuthSession.findOne({
    token,
    expiresAt: { $gt: new Date() },
  })
    .select('userId')
    .lean();

  if (!session?.userId) return null;
  return String(session.userId);
}

export function employeeAuthUnauthorized(): NextResponse {
  return NextResponse.json({ success: false, error: 'Not signed in' }, { status: 401 });
}

/** Require a valid employee session; returns userId or a 401 response. */
export async function requireEmployeeAuth(
  request: NextRequest
): Promise<{ userId: string } | NextResponse> {
  const userId = await getEmployeeUserIdFromRequest(request);
  if (!userId) return employeeAuthUnauthorized();
  return { userId };
}
