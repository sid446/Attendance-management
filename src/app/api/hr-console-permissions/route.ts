import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import HrConsolePermission from '@/models/HrConsolePermission';
import { getHrOperatorEmailFromRequest } from '@/lib/hrAuthServer';
import { loadHrConsolePermissionDoc } from '@/lib/hrConsolePermissionDb';
import {
  effectiveFromDoc,
  normalizePermissionPayload,
  assertHrSection,
} from '@/lib/hrConsolePermissionUtils';
import { isAllowedHrAdminEmail, listHrAdminAllowlistDetail } from '@/lib/hrAdminAllowlistServer';

export async function GET(request: NextRequest) {
  try {
    await dbConnect();
    const operatorEmail = await getHrOperatorEmailFromRequest(request);
    if (!operatorEmail) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    if (searchParams.get('me') === '1') {
      const doc = await loadHrConsolePermissionDoc(operatorEmail);
      const effective = effectiveFromDoc(operatorEmail, doc);
      return NextResponse.json({
        success: true,
        data: {
          operatorEmail,
          sections: effective.sections,
          employeeTabs: effective.employeeTabs,
        },
      });
    }

    const editorDoc = await loadHrConsolePermissionDoc(operatorEmail);
    const editorEffective = effectiveFromDoc(operatorEmail, editorDoc);
    const denied = assertHrSection(editorEffective, 'accessControl', 'edit');
    if (denied) return denied;

    const rows = await HrConsolePermission.find({}).sort({ operatorEmail: 1 }).lean();
    const { all: allowedOperatorEmails, dbOnly: dbOnlyExtraEmails } = await listHrAdminAllowlistDetail();
    return NextResponse.json({ success: true, data: rows, allowedOperatorEmails, dbOnlyExtraEmails });
  } catch (e) {
    console.error('hr-console-permissions GET', e);
    return NextResponse.json({ success: false, error: 'Failed to load permissions' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    await dbConnect();
    const operatorEmail = await getHrOperatorEmailFromRequest(request);
    if (!operatorEmail) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const editorDoc = await loadHrConsolePermissionDoc(operatorEmail);
    const editorEffective = effectiveFromDoc(operatorEmail, editorDoc);
    const denied = assertHrSection(editorEffective, 'accessControl', 'edit');
    if (denied) return denied;

    const body = await request.json();
    const normalized = normalizePermissionPayload(body);
    if (!normalized) {
      return NextResponse.json({ success: false, error: 'Invalid operator or payload' }, { status: 400 });
    }
    if (!(await isAllowedHrAdminEmail(normalized.operatorEmail))) {
      return NextResponse.json(
        { success: false, error: 'That email is not on the HR login allowlist' },
        { status: 400 }
      );
    }

    const sectionsMap = new Map<string, string>();
    for (const [k, v] of Object.entries(normalized.sections)) {
      sectionsMap.set(k, v);
    }
    const tabsMap = new Map<string, string>();
    for (const [k, v] of Object.entries(normalized.employeeTabs)) {
      tabsMap.set(k, v);
    }

    const updated = await HrConsolePermission.findOneAndUpdate(
      { operatorEmail: normalized.operatorEmail },
      { $set: { sections: sectionsMap, employeeTabs: tabsMap } },
      { new: true, upsert: true, runValidators: true }
    ).lean();

    return NextResponse.json({ success: true, data: updated });
  } catch (e) {
    console.error('hr-console-permissions PUT', e);
    return NextResponse.json({ success: false, error: 'Failed to save permissions' }, { status: 500 });
  }
}
