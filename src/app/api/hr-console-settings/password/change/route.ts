import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import HrPasswordChangePending from '@/models/HrPasswordChangePending';
import { getHrOperatorEmailFromRequest } from '@/lib/hrAuthServer';
import { loadHrConsolePermissionDoc } from '@/lib/hrConsolePermissionDb';
import { assertHrSection, effectiveFromDoc } from '@/lib/hrConsolePermissionUtils';
import { setHrConsolePassword } from '@/lib/hrConsolePassword';

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

    const body = await request.json();
    const sessionId = String(body.sessionId || '').trim();
    const otp = String(body.otp || '').trim();
    const newPassword = String(body.newPassword || '');
    const confirmPassword = String(body.confirmPassword || '');

    if (!sessionId || !otp) {
      return NextResponse.json(
        { success: false, error: 'Session ID and OTP are required' },
        { status: 400 }
      );
    }

    if (!newPassword || newPassword.length < 8) {
      return NextResponse.json(
        { success: false, error: 'New password must be at least 8 characters' },
        { status: 400 }
      );
    }

    if (newPassword !== confirmPassword) {
      return NextResponse.json(
        { success: false, error: 'New password and confirmation do not match' },
        { status: 400 }
      );
    }

    const pending = await HrPasswordChangePending.findOne({ sessionId }).lean();
    if (!pending) {
      return NextResponse.json(
        { success: false, error: 'Invalid or expired OTP session. Request a new OTP.' },
        { status: 401 }
      );
    }

    if (new Date(pending.expiresAt).getTime() < Date.now()) {
      await HrPasswordChangePending.deleteOne({ sessionId });
      return NextResponse.json(
        { success: false, error: 'OTP has expired. Request a new OTP.' },
        { status: 401 }
      );
    }

    if (pending.requestedBy !== operatorEmail) {
      return NextResponse.json(
        { success: false, error: 'OTP session does not match the current admin' },
        { status: 403 }
      );
    }

    if (pending.otp !== otp) {
      return NextResponse.json({ success: false, error: 'Invalid OTP' }, { status: 401 });
    }

    await setHrConsolePassword(newPassword, operatorEmail);
    await HrPasswordChangePending.deleteOne({ sessionId });

    return NextResponse.json({
      success: true,
      data: { message: 'HR console password updated successfully' },
    });
  } catch (error) {
    console.error('HR password change error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to change password' },
      { status: 500 }
    );
  }
}
