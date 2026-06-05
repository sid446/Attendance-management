import { NextRequest, NextResponse } from 'next/server';
import { issueEmployeeLoginOtp } from '@/lib/employeeLoginOtp';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const rawEmail = String(body?.email || '').trim().toLowerCase();

    const result = await issueEmployeeLoginOtp(rawEmail);
    if (!result.ok) {
      return NextResponse.json({ success: false, error: result.error }, { status: result.status });
    }

    return NextResponse.json({
      success: true,
      data: {
        sessionId: result.sessionId,
        expiresAt: result.expiresAt.toISOString(),
        message: 'OTP sent to your email',
      },
    });
  } catch (error) {
    console.error('Employee Login Error:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
