import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import { getHrOperatorEmailFromRequest } from '@/lib/hrAuthServer';
import { loadHrConsolePermissionDoc } from '@/lib/hrConsolePermissionDb';
import { assertHrSection, effectiveFromDoc } from '@/lib/hrConsolePermissionUtils';
import { sanitizePresenceCreditRule } from '@/lib/presenceCredit';
import {
  createPresenceCreditRule,
  deletePresenceCreditRule,
  loadPresenceCreditDirectory,
  loadPresenceCreditRules,
} from '@/lib/presenceCreditDb';
import PresenceCreditRule from '@/models/PresenceCreditRule';
import { syncPresenceCreditOntoAttendance } from '@/lib/syncPresenceCreditAttendance';
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

    const [rules, directory] = await Promise.all([
      loadPresenceCreditRules(),
      loadPresenceCreditDirectory(),
    ]);

    return NextResponse.json({
      success: true,
      data: { rules, teams: directory.teams, people: directory.people },
    });
  } catch (error) {
    console.error('Presence credit rules GET error:', error);
    return NextResponse.json({ success: false, error: 'Failed to load credit rules' }, { status: 500 });
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

    const parsed = sanitizePresenceCreditRule(await request.json());
    if (!parsed.ok) {
      return NextResponse.json({ success: false, error: parsed.error }, { status: 400 });
    }

    const rule = await createPresenceCreditRule(parsed.rule, auth.operatorEmail);
    const synced = await syncPresenceCreditOntoAttendance({
      fromDate: rule.effectiveFrom,
      kind: rule.kind,
    });
    return NextResponse.json({ success: true, data: rule, updatedDays: synced.updated });
  } catch (error) {
    console.error('Presence credit rules POST error:', error);
    return NextResponse.json({ success: false, error: 'Failed to save credit rule' }, { status: 500 });
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
    const existing = id ? await PresenceCreditRule.findById(id).lean() : null;
    const removed = await deletePresenceCreditRule(id);
    if (!removed) {
      return NextResponse.json({ success: false, error: 'Rule not found' }, { status: 404 });
    }
    if (existing) {
      const kind = existing.kind === 'osp' ? 'osp' : 'wfh';
      await syncPresenceCreditOntoAttendance({
        fromDate: toAttendanceDateKey(String(existing.effectiveFrom || '')),
        kind,
      });
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Presence credit rules DELETE error:', error);
    return NextResponse.json({ success: false, error: 'Failed to delete credit rule' }, { status: 500 });
  }
}
