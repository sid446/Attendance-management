import { NextRequest, NextResponse } from 'next/server';
import { issueEmployeeOtp } from '@/lib/employeeLoginOtp';
import { EmployeeOtpPurpose } from '@/models/EmployeeOtpPending';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const rawEmail = String(body?.email || '').trim().toLowerCase();
    const purposeRaw = String(body?.purpose || 'setup').trim().toLowerCase();
    const purpose: EmployeeOtpPurpose = purposeRaw === 'reset' ? 'reset' : 'setup';

    const result = await issueEmployeeOtp(rawEmail, purpose);
    if (!result.ok) {
      return NextResponse.json({ success: false, error: result.error }, { status: result.status });
    }

    return NextResponse.json({
      success: true,
      data: {
        sessionId: result.sessionId,
        expiresAt: result.expiresAt.toISOString(),
        purpose: result.purpose,
        message:
          purpose === 'reset'
            ? 'OTP sent to your email for password reset'
            : 'OTP sent to your email to set your password',
      },
    });
  } catch (error) {
    console.error('Employee request-otp error:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
