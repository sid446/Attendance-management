import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import User from '@/models/User';
import HrAuthSession, { defaultHrSessionExpiresAt } from '@/models/HrAuthSession';
import HrOtpPending from '@/models/HrOtpPending';
import { attachHrAuthCookie } from '@/lib/hrAuthCookieServer';
import { attachEmployeeAuthCookie } from '@/lib/employeeAuthCookieServer';
import { createEmployeeAuthSessionToken } from '@/lib/employeeAuthSessionCreate';
import { employeeAuthUserPayload } from '@/lib/employeeAuthUserPayload';
import {
  deleteEmployeeOtpSession,
  findValidEmployeeOtpSession,
} from '@/lib/employeeLoginOtp';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { sessionId, otp, role } = body;

    if (!sessionId || !otp) {
      return NextResponse.json(
        { success: false, error: 'Session ID and OTP are required' },
        { status: 400 }
      );
    }

    // HR/Admin OTP verification (pending OTP stored in Mongo — survives multi-instance / serverless)
    if (!role || role === 'hr') {
      await dbConnect();
      const sid = String(sessionId || '').trim();
      const otpStr = String(otp || '').trim();

      const pending = await HrOtpPending.findOne({ sessionId: sid }).lean();
      if (!pending) {
        return NextResponse.json(
          { success: false, error: 'Invalid or expired session. Please login again.' },
          { status: 401 }
        );
      }

      if (new Date(pending.expiresAt).getTime() < Date.now()) {
        await HrOtpPending.deleteOne({ sessionId: sid });
        return NextResponse.json(
          { success: false, error: 'OTP has expired. Please login again.' },
          { status: 401 }
        );
      }

      if (pending.otp !== otpStr) {
        return NextResponse.json({ success: false, error: 'Invalid OTP' }, { status: 401 });
      }

      await HrOtpPending.deleteOne({ sessionId: sid });

      const emailLower = String(pending.email || '').trim().toLowerCase();

      // Generate auth token (simple approach - in production use JWT)
      const authToken =
        Math.random().toString(36).substring(2) +
        Date.now().toString(36) +
        Math.random().toString(36).substring(2);

      try {
        await HrAuthSession.findOneAndUpdate(
          { token: authToken },
          { $set: { email: emailLower, expiresAt: defaultHrSessionExpiresAt() } },
          { upsert: true, new: true }
        );
      } catch (sessionErr) {
        console.error('HrAuthSession persist error:', sessionErr);
        return NextResponse.json(
          { success: false, error: 'Could not create session. Please try again.' },
          { status: 500 }
        );
      }

      const userRole = emailLower === 'it@asija.in' ? 'restricted_admin' : 'admin';

      const res = NextResponse.json({
        success: true,
        data: {
          email: pending.email,
          role: userRole,
          message: 'Login successful',
        },
      });
      attachHrAuthCookie(res, authToken);
      return res;
    }

    // Employee OTP verification — password must be set via /api/auth/employee/set-password
    if (role === 'employee') {
      return NextResponse.json(
        {
          success: false,
          error:
            'Employee OTP sign-in is no longer supported. Use password login, or verify OTP when setting or resetting your password.',
        },
        { status: 400 }
      );
    }

    // Partner OTP verification
    if (role === 'partner') {
      await dbConnect();

      const sid = String(sessionId || '').trim();
      const otpStr = String(otp || '').trim();
      const pending = await findValidEmployeeOtpSession(sid);

      if (!pending) {
        return NextResponse.json(
          { success: false, error: 'Invalid or expired session. Please login again.' },
          { status: 401 }
        );
      }

      if (pending.otp !== otpStr) {
        return NextResponse.json({ success: false, error: 'Invalid OTP' }, { status: 401 });
      }

      const user = await User.findById(pending.userId).lean();
      if (!user) {
        await deleteEmployeeOtpSession(sid);
        return NextResponse.json({ success: false, error: 'User not found' }, { status: 404 });
      }

      if (user.isActive === false) {
        await deleteEmployeeOtpSession(sid);
        return NextResponse.json(
          { success: false, error: 'User account is inactive' },
          { status: 403 }
        );
      }

      await deleteEmployeeOtpSession(sid);

      const userId = String(user._id);
      let authToken: string;
      try {
        authToken = await createEmployeeAuthSessionToken(userId);
      } catch (sessionErr) {
        console.error('EmployeeAuthSession persist error:', sessionErr);
        return NextResponse.json(
          { success: false, error: 'Could not create session. Please try again.' },
          { status: 500 }
        );
      }

      const res = NextResponse.json({
        success: true,
        data: employeeAuthUserPayload(user),
      });
      attachEmployeeAuthCookie(res, authToken);
      return res;
    }

    return NextResponse.json(
      { success: false, error: 'Unsupported role' },
      { status: 400 }
    );
  } catch (error) {
    console.error('OTP verification error:', error);
    return NextResponse.json(
      { success: false, error: 'An error occurred during verification' },
      { status: 500 }
    );
  }
}
