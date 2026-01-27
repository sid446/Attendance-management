import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import { createDatabaseBackup, listBackupFiles, getBackupStats } from '@/lib/backup';

export async function GET(request: NextRequest) {
  try {
    await dbConnect();

    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action');

    if (action === 'list') {
      // List available backups
      const backups = listBackupFiles();
      return NextResponse.json({
        success: true,
        data: backups
      });
    } else if (action === 'stats') {
      // Get backup statistics
      const stats = getBackupStats();
      return NextResponse.json({
        success: true,
        data: stats
      });
    }

    return NextResponse.json({
      success: false,
      error: 'Invalid action parameter'
    }, { status: 400 });

  } catch (error) {
    console.error('Backup API error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error'
    }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    await dbConnect();

    const body = await request.json();
    const {
      includeCollections,
      excludeCollections,
      compress = true
    } = body;

    // Create backup
    const result = await createDatabaseBackup({
      includeCollections,
      excludeCollections,
      compress
    });

    if (result.success) {
      return NextResponse.json({
        success: true,
        data: result
      });
    } else {
      return NextResponse.json({
        success: false,
        error: result.error
      }, { status: 500 });
    }

  } catch (error) {
    console.error('Backup creation error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error'
    }, { status: 500 });
  }
}