import { NextRequest, NextResponse } from 'next/server';
import mongoose from 'mongoose';
import dbConnect from '@/lib/mongodb';
import TeamAttendanceAccess from '@/models/TeamAttendanceAccess';
import User from '@/models/User';
import { forbidUnlessSelf, requireEmployeeSession } from '@/lib/employeeRouteAuth';

function normalizeName(value: unknown): string {
  return String(value || '').replace(/[.\s]/g, '').toLowerCase();
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

interface VisibleUser {
  _id?: unknown;
  name?: unknown;
  email?: unknown;
  attendanceEmail?: unknown;
  workingUnderPartner?: unknown;
}

export async function GET(request: NextRequest) {
  try {
    const auth = await requireEmployeeSession(request);
    if (auth instanceof NextResponse) return auth;

    await dbConnect();

    const { searchParams } = new URL(request.url);
    const viewerUserId = String(searchParams.get('viewerUserId') || '').trim();

    const forbidden = forbidUnlessSelf(auth.userId, viewerUserId);
    if (forbidden) return forbidden;

    if (!mongoose.Types.ObjectId.isValid(viewerUserId)) {
      return NextResponse.json({ success: false, error: 'Valid viewerUserId is required' }, { status: 400 });
    }

    const viewer = await User.findById(viewerUserId).lean();
    if (!viewer) {
      return NextResponse.json({ success: false, error: 'Viewer not found' }, { status: 404 });
    }

    const rule = await TeamAttendanceAccess.findOne({ viewerUserId }).lean();
    if (rule && rule.isActive === false) {
      return NextResponse.json({
        success: true,
        data: [],
        access: {
          includeOwnTeam: false,
          includeViewerSelf: false,
          extraUserCount: 0,
          extraPartnerNames: [],
          disabled: true,
        },
      });
    }

    const includeOwnTeam = rule ? rule.includeOwnTeam !== false : true;
    const viewerData = viewer as VisibleUser;
    const visible = new Map<string, VisibleUser>();

    const addUsers = (users: VisibleUser[], opts?: { includeViewer?: boolean }) => {
      users.forEach((user) => {
        const id = String(user?._id || '');
        if (!id) return;
        if (!opts?.includeViewer && id === viewerUserId) return;
        visible.set(id, user);
      });
    };

    if (includeOwnTeam) {
      const normalizedViewerName = normalizeName(viewerData.name);
      const ownTeam = await User.find({ isActive: true }).sort({ name: 1 }).lean();
      addUsers(
        (ownTeam as VisibleUser[]).filter((user) => {
          const workingUnder = normalizeName(user.workingUnderPartner);
          return workingUnder && workingUnder === normalizedViewerName;
        })
      );
    }

    // Employees whose attendance approver inbox matches this viewer (login or approver email).
    const viewerEmails = Array.from(
      new Set(
        [viewerData.email, viewerData.attendanceEmail]
          .map((value) => String(value || '').trim().toLowerCase())
          .filter(Boolean)
      )
    );
    if (viewerEmails.length > 0) {
      addUsers(
        (await User.find({
          isActive: true,
          $or: viewerEmails.map((viewerEmail) => ({
            attendanceEmail: new RegExp(`^${escapeRegex(viewerEmail)}$`, 'i'),
          })),
        })
          .sort({ name: 1 })
          .lean()) as VisibleUser[]
      );
    }

    const extraUserIds = (rule?.extraUserIds || [])
      .map((id: unknown) => String(id || '').trim())
      .filter((id: string) => mongoose.Types.ObjectId.isValid(id));

    const includeViewerSelf = extraUserIds.some((id) => id === viewerUserId);

    if (extraUserIds.length > 0) {
      addUsers(
        (await User.find({ _id: { $in: extraUserIds }, isActive: true }).sort({ name: 1 }).lean()) as VisibleUser[],
        { includeViewer: includeViewerSelf }
      );
    }

    const extraPartnerNames = Array.isArray(rule?.extraPartnerNames) ? rule.extraPartnerNames : [];
    if (extraPartnerNames.length > 0) {
      const partnerPatterns = extraPartnerNames
        .map((name: unknown) => String(name || '').trim())
        .filter(Boolean)
        .map((name: string) => new RegExp(`^${escapeRegex(name)}$`, 'i'));

      if (partnerPatterns.length > 0) {
        addUsers(
          (await User.find({
            isActive: true,
            workingUnderPartner: { $in: partnerPatterns },
          })
            .sort({ name: 1 })
            .lean()) as VisibleUser[]
        );
      }
    }

    if (!includeViewerSelf) {
      visible.delete(viewerUserId);
    }

    const data = Array.from(visible.values()).sort((a, b) =>
      String(a.name || '').localeCompare(String(b.name || ''))
    );

    return NextResponse.json({
      success: true,
      data,
      access: {
        includeOwnTeam,
        includeViewerSelf,
        extraUserCount: extraUserIds.length,
        extraPartnerNames,
      },
    });
  } catch (error) {
    console.error('Visible team attendance fetch error:', error);
    return NextResponse.json({ success: false, error: 'Failed to fetch visible team members' }, { status: 500 });
  }
}
