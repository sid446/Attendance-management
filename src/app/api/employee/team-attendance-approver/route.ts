import { NextRequest, NextResponse } from 'next/server';
import mongoose from 'mongoose';
import dbConnect from '@/lib/mongodb';
import User from '@/models/User';
import { forbidUnlessSelf, requireEmployeeSession } from '@/lib/employeeRouteAuth';

function normalizeName(value: unknown): string {
  return String(value || '').replace(/[.\s]/g, '').toLowerCase();
}

function normalizeEmail(value: unknown): string {
  return String(value || '').trim().toLowerCase();
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

interface LeanUser {
  _id?: unknown;
  name?: unknown;
  email?: unknown;
  attendanceEmail?: unknown;
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
    attendanceEmail: String(user.attendanceEmail || user.email || ''),
    workingUnderPartner: String(user.workingUnderPartner || ''),
  };
}

/** Find approver by login email only (employee.attendanceEmail → user.email). */
async function findUserByLoginEmail(loginEmail: string): Promise<LeanUser | null> {
  const key = normalizeEmail(loginEmail);
  if (!key) return null;

  const regex = new RegExp(`^${escapeRegex(key)}$`, 'i');
  const matches = (await User.find({ email: regex })
    .select('name email odId employeeCode isActive')
    .lean()) as LeanUser[];

  if (matches.length === 0) return null;
  return matches.find((user) => user.isActive !== false) ?? matches[0] ?? null;
}

function resolveApproverFromMap(
  attendanceEmail: string,
  byLoginEmail: Map<string, LeanUser>
): { userId: string | null; name: string; email: string } {
  const key = normalizeEmail(attendanceEmail);
  if (!key) {
    return { userId: null, name: 'Not assigned', email: '' };
  }
  const match = byLoginEmail.get(key);
  if (match) {
    return {
      userId: String(match._id || ''),
      name: String(match.name || key),
      email: String(match.email || key),
    };
  }
  return { userId: null, name: key, email: key };
}

async function resolveApprover(
  attendanceEmail: string,
  byLoginEmail: Map<string, LeanUser>
): Promise<{ userId: string | null; name: string; email: string }> {
  const fromMap = resolveApproverFromMap(attendanceEmail, byLoginEmail);
  if (fromMap.userId) return fromMap;

  const fromDb = await findUserByLoginEmail(attendanceEmail);
  if (!fromDb) return fromMap;

  return {
    userId: String(fromDb._id || ''),
    name: String(fromDb.name || attendanceEmail),
    email: String(fromDb.email || attendanceEmail),
  };
}

async function getOwnTeam(viewer: LeanUser): Promise<LeanUser[]> {
  const normalizedViewerName = normalizeName(viewer.name);
  if (!normalizedViewerName) return [];

  const activeUsers = await User.find({ isActive: true })
    .select('name email attendanceEmail odId employeeCode workingUnderPartner')
    .sort({ name: 1 })
    .lean();

  return (activeUsers as LeanUser[]).filter((user) => {
    const workingUnder = normalizeName(user.workingUnderPartner);
    return workingUnder && workingUnder === normalizedViewerName;
  });
}

/** Map login email → user (used to resolve employee attendanceEmail to approver name). */
async function buildLoginEmailLookup(): Promise<Map<string, LeanUser>> {
  const users = (await User.find({})
    .select('name email odId employeeCode isActive')
    .lean()) as LeanUser[];

  const byLoginEmail = new Map<string, LeanUser>();
  for (const user of users) {
    const key = normalizeEmail(user.email);
    if (!key) continue;
    const existing = byLoginEmail.get(key);
    if (!existing) {
      byLoginEmail.set(key, user);
      continue;
    }
    if (existing.isActive === false && user.isActive !== false) {
      byLoginEmail.set(key, user);
    }
  }
  return byLoginEmail;
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

    const viewer = (await User.findById(viewerUserId).lean()) as LeanUser | null;
    if (!viewer) {
      return NextResponse.json({ success: false, error: 'Viewer not found' }, { status: 404 });
    }

    const team = await getOwnTeam(viewer);
    const byLoginEmail = await buildLoginEmailLookup();

    const members = await Promise.all(
      team.map(async (user) => {
        const member = toMember(user);
        const approver = await resolveApprover(member.attendanceEmail, byLoginEmail);
        return {
          ...member,
          resolvedApprover: {
            userId: approver.userId,
            name: approver.name,
            email: approver.email,
          },
        };
      })
    );

    const groupMap = new Map<
      string,
      {
        approverUserId: string | null;
        approverName: string;
        approverEmail: string;
        members: ReturnType<typeof toMember>[];
      }
    >();

    for (const member of members) {
      const approver = member.resolvedApprover;
      const groupKey = approver.userId || normalizeEmail(member.attendanceEmail) || '__unassigned__';
      const existing = groupMap.get(groupKey);
      if (existing) {
        existing.members.push(member);
        continue;
      }
      groupMap.set(groupKey, {
        approverUserId: approver.userId,
        approverName: approver.name,
        approverEmail: approver.email || member.attendanceEmail,
        members: [member],
      });
    }

    const groups = Array.from(groupMap.values()).sort((a, b) =>
      a.approverName.localeCompare(b.approverName)
    );

    const approverPickList = (await User.find({ isActive: true })
      .select('name email attendanceEmail odId employeeCode')
      .sort({ name: 1 })
      .lean()) as LeanUser[];

    return NextResponse.json({
      success: true,
      data: {
        members,
        groups,
        approverPickList: approverPickList.map((user) => ({
          _id: String(user._id || ''),
          name: String(user.name || ''),
          email: String(user.email || ''),
          attendanceEmail: String(user.attendanceEmail || user.email || ''),
          odId: String(user.odId || ''),
          employeeCode: String(user.employeeCode || ''),
        })),
        viewer: {
          _id: String(viewer._id || ''),
          name: String(viewer.name || ''),
          email: String(viewer.email || ''),
          attendanceEmail: String(viewer.attendanceEmail || viewer.email || ''),
        },
      },
    });
  } catch (error) {
    console.error('Team attendance approver fetch error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch team attendance approvers' },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const auth = await requireEmployeeSession(request);
    if (auth instanceof NextResponse) return auth;

    await dbConnect();

    const body = await request.json();
    const viewerUserId = String(body?.viewerUserId || '').trim();
    const forbidden = forbidUnlessSelf(auth.userId, viewerUserId);
    if (forbidden) return forbidden;
    const employeeId = String(body?.employeeId || '').trim();
    const attendanceEmail = String(body?.attendanceEmail || '').trim();

    if (!mongoose.Types.ObjectId.isValid(viewerUserId)) {
      return NextResponse.json({ success: false, error: 'Valid viewerUserId is required' }, { status: 400 });
    }
    if (!mongoose.Types.ObjectId.isValid(employeeId)) {
      return NextResponse.json({ success: false, error: 'Valid employeeId is required' }, { status: 400 });
    }
    if (!attendanceEmail) {
      return NextResponse.json({ success: false, error: 'Attendance email is required' }, { status: 400 });
    }

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
        { success: false, error: 'You can only update attendance approver for your own team' },
        { status: 403 }
      );
    }

    const updated = await User.findByIdAndUpdate(
      employeeId,
      { $set: { attendanceEmail } },
      { new: true, runValidators: true }
    )
      .select('name email attendanceEmail odId employeeCode workingUnderPartner')
      .lean();

    if (!updated) {
      return NextResponse.json({ success: false, error: 'Failed to update employee' }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      data: toMember(updated as LeanUser),
    });
  } catch (error) {
    console.error('Team attendance approver update error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to update attendance approver' },
      { status: 500 }
    );
  }
}
