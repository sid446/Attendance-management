import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import User from '@/models/User';
import { createPartnerReviewToken } from '@/lib/partnerReviewToken';
import { requireEmployeeSession } from '@/lib/employeeRouteAuth';
import { getVisibleTeamMembersForViewer } from '@/lib/teamVisibilityForViewer';
import { formatPartnerNameForReview } from '@/lib/selfApproveAttendanceRequests';

export async function POST(request: NextRequest) {
  try {
    const auth = await requireEmployeeSession(request);
    if (auth instanceof NextResponse) return auth;

    await dbConnect();

    const user = await User.findById(auth.userId).select('name email').lean();
    if (!user) {
      return NextResponse.json({ success: false, error: 'User not found' }, { status: 404 });
    }

    const { members } = await getVisibleTeamMembersForViewer(auth.userId);
    if (members.length === 0) {
      return NextResponse.json(
        { success: false, error: 'You do not have permission to review team attendance requests' },
        { status: 403 }
      );
    }

    const partnerName = formatPartnerNameForReview(String(user.name || ''));
    const partnerEmail = String(user.email || '').trim();
    if (!partnerName || !partnerEmail) {
      return NextResponse.json(
        { success: false, error: 'User profile is missing name or email' },
        { status: 400 }
      );
    }

    const token = createPartnerReviewToken({ partnerName, partnerEmail });

    return NextResponse.json({
      success: true,
      data: {
        token,
      },
    });
  } catch (error) {
    console.error('Create partner review token error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to create review access token' },
      { status: 500 }
    );
  }
}
