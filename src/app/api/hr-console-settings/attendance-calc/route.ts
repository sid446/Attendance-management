import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import { getHrOperatorEmailFromRequest } from '@/lib/hrAuthServer';
import { loadHrConsolePermissionDoc } from '@/lib/hrConsolePermissionDb';
import { assertHrSection, effectiveFromDoc } from '@/lib/hrConsolePermissionUtils';
import {
  sanitizeAttendanceCalcPolicy,
  todayAttendanceDateKey,
} from '@/lib/attendanceCalcPolicy';
import {
  createAttendanceCalcPolicy,
  deleteAttendanceCalcPolicy,
  loadAttendanceCalcPolicies,
} from '@/lib/attendanceCalcPolicyDb';
import AttendanceCalcPolicyModel from '@/models/AttendanceCalcPolicy';
import { toAttendanceDateKey } from '@/lib/presenceCredit';

async function requireHr(request: NextRequest) {
  const operatorEmail = await getHrOperatorEmailFromRequest(request);
  if (!operatorEmail) return { error: NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 }) };
  return { operatorEmail };
}

export async function GET(request: NextRequest) {
  try {
    await dbConnect();
    const auth = await requireHr(request);
    if ('error' in auth && auth.error) return auth.error;

    const versions = await loadAttendanceCalcPolicies();
    return NextResponse.json({
      success: true,
      data: { versions, today: todayAttendanceDateKey() },
    });
  } catch (error) {
    console.error('Attendance calc policy GET error:', error);
    return NextResponse.json({ success: false, error: 'Failed to load calculation rules' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    await dbConnect();
    const auth = await requireHr(request);
    if ('error' in auth && auth.error) return auth.error;

    const editorDoc = await loadHrConsolePermissionDoc(auth.operatorEmail!);
    const editorEffective = effectiveFromDoc(auth.operatorEmail!, editorDoc);
    const denied = assertHrSection(editorEffective, 'settings', 'edit');
    if (denied) return denied;

    const parsed = sanitizeAttendanceCalcPolicy(await request.json());
    if (!parsed.ok) {
      return NextResponse.json({ success: false, error: parsed.error }, { status: 400 });
    }

    const existing = await AttendanceCalcPolicyModel.findOne({ effectiveFrom: parsed.effectiveFrom }).lean();
    if (existing) {
      return NextResponse.json(
        { success: false, error: 'A version already starts on that date. Choose another date.' },
        { status: 400 }
      );
    }

    try {
      await createAttendanceCalcPolicy(parsed.policy, parsed.effectiveFrom, auth.operatorEmail);
    } catch (error) {
      const code = (error as { code?: number })?.code;
      if (code === 11000) {
        return NextResponse.json(
          { success: false, error: 'A version already starts on that date. Choose another date.' },
          { status: 400 }
        );
      }
      throw error;
    }

    const versions = await loadAttendanceCalcPolicies();
    return NextResponse.json({ success: true, data: { versions, today: todayAttendanceDateKey() } });
  } catch (error) {
    console.error('Attendance calc policy POST error:', error);
    return NextResponse.json({ success: false, error: 'Failed to save calculation rules' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    await dbConnect();
    const auth = await requireHr(request);
    if ('error' in auth && auth.error) return auth.error;

    const editorDoc = await loadHrConsolePermissionDoc(auth.operatorEmail!);
    const editorEffective = effectiveFromDoc(auth.operatorEmail!, editorDoc);
    const denied = assertHrSection(editorEffective, 'settings', 'edit');
    if (denied) return denied;

    const id = new URL(request.url).searchParams.get('id') || '';
    const existing = id ? await AttendanceCalcPolicyModel.findById(id).lean() : null;
    if (!existing) {
      return NextResponse.json({ success: false, error: 'Version not found' }, { status: 404 });
    }

    const from = toAttendanceDateKey(String(existing.effectiveFrom || ''));
    const today = todayAttendanceDateKey();
    if (!from || from <= today) {
      return NextResponse.json(
        { success: false, error: 'Only a future version can be removed. Past rules stay in the history.' },
        { status: 400 }
      );
    }

    const removed = await deleteAttendanceCalcPolicy(id);
    if (!removed) {
      return NextResponse.json({ success: false, error: 'Version not found' }, { status: 404 });
    }

    const versions = await loadAttendanceCalcPolicies();
    return NextResponse.json({ success: true, data: { versions, today: todayAttendanceDateKey() } });
  } catch (error) {
    console.error('Attendance calc policy DELETE error:', error);
    return NextResponse.json({ success: false, error: 'Failed to remove calculation rules' }, { status: 500 });
  }
}
