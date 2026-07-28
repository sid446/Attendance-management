import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import { getHrOperatorEmailFromRequest } from '@/lib/hrAuthServer';
import { loadHrConsolePermissionDoc } from '@/lib/hrConsolePermissionDb';
import { assertHrSection, effectiveFromDoc } from '@/lib/hrConsolePermissionUtils';
import {
  loadArticleCreditConfig,
  saveArticleCreditConfig,
} from '@/lib/articleCreditSettingsDb';
import { sanitizeArticleCreditConfig } from '@/lib/articleCredit';

export async function GET(request: NextRequest) {
  try {
    await dbConnect();
    const operatorEmail = await getHrOperatorEmailFromRequest(request);
    if (!operatorEmail) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const editorDoc = await loadHrConsolePermissionDoc(operatorEmail);
    const editorEffective = effectiveFromDoc(operatorEmail, editorDoc);
    const denied = assertHrSection(editorEffective, 'articleCredits', 'view');
    if (denied) return denied;

    const data = await loadArticleCreditConfig();
    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error('Article credit config GET error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to load article credit config' },
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
    const denied = assertHrSection(editorEffective, 'articleCredits', 'edit');
    if (denied) return denied;

    const body = await request.json();
    const data = await saveArticleCreditConfig(sanitizeArticleCreditConfig(body), operatorEmail);

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error('Article credit config PUT error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to save article credit config' },
      { status: 500 }
    );
  }
}
