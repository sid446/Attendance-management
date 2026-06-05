import { NextRequest, NextResponse } from 'next/server';
import { getEmployeeUserIdFromRequest, employeeAuthUnauthorized } from '@/lib/employeeAuthServer';
import { getHrOperatorEmailFromRequest } from '@/lib/hrAuthServer';

export type EmployeeOrHrSession =
  | { type: 'hr'; email: string }
  | { type: 'employee'; userId: string };

export async function requireEmployeeSession(
  request: NextRequest
): Promise<{ userId: string } | NextResponse> {
  const userId = await getEmployeeUserIdFromRequest(request);
  if (!userId) return employeeAuthUnauthorized();
  return { userId };
}

/** HR console or employee portal session (HR checked first). */
export async function requireEmployeeOrHrSession(
  request: NextRequest
): Promise<EmployeeOrHrSession | NextResponse> {
  const hrEmail = await getHrOperatorEmailFromRequest(request);
  if (hrEmail) return { type: 'hr', email: hrEmail };

  const userId = await getEmployeeUserIdFromRequest(request);
  if (userId) return { type: 'employee', userId };

  return employeeAuthUnauthorized();
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
