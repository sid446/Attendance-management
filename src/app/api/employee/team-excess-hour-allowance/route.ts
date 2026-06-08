import { NextRequest, NextResponse } from 'next/server';
import mongoose from 'mongoose';
import dbConnect from '@/lib/mongodb';
import User from '@/models/User';
import {
  computeDailyExcessBreakdown,
  computeRawExcessForUserMonth,
  deleteDayExcessApproval,
  fetchAllowancesForTeamMonth,
  upsertDayExcessApproval,
} from '@/lib/excessHourAllowanceDb';
import { forbidUnlessSelf, requireEmployeeSession } from '@/lib/employeeRouteAuth';

function normalizeName(value: unknown): string {
  return String(value || '').replace(/[.\s]/g, '').toLowerCase();
}

interface LeanUser {
  _id?: unknown;
  name?: unknown;
  email?: unknown;
  odId?: unknown;
  employeeCode?: unknown;
  workingUnderPartner?: unknown;
  isActive?: boolean;
}

function toMember(user: LeanUser) {
  return {
    _id: String(user._id || ''),
    name: String(user.name || ''),
    email: String(user.email || ''),
    odId: String(user.odId || ''),
    employeeCode: String(user.employeeCode || ''),
    workingUnderPartner: String(user.workingUnderPartner || ''),
  };
}

async function getOwnTeam(viewer: LeanUser): Promise<LeanUser[]> {
  const normalizedViewerName = normalizeName(viewer.name);
  if (!normalizedViewerName) return [];

  const activeUsers = await User.find({ isActive: true })
    .select('name email odId employeeCode workingUnderPartner')
    .sort({ name: 1 })
    .lean();

  return (activeUsers as LeanUser[]).filter((user) => {
    const workingUnder = normalizeName(user.workingUnderPartner);
    return workingUnder && workingUnder === normalizedViewerName;
  });
}

async function assertPartnerCanManageEmployee(
  viewerUserId: string,
  employeeId: string
): Promise<{ viewer: LeanUser; employee: LeanUser } | NextResponse> {
  const viewer = (await User.findById(viewerUserId).lean()) as LeanUser | null;
  if (!viewer) {
    return NextResponse.json({ success: false, error: 'Viewer not found' }, { status: 404 });
  }

  const employee = (await User.findById(employeeId).lean()) as LeanUser | null;
  if (!employee || employee.isActive === false) {
    return NextResponse.json({ success: false, error: 'Employee not found' }, { status: 404 });
  }

  const normalizedViewerName = normalizeName(viewer.name);
  const employeePartner = normalizeName(employee.workingUnderPartner);
  if (!normalizedViewerName || employeePartner !== normalizedViewerName) {
    return NextResponse.json(
      { success: false, error: 'You can only manage excess hours for your own team' },
      { status: 403 }
    );
  }

  return { viewer, employee };
}

export async function GET(request: NextRequest) {
  try {
    const auth = await requireEmployeeSession(request);
    if (auth instanceof NextResponse) return auth;

    await dbConnect();

    const viewerUserId = String(request.nextUrl.searchParams.get('viewerUserId') || '').trim();
    const forbidden = forbidUnlessSelf(auth.userId, viewerUserId);
    if (forbidden) return forbidden;
    const monthYear = String(request.nextUrl.searchParams.get('monthYear') || '').trim();

    if (!mongoose.Types.ObjectId.isValid(viewerUserId)) {
      return NextResponse.json({ success: false, error: 'Valid viewerUserId is required' }, { status: 400 });
    }
    if (!/^\d{4}-\d{2}$/.test(monthYear)) {
      return NextResponse.json({ success: false, error: 'Valid monthYear (YYYY-MM) is required' }, { status: 400 });
    }

    const viewer = (await User.findById(viewerUserId).lean()) as LeanUser | null;
    if (!viewer) {
      return NextResponse.json({ success: false, error: 'Viewer not found' }, { status: 404 });
    }

    const team = await getOwnTeam(viewer);
    const userIds = team.map((u) => String(u._id || ''));
    await fetchAllowancesForTeamMonth(userIds, monthYear);

    const members = await Promise.all(
      team.map(async (user) => {
        const member = toMember(user);
        const breakdown = await computeDailyExcessBreakdown(member._id, monthYear);
        const monthlyRaw = await computeRawExcessForUserMonth(member._id, monthYear);

        return {
          ...member,
          monthYear,
          rawExcessHour: breakdown.rawExcess,
          displayExcessHour: breakdown.displayExcess,
          monthlyRawExcessHour: monthlyRaw,
          days: breakdown.rows,
          adjustedPositiveDays: breakdown.rows.filter(
            (d) =>
              d.rawExcessHour > 0 &&
              d.allowedExcessHours != null &&
              d.allowedExcessHours !== d.rawExcessHour
          ).length,
          partnerAdjusted: breakdown.rows.some((d) => d.allowedExcessHours != null),
        };
      })
    );

    return NextResponse.json({
      success: true,
      data: {
        monthYear,
        members,
        viewer: {
          _id: String(viewer._id || ''),
          name: String(viewer.name || ''),
        },
      },
    });
  } catch (error) {
    console.error('Team excess hour allowance GET error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch team excess hour allowances' },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const session = await requireEmployeeSession(request);
    if (session instanceof NextResponse) return session;

    await dbConnect();

    const body = await request.json();
    const viewerUserId = String(body?.viewerUserId || '').trim();
    const forbidden = forbidUnlessSelf(session.userId, viewerUserId);
    if (forbidden) return forbidden;
    const employeeId = String(body?.employeeId || '').trim();
    const monthYear = String(body?.monthYear || '').trim();
    const date = String(body?.date || '').trim();
    const clear = body?.clear === true;
    const allowedExcessHours = body?.allowedExcessHours;

    if (!mongoose.Types.ObjectId.isValid(viewerUserId)) {
      return NextResponse.json({ success: false, error: 'Valid viewerUserId is required' }, { status: 400 });
    }
    if (!mongoose.Types.ObjectId.isValid(employeeId)) {
      return NextResponse.json({ success: false, error: 'Valid employeeId is required' }, { status: 400 });
    }
    if (!/^\d{4}-\d{2}$/.test(monthYear)) {
      return NextResponse.json({ success: false, error: 'Valid monthYear (YYYY-MM) is required' }, { status: 400 });
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return NextResponse.json({ success: false, error: 'Valid date (YYYY-MM-DD) is required' }, { status: 400 });
    }
    if (date.slice(0, 7) !== monthYear) {
      return NextResponse.json(
        { success: false, error: 'Date must fall within the selected month' },
        { status: 400 }
      );
    }

    const auth = await assertPartnerCanManageEmployee(viewerUserId, employeeId);
    if (auth instanceof NextResponse) return auth;

    if (clear) {
      await deleteDayExcessApproval(employeeId, date);
    } else if (
      typeof allowedExcessHours !== 'number' ||
      !Number.isFinite(allowedExcessHours) ||
      allowedExcessHours < 0
    ) {
      return NextResponse.json(
        {
          success: false,
          error: 'allowedExcessHours must be a non-negative number, or pass clear: true',
        },
        { status: 400 }
      );
    } else {
      await upsertDayExcessApproval(employeeId, date, allowedExcessHours, viewerUserId);
    }

    const breakdown = await computeDailyExcessBreakdown(employeeId, monthYear);

    return NextResponse.json({
      success: true,
      data: {
        employeeId,
        monthYear,
        date,
        rawExcessHour: breakdown.rawExcess,
        displayExcessHour: breakdown.displayExcess,
        days: breakdown.rows,
      },
    });
  } catch (error) {
    console.error('Team excess hour allowance PATCH error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to update excess hour approval' },
      { status: 500 }
    );
  }
}
