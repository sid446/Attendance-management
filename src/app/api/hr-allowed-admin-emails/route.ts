import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import { getHrOperatorEmailFromRequest } from '@/lib/hrAuthServer';
import { loadHrConsolePermissionDoc } from '@/lib/hrConsolePermissionDb';
import { effectiveFromDoc, assertHrSection } from '@/lib/hrConsolePermissionUtils';
import {
  addHrAllowedAdminEmail,
  listHrAdminAllowlistDetail,
  removeHrAllowedAdminEmail,
} from '@/lib/hrAdminAllowlistServer';

export async function GET(request: NextRequest) {
  try {
    await dbConnect();
    const operatorEmail = await getHrOperatorEmailFromRequest(request);
    if (!operatorEmail) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const editorDoc = await loadHrConsolePermissionDoc(operatorEmail);
    const editorEffective = effectiveFromDoc(operatorEmail, editorDoc);
    const denied = assertHrSection(editorEffective, 'accessControl', 'view');
    if (denied) return denied;

    const { all: allowedOperatorEmails, dbOnly: dbOnlyExtraEmails } = await listHrAdminAllowlistDetail();
    return NextResponse.json({ success: true, allowedOperatorEmails, dbOnlyExtraEmails });
  } catch (e) {
    console.error('hr-allowed-admin-emails GET', e);
    return NextResponse.json({ success: false, error: 'Failed to load allowlist' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
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
    const email = typeof body?.email === 'string' ? body.email : '';
    const result = await addHrAllowedAdminEmail(email);
    if (!result.ok) {
      return NextResponse.json({ success: false, error: result.error }, { status: 400 });
    }
    const { all: allowedOperatorEmails, dbOnly: dbOnlyExtraEmails } = await listHrAdminAllowlistDetail();
    return NextResponse.json({ success: true, allowedOperatorEmails, dbOnlyExtraEmails });
  } catch (e) {
    console.error('hr-allowed-admin-emails POST', e);
    return NextResponse.json({ success: false, error: 'Failed to add email' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
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

    const { searchParams } = new URL(request.url);
    const email = searchParams.get('email') || '';
    const result = await removeHrAllowedAdminEmail(email);
    if (!result.ok) {
      return NextResponse.json({ success: false, error: result.error }, { status: 400 });
    }
    const { all: allowedOperatorEmails, dbOnly: dbOnlyExtraEmails } = await listHrAdminAllowlistDetail();
    return NextResponse.json({ success: true, allowedOperatorEmails, dbOnlyExtraEmails });
  } catch (e) {
    console.error('hr-allowed-admin-emails DELETE', e);
    return NextResponse.json({ success: false, error: 'Failed to remove email' }, { status: 500 });
  }
}
