import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import User, { IUser } from '@/models/User';

export async function POST(request: NextRequest) {
  try {
    await dbConnect();

    const body = await request.json();
    const { schedules } = body;

    if (!Array.isArray(schedules) || schedules.length === 0) {
      return NextResponse.json(
        { success: false, error: 'No schedule data provided' },
        { status: 400 }
      );
    }

    const stats = {
      updated: 0,
      created: 0,
      failed: 0,
      errors: [] as string[]
    };

    // Fetch all existing users
    const existingUsers = await User.find({});
    
    // Create lookup map
    const userMap = new Map<string, IUser>();
    existingUsers.forEach(u => {
      if (u.name) {
        // Key by exact lowercase trimmed name
        userMap.set(u.name.toLowerCase().trim(), u);
      }
    });

    for (const item of schedules) {
      const excelName = item.name;
      if (!excelName) {
        stats.failed++;
        continue;
      }

      // Matching logic:
      // 1. Exact match
      // 2. Space -> Dot match (e.g. "John Doe" -> "john.doe" matches "John.Doe")
      
      const normalizedExcelName = excelName.toLowerCase().trim();
      let matchedUser = userMap.get(normalizedExcelName);

      if (!matchedUser) {
        // Try replacing spaces with dots
        const dotName = normalizedExcelName.replace(/\s+/g, '.');
        matchedUser = userMap.get(dotName);
      }

      if (!matchedUser) {
        stats.failed++;
        stats.errors.push(`User not found: ${excelName}`);
        continue;
      }

      // Update schedules
      // If a value is missing in Excel (empty string/null), we might want to keep existing or set default?
      // Assumption: If the user provides a file, they intend to set these values.
      // If Sch-In is provided, it applies to all start times unless specific logic dictating otherwise exists, 
      // but here the source has only one 'Sch-In'.
      
      const inTime = item.inTime;
      const outTime = item.outTime;
      const outTimeSat = item.outTimeSat;
      const outTimeMonth = item.outTimeMonth;

      // Only update if values are provided. 
      // If we want to strictly enforce the Excel values even if empty, we would set them.
      // Let's assume non-empty values should update.

      let modified = false;

      if (inTime && outTime) {
        matchedUser.scheduleInOutTime = {
          inTime: inTime,
          outTime: outTime
        };
        modified = true;
      }

      if (inTime && outTimeSat) {
        matchedUser.scheduleInOutTimeSat = {
          inTime: inTime,
          outTime: outTimeSat
        };
        modified = true;
      }

      if (inTime && outTimeMonth) {
        matchedUser.scheduleInOutTimeMonth = {
          inTime: inTime,
          outTime: outTimeMonth
        };
        modified = true;
      }

      if (modified) {
        await matchedUser.save();
        stats.updated++;
      } else {
        // No valid data to update
        stats.failed++;
        stats.errors.push(`No valid schedule data for: ${excelName}`);
      }
    }

    return NextResponse.json({
      success: true,
      stats
    });

  } catch (error) {
    console.error('Bulk schedule update error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
