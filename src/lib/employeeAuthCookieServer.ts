import { NextResponse } from 'next/server';
import { EMPLOYEE_AUTH_COOKIE_NAME } from '@/lib/employeeAuthCookieConstants';
import { getEmployeeSessionCookieMaxAgeSeconds } from '@/models/EmployeeAuthSession';

const secureCookie = process.env.NODE_ENV === 'production';

export function attachEmployeeAuthCookie(res: NextResponse, token: string): void {
  res.cookies.set(EMPLOYEE_AUTH_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: secureCookie,
    path: '/',
    maxAge: getEmployeeSessionCookieMaxAgeSeconds(),
  });
}

export function clearEmployeeAuthCookie(res: NextResponse): void {
  res.cookies.set(EMPLOYEE_AUTH_COOKIE_NAME, '', {
    httpOnly: true,
    sameSite: 'lax',
    secure: secureCookie,
    path: '/',
    maxAge: 0,
  });
}
