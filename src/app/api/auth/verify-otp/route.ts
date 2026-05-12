import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import User from '@/models/User';
import HrAuthSession, { defaultHrSessionExpiresAt } from '@/models/HrAuthSession';
import HrOtpPending from '@/models/HrOtpPending';
import { attachHrAuthCookie } from '@/lib/hrAuthCookieServer';
import { employeeOtpStore } from '../login/route';

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

    // Employee/Partner OTP verification
    if (role === 'employee' || role === 'partner') {
      await dbConnect();

      const stored = employeeOtpStore.get(sessionId);

      if (!stored) {
        return NextResponse.json(
          { success: false, error: 'Invalid or expired session. Please login again.' },
          { status: 401 }
        );
      }

      if (stored.expiresAt < Date.now()) {
        employeeOtpStore.delete(sessionId);
        return NextResponse.json(
          { success: false, error: 'OTP has expired. Please login again.' },
          { status: 401 }
        );
      }

      if (stored.otp !== otp) {
        return NextResponse.json({ success: false, error: 'Invalid OTP' }, { status: 401 });
      }

      const user = await User.findById(stored.userId).lean();
      if (!user) {
        employeeOtpStore.delete(sessionId);
        return NextResponse.json({ success: false, error: 'User not found' }, { status: 404 });
      }

      if (user.isActive === false) {
        employeeOtpStore.delete(sessionId);
        return NextResponse.json(
          { success: false, error: 'User account is inactive' },
          { status: 403 }
        );
      }

      employeeOtpStore.delete(sessionId);

      return NextResponse.json({
        success: true,
        data: {
          _id: user._id,
          name: user.name,
          email: user.email,
          odId: user.odId,
          team: user.team,
          workingUnderPartner: user.workingUnderPartner,
        },
      });
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
