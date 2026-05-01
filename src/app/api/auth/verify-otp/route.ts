import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import User from '@/models/User';
import { hrOtpStore, employeeOtpStore } from '../login/route';

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

    // HR/Admin OTP verification
    if (!role || role === 'hr') {
      const stored = hrOtpStore.get(sessionId);

      if (!stored) {
        return NextResponse.json(
          { success: false, error: 'Invalid or expired session. Please login again.' },
          { status: 401 }
        );
      }

      // Check expiration
      if (stored.expiresAt < Date.now()) {
        hrOtpStore.delete(sessionId);
        return NextResponse.json(
          { success: false, error: 'OTP has expired. Please login again.' },
          { status: 401 }
        );
      }

      // Verify OTP
      if (stored.otp !== otp) {
        return NextResponse.json(
          { success: false, error: 'Invalid OTP' },
          { status: 401 }
        );
      }

      // OTP verified - remove from store
      hrOtpStore.delete(sessionId);

      // Generate auth token (simple approach - in production use JWT)
      const authToken =
        Math.random().toString(36).substring(2) +
        Date.now().toString(36) +
        Math.random().toString(36).substring(2);

      // Role-based access control (RBAC) - server side logic
      const userRole = stored.email.toLowerCase() === 'it@asija.in' ? 'restricted_admin' : 'admin';

      return NextResponse.json({
        success: true,
        data: {
          authToken,
          email: stored.email,
          role: userRole,
          message: 'Login successful',
        },
      });
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
