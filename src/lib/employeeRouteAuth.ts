import { NextRequest, NextResponse } from 'next/server';
import { requireEmployeeAuth } from '@/lib/employeeAuthServer';

export async function requireEmployeeSession(
  request: NextRequest
): Promise<{ userId: string } | NextResponse> {
  return requireEmployeeAuth(request);
}

export function forbidUnlessSelf(
  sessionUserId: string,
  targetUserId: string | null | undefined
): NextResponse | null {
  const target = String(targetUserId || '').trim();
  if (!target || String(sessionUserId) !== target) {
    return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
  }
  return null;
}
