import { NextResponse } from 'next/server';
import { HR_AUTH_COOKIE_NAME } from '@/lib/hrAuthCookieConstants';
import { getHrSessionCookieMaxAgeSeconds } from '@/models/HrAuthSession';

const secureCookie = process.env.NODE_ENV === 'production';

export function attachHrAuthCookie(res: NextResponse, token: string): void {
  res.cookies.set(HR_AUTH_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: secureCookie,
    path: '/',
    maxAge: getHrSessionCookieMaxAgeSeconds(),
  });
}

export function clearHrAuthCookie(res: NextResponse): void {
  res.cookies.set(HR_AUTH_COOKIE_NAME, '', {
    httpOnly: true,
    sameSite: 'lax',
    secure: secureCookie,
    path: '/',
    maxAge: 0,
  });
}
