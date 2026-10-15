import { NextRequest, NextResponse } from 'next/server';
import { requireBackupAccess } from '@/lib/backupAuth';
import { createSnapshot, getBackupStats, listSnapshots } from '@/lib/backup';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function GET(request: NextRequest) {
  const access = await requireBackupAccess(request, 'view');
  if (!access.ok) return access.response;

  try {
    const action = request.nextUrl.searchParams.get('action');
    if (action === 'list') {
      const backups = await listSnapshots();
      return NextResponse.json({ success: true, data: backups });
    }
    if (action === 'stats') {
      const stats = await getBackupStats();
      return NextResponse.json({ success: true, data: stats });
    }
    return NextResponse.json({ success: false, error: 'Invalid action parameter' }, { status: 400 });
  } catch (error) {
    console.error('Backup API error:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  const access = await requireBackupAccess(request, 'edit');
  if (!access.ok) return access.response;

  try {
    const result = await createSnapshot({ kind: 'daily', actor: access.email });
    if (!result.success) {
      return NextResponse.json({ success: false, error: result.error || 'Backup failed' }, { status: 500 });
    }
    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    console.error('Backup creation error:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
