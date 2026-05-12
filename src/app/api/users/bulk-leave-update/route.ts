import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import User, { IUser } from '@/models/User';
import { getHrOperatorEmailFromRequest } from '@/lib/hrAuthServer';
import { loadHrConsolePermissionDoc } from '@/lib/hrConsolePermissionDb';
import { effectiveFromDoc } from '@/lib/hrConsolePermissionUtils';

export async function POST(request: NextRequest) {
  try {
    await dbConnect();

    const operatorEmail = await getHrOperatorEmailFromRequest(request);
    if (!operatorEmail) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    const permDoc = await loadHrConsolePermissionDoc(operatorEmail);
    const effective = effectiveFromDoc(operatorEmail, permDoc);
    if (effective.sections.employees !== 'edit' || effective.employeeTabs.salary !== 'edit') {
      return NextResponse.json({ success: false, error: 'Not allowed to bulk-update leave' }, { status: 403 });
    }

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
      errors: [] as string[],
      message: `Only employees present in the Excel file will be updated. No other employees will be affected.`
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

    // IMPORTANT: Only process employees present in the Excel file
    // No other employees will be affected or updated
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
        // 'balanceAsOfJan26' stores the opening balance as of 1st Jan 2026 (from Excel)
        // 'earned' is calculated from attendance uploads after Jan 2026
        // 'used' field stores leaves taken BEFORE 1st Jan 2026 (from Excel)
        // 'usedAfterJan26' is calculated dynamically from attendance records
        // 'remaining' is calculated dynamically
        await User.findByIdAndUpdate(matchedUser._id, {
          $set: {
            'leaveBalance.balanceAsOfJan26': leavesAllowed,
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
