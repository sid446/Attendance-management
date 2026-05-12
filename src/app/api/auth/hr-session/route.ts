import { NextRequest, NextResponse } from 'next/server';
import { getHrOperatorEmailFromRequest } from '@/lib/hrAuthServer';

export async function GET(request: NextRequest) {
  const email = await getHrOperatorEmailFromRequest(request);
  if (!email) {
    return NextResponse.json({ success: false, error: 'Not signed in' }, { status: 401 });
  }
  const role = email === 'it@asija.in' ? 'restricted_admin' : 'admin';
  return NextResponse.json({
    success: true,
    data: { email, role },
  });
}
