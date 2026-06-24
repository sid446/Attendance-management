import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import User from '@/models/User';
import { verifyEmployeePassword } from '@/lib/employeePassword';
import { buildEmployeeLoginResponse } from '@/lib/employeeAuthLogin';

const EMAIL_DOMAIN = '@asija.in';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const rawEmail = String(body?.email || '').trim().toLowerCase();
    const password = String(body?.password || '');

    if (!rawEmail || !password) {
      return NextResponse.json(
        { success: false, error: 'Email and password are required' },
        { status: 400 }
      );
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

    if (!user || !user.employeePasswordHash) {
      return NextResponse.json(
        { success: false, error: 'Invalid email or password' },
        { status: 401 }
      );
    }

    if (user.isActive === false) {
      return NextResponse.json({ success: false, error: 'User account is inactive' }, { status: 403 });
    }

    const valid = await verifyEmployeePassword(password, user.employeePasswordHash);
    if (!valid) {
      return NextResponse.json(
        { success: false, error: 'Invalid email or password' },
        { status: 401 }
      );
    }

    return buildEmployeeLoginResponse(String(user._id));
  } catch (error) {
    console.error('Employee password login error:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
