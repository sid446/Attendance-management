import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import { getHrOperatorEmailFromRequest } from '@/lib/hrAuthServer';
import { loadHrConsolePermissionDoc } from '@/lib/hrConsolePermissionDb';
import { assertHrSection, effectiveFromDoc } from '@/lib/hrConsolePermissionUtils';
import {
  loadAllRequestWindowSettings,
  saveAllRequestWindowSettings,
} from '@/lib/attendanceRequestWindowDb';
import { sanitizeRequestWindowConfig } from '@/lib/attendanceRequestWindow';

export async function GET(request: NextRequest) {
  try {
    await dbConnect();
    const operatorEmail = await getHrOperatorEmailFromRequest(request);
    if (!operatorEmail) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const editorDoc = await loadHrConsolePermissionDoc(operatorEmail);
    const editorEffective = effectiveFromDoc(operatorEmail, editorDoc);
    const denied = assertHrSection(editorEffective, 'settings', 'view');
    if (denied) return denied;

    const data = await loadAllRequestWindowSettings();
    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error('Request window settings GET error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to load request window settings' },
      { status: 500 }
    );
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
    const denied = assertHrSection(editorEffective, 'settings', 'edit');
    if (denied) return denied;

    const body = await request.json();
    const data = await saveAllRequestWindowSettings(
      {
        global: sanitizeRequestWindowConfig(body.global),
        teamOverrides: Array.isArray(body.teamOverrides) ? body.teamOverrides : [],
        employeeOverrides: Array.isArray(body.employeeOverrides) ? body.employeeOverrides : [],
      },
      operatorEmail
    );

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error('Request window settings PUT error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to save request window settings' },
      { status: 500 }
    );
  }
}
