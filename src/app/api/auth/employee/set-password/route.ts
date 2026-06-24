import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import User from '@/models/User';
import {
  deleteEmployeeOtpSession,
  findValidEmployeeOtpSession,
} from '@/lib/employeeLoginOtp';
import {
  hashEmployeePassword,
  userHasEmployeePassword,
  validateEmployeePassword,
} from '@/lib/employeePassword';
import { buildEmployeeLoginResponse } from '@/lib/employeeAuthLogin';
import { EmployeeOtpPurpose } from '@/models/EmployeeOtpPending';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const sessionId = String(body?.sessionId || '').trim();
    const otp = String(body?.otp || '').trim();
    const newPassword = String(body?.newPassword || '');
    const confirmPassword = String(body?.confirmPassword || '');
    const purposeRaw = String(body?.purpose || 'setup').trim().toLowerCase();
    const purpose: EmployeeOtpPurpose = purposeRaw === 'reset' ? 'reset' : 'setup';

    if (!sessionId || !otp) {
      return NextResponse.json(
        { success: false, error: 'Session ID and OTP are required' },
        { status: 400 }
      );
    }

    const passwordCheck = validateEmployeePassword(newPassword);
    if (!passwordCheck.ok) {
      return NextResponse.json({ success: false, error: passwordCheck.error }, { status: 400 });
    }

    if (newPassword !== confirmPassword) {
      return NextResponse.json(
        { success: false, error: 'Password and confirmation do not match' },
        { status: 400 }
      );
    }

    await dbConnect();

    const pending = await findValidEmployeeOtpSession(sessionId);
    if (!pending) {
      return NextResponse.json(
        { success: false, error: 'Invalid or expired OTP session. Request a new OTP.' },
        { status: 401 }
      );
    }

    if (pending.purpose !== purpose) {
      return NextResponse.json(
        { success: false, error: 'OTP session does not match this action' },
        { status: 400 }
      );
    }

    if (pending.otp !== otp) {
      return NextResponse.json({ success: false, error: 'Invalid OTP' }, { status: 401 });
    }

    const user = await User.findById(pending.userId).select('_id isActive employeePasswordHash').lean();
    if (!user) {
      await deleteEmployeeOtpSession(sessionId);
      return NextResponse.json({ success: false, error: 'User not found' }, { status: 404 });
    }

    if (user.isActive === false) {
      await deleteEmployeeOtpSession(sessionId);
      return NextResponse.json({ success: false, error: 'User account is inactive' }, { status: 403 });
    }

    const hasPassword = userHasEmployeePassword(user);
    if (purpose === 'setup' && hasPassword) {
      await deleteEmployeeOtpSession(sessionId);
      return NextResponse.json(
        { success: false, error: 'Password is already set. Sign in with your password.' },
        { status: 400 }
      );
    }

    if (purpose === 'reset' && !hasPassword) {
      await deleteEmployeeOtpSession(sessionId);
      return NextResponse.json(
        { success: false, error: 'No password is set yet. Complete first-time setup instead.' },
        { status: 400 }
      );
    }

    const employeePasswordHash = await hashEmployeePassword(newPassword);

    await User.updateOne({ _id: user._id }, { $set: { employeePasswordHash } });
    await deleteEmployeeOtpSession(sessionId);

    return buildEmployeeLoginResponse(String(user._id));
  } catch (error) {
    console.error('Employee set-password error:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
