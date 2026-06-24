import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import User from '@/models/User';
import { userHasEmployeePassword } from '@/lib/employeePassword';

const EMAIL_DOMAIN = '@asija.in';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const rawEmail = String(body?.email || '').trim().toLowerCase();

    if (!rawEmail) {
      return NextResponse.json({ success: false, error: 'Email is required' }, { status: 400 });
    }

    if (!rawEmail.endsWith(EMAIL_DOMAIN)) {
      return NextResponse.json(
        { success: false, error: `Only ${EMAIL_DOMAIN} emails are allowed` },
        { status: 400 }
      );
    }

    await dbConnect();

    const user = await User.findOne({ email: rawEmail })
      .select('_id isActive employeePasswordHash')
      .lean();

    if (!user) {
      return NextResponse.json({ success: false, error: 'User not found with this email' }, { status: 404 });
    }

    if (user.isActive === false) {
      return NextResponse.json({ success: false, error: 'User account is inactive' }, { status: 403 });
    }

    return NextResponse.json({
      success: true,
      data: {
        hasPassword: userHasEmployeePassword(user),
      },
    });
  } catch (error) {
    console.error('Employee check-email error:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
