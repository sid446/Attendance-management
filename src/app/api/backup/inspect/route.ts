import { NextRequest, NextResponse } from 'next/server';
import { requireBackupAccess } from '@/lib/backupAuth';
import { inspectSnapshot } from '@/lib/backup';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const access = await requireBackupAccess(request, 'view');
  if (!access.ok) return access.response;

  try {
    const dbName = request.nextUrl.searchParams.get('dbName')?.trim() || '';
    const collection = request.nextUrl.searchParams.get('collection')?.trim() || 'users';
    const query = request.nextUrl.searchParams.get('q')?.trim() || '';
    const monthYear = request.nextUrl.searchParams.get('monthYear')?.trim() || '';
    if (!dbName) {
      return NextResponse.json({ success: false, error: 'dbName is required' }, { status: 400 });
    }
    const data = await inspectSnapshot({ dbName, collection, query, monthYear });
    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error('Backup inspect error:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 400 }
    );
  }
}
