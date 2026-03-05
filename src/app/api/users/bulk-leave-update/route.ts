import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import User, { IUser } from '@/models/User';

export async function POST(request: NextRequest) {
  try {
    await dbConnect();

    const body = await request.json();
    const { leaveData } = body;

    if (!Array.isArray(leaveData) || leaveData.length === 0) {
      return NextResponse.json(
        { success: false, error: 'No leave data provided' },
        { status: 400 }
      );
    }

    const stats = {
      updated: 0,
      failed: 0,
      errors: [] as string[]
    };

    // Fetch all existing users
    const existingUsers = await User.find({});
    
    // Create lookup map by name (case-insensitive)
    const userMap = new Map<string, IUser>();
    existingUsers.forEach(u => {
      if (u.name) {
        userMap.set(u.name.toLowerCase().trim(), u);
      }
    });

    for (const item of leaveData) {
      const excelName = item.name;
      if (!excelName) {
        stats.failed++;
        continue;
      }

      const normalizedExcelName = excelName.toLowerCase().trim();
      let matchedUser = userMap.get(normalizedExcelName);

      // Try replacing spaces with dots if no match
      if (!matchedUser) {
        const dotName = normalizedExcelName.replace(/\s+/g, '.');
        matchedUser = userMap.get(dotName);
      }

      // Try replacing dots with spaces if no match
      if (!matchedUser) {
        const spaceName = normalizedExcelName.replace(/\./g, ' ');
        matchedUser = userMap.get(spaceName);
      }

      if (!matchedUser) {
        stats.failed++;
        stats.errors.push(`User not found: ${excelName}`);
        continue;
      }

      try {
        const leavesAllowed = parseFloat(item.leavesAllowed) || 0;
        const leavesTaken = Math.abs(parseFloat(item.leavesTaken) || 0); // Ensure used is always positive

        // Update leave balance
        // 'used' field stores leaves taken BEFORE 1st Jan 2026 (from Excel)
        // 'usedAfterJan26' is calculated dynamically from attendance records
        // 'remaining' is calculated dynamically: earned - used - usedAfterJan26
        await User.findByIdAndUpdate(matchedUser._id, {
          $set: {
            'leaveBalance.earned': leavesAllowed,
            'leaveBalance.used': leavesTaken, // Leaves before 1st Jan 2026
            'leaveBalance.lastUpdated': new Date()
          }
        });

        stats.updated++;
      } catch (err) {
        stats.failed++;
        stats.errors.push(`Failed to update ${excelName}: ${err instanceof Error ? err.message : 'Unknown error'}`);
      }
    }

    return NextResponse.json({
      success: true,
      stats
    });

  } catch (error) {
    console.error('Bulk leave update error:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to process bulk leave update' },
      { status: 500 }
    );
  }
}
