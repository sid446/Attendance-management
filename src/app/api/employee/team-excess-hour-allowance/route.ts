import { NextRequest, NextResponse } from 'next/server';
import mongoose from 'mongoose';
import dbConnect from '@/lib/mongodb';
import User from '@/models/User';
import {
  computeDailyExcessBreakdown,
  computeRawExcessForUserMonth,
  deleteDayExcessApproval,
  fetchAllowancesForTeamMonth,
  fetchExcessChangeLogsForUsersMonth,
  getCurrentDayAllowedExcess,
  getDayAttendanceContext,
  logExcessDayChange,
  upsertDayExcessApproval,
} from '@/lib/excessHourAllowanceDb';
import {
  assertViewerCanManageTeamMember,
  getExcessHoursTeamForViewer,
  visibleMemberToApiUser,
} from '@/lib/excessHoursTeamAccess';
import { forbidUnlessSelf, requireEmployeeSession } from '@/lib/employeeRouteAuth';

interface LeanUser {
  _id?: unknown;
  name?: unknown;
  email?: unknown;
  odId?: unknown;
  employeeCode?: unknown;
  workingUnderPartner?: unknown;
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

    const team = await getExcessHoursTeamForViewer(viewerUserId);
    const userIds = team.map((u) => u._id);
    await fetchAllowancesForTeamMonth(userIds, monthYear);
    const changeLogsByUser = await fetchExcessChangeLogsForUsersMonth(userIds, monthYear);

    const members = await Promise.all(
      team.map(async (visibleMember) => {
        const user = visibleMemberToApiUser(visibleMember);
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
          changeLogs: changeLogsByUser[member._id] ?? [],
        };
      })
    );

    const viewer = (await User.findById(viewerUserId).lean()) as LeanUser | null;

    return NextResponse.json({
      success: true,
      data: {
        monthYear,
        members,
        viewer: {
          _id: viewerUserId,
          name: String(viewer?.name || ''),
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

    const auth = await assertViewerCanManageTeamMember(viewerUserId, employeeId);
    if (!auth) {
      return NextResponse.json(
        {
          success: false,
          error: 'You can only manage excess hours for employees on your team attendance list',
        },
        { status: 403 }
      );
    }

    const changer = (await User.findById(viewerUserId).select('email attendanceEmail').lean()) as {
      email?: unknown;
      attendanceEmail?: unknown;
    } | null;
    const changedByEmail = String(changer?.email || changer?.attendanceEmail || '').trim();
    if (!changedByEmail) {
      return NextResponse.json(
        { success: false, error: 'Could not resolve your email for change logging' },
        { status: 400 }
      );
    }

    const oldAllowed = await getCurrentDayAllowedExcess(employeeId, date);
    const dayContext = await getDayAttendanceContext(employeeId, monthYear, date);

    if (clear) {
      if (oldAllowed == null) {
        return NextResponse.json(
          { success: false, error: 'This day is already on the default allowance' },
          { status: 400 }
        );
      }
      await deleteDayExcessApproval(employeeId, date);
      await logExcessDayChange({
        userId: employeeId,
        date,
        oldAllowedExcessHours: oldAllowed,
        newAllowedExcessHours: null,
        changedByUserId: viewerUserId,
        changedByEmail,
        typeOfPresence: dayContext.typeOfPresence,
        missedEntry: dayContext.missedEntry,
      });
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
      const newAllowed = Math.max(0, Number(Number(allowedExcessHours).toFixed(2)));
      if (oldAllowed === newAllowed) {
        return NextResponse.json(
          { success: false, error: 'Allowed hours are already set to this value' },
          { status: 400 }
        );
      }
      await upsertDayExcessApproval(employeeId, date, newAllowed, viewerUserId);
      await logExcessDayChange({
        userId: employeeId,
        date,
        oldAllowedExcessHours: oldAllowed,
        newAllowedExcessHours: newAllowed,
        changedByUserId: viewerUserId,
        changedByEmail,
        typeOfPresence: dayContext.typeOfPresence,
        missedEntry: dayContext.missedEntry,
      });
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
