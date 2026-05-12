import { NextRequest } from 'next/server';
import dbConnect from '@/lib/mongodb';
import HrAuthSession from '@/models/HrAuthSession';
import { HR_AUTH_COOKIE_NAME } from '@/lib/hrAuthCookieConstants';

/** Opaque session token from Authorization Bearer (optional) or HttpOnly cookie. */
export function getHrAuthTokenFromRequest(request: NextRequest): string | null {
  const auth = request.headers.get('authorization') || request.headers.get('Authorization');
  if (auth && auth.toLowerCase().startsWith('bearer ')) {
    const t = auth.slice(7).trim();
    if (t) return t;
  }
  const fromCookie = request.cookies.get(HR_AUTH_COOKIE_NAME)?.value;
  if (fromCookie && fromCookie.trim()) return fromCookie.trim();
  return null;
}

export async function getHrOperatorEmailFromRequest(request: NextRequest): Promise<string | null> {
  const token = getHrAuthTokenFromRequest(request);
  if (!token) return null;

  await dbConnect();
  const session = await HrAuthSession.findOne({
    token,
    expiresAt: { $gt: new Date() },
  })
    .select('email')
    .lean();

  return session?.email ? String(session.email).trim().toLowerCase() : null;
}
