import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import HrPasswordChangePending from '@/models/HrPasswordChangePending';
import { getHrOperatorEmailFromRequest } from '@/lib/hrAuthServer';
import { loadHrConsolePermissionDoc } from '@/lib/hrConsolePermissionDb';
import { assertHrSection, effectiveFromDoc } from '@/lib/hrConsolePermissionUtils';
import { getServiceAdminEmail } from '@/lib/hrServiceEmail';
import { sendOTPEmail } from '@/lib/mailer';

function generateOTP(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

function generateSessionId(): string {
  return Math.random().toString(36).substring(2) + Date.now().toString(36);
}

export async function POST(request: NextRequest) {
  try {
    await dbConnect();
    const operatorEmail = await getHrOperatorEmailFromRequest(request);
    if (!operatorEmail) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const editorDoc = await loadHrConsolePermissionDoc(operatorEmail);
    const editorEffective = effectiveFromDoc(operatorEmail, editorDoc);
    const denied = assertHrSection(editorEffective, 'settings', 'edit');
    if (denied) return denied;

    const otp = generateOTP();
    const sessionId = generateSessionId();
    const serviceEmail = getServiceAdminEmail();

    await HrPasswordChangePending.findOneAndUpdate(
      { sessionId },
      {
        $set: {
          otp,
          requestedBy: operatorEmail,
          expiresAt: new Date(Date.now() + 5 * 60 * 1000),
        },
      },
      { upsert: true }
    );

    try {
      await sendOTPEmail(otp, serviceEmail, {
        subject: 'Attendance Console - HR password change OTP',
        heading: 'HR password change',
      });
    } catch (emailError) {
      console.error('Password change OTP email failed:', emailError);
      return NextResponse.json(
        { success: false, error: 'Failed to send OTP to service email. Please try again.' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        sessionId,
        message: `OTP sent to ${serviceEmail}`,
      },
    });
  } catch (error) {
    console.error('HR password OTP request error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to request password change OTP' },
      { status: 500 }
    );
  }
}
