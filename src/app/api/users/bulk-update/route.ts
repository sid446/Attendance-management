import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import User, { IUser } from '@/models/User';

export async function POST(request: NextRequest) {
  try {
    await dbConnect();

    const body = await request.json();
    const { employees } = body;

    if (!Array.isArray(employees) || employees.length === 0) {
      return NextResponse.json(
        { success: false, error: 'No employee data provided' },
        { status: 400 }
      );
    }

    const stats = {
      created: 0,
      updated: 0,
      failed: 0,
      errors: [] as string[]
    };

    // Fetch all existing users to minimize DB queries inside loop
    const existingUsers = await User.find({});
    
    // Create a lookup map. 
    // Key: Normalized name (lowercase, dots removed or spaces replaced to match unified format)
    // The user stated DB has "First.Last" and Excel has "First Last".
    // Strategy: Normalize everything to "firstlast" (lowercase, no spaces, no dots) for aggressive matching
    // OR "first.last" vs "first last" -> transform "first last" to "first.last"
    
    const userMap = new Map<string, IUser>();
    existingUsers.forEach(u => {
      if (u.name) {
        // key strategy: lowercase, replace spaces with dots to match DB format 'name.surname'
        // But DB currently has 'Saumya.Srivastava'.
        // If we key by the exact DB name lowercased:
        userMap.set(u.name.toLowerCase().trim(), u);
      }
    });

    for (const emp of employees) {
      try {
        const excelName = emp.name;
        if (!excelName) {
            stats.failed++;
            continue;
        }

        // Logic to match DB name
        // Excel: "Ashish Kapoor" -> Try matching "Ashish.Kapoor" (DB style) OR "Ashish Kapoor" matching?
        // User scenario: DB has "Saumya.Srivastava", Excel has "Ashish Kapoor" (unrelated) OR "Saumya Srivastava" (related).
        // If Excel has "Saumya Srivastava", we want to match "Saumya.Srivastava".
        
        // Try exact match first
        let matchedUser = userMap.get(excelName.toLowerCase().trim());

        // If not found, try replacing spaces with dots
        if (!matchedUser) {
          const dotName = excelName.trim().replace(/\s+/g, '.').toLowerCase();
          matchedUser = userMap.get(dotName);
        }

        const updateData = {
            designation: emp.designation,
            scheduleInOutTime: {
                inTime: emp.schIn ?? '09:00',
                outTime: emp.schOut ?? '18:00'
            },
            scheduleInOutTimeSat: {
                inTime: emp.schIn ?? '09:00', // Assuming Sat starts same as regular
                outTime: emp.schOutSat ?? '13:00'
            },
            scheduleInOutTimeMonth: {
                inTime: emp.schIn ?? '09:00', // Assuming Month special starts same as regular
                outTime: emp.schOutMonth ?? '18:00'
            }
        };

        if (matchedUser) {
            // Update existing
            matchedUser.designation = updateData.designation || matchedUser.designation;
            
            if (emp.schIn && emp.schOut) {
                matchedUser.scheduleInOutTime = updateData.scheduleInOutTime;
            }
             if (emp.schIn && emp.schOutSat) {
                matchedUser.scheduleInOutTimeSat = updateData.scheduleInOutTimeSat;
            }
            if (emp.schIn && emp.schOutMonth) {
                matchedUser.scheduleInOutTimeMonth = updateData.scheduleInOutTimeMonth;
            }
            // Update timestamp
            matchedUser.updatedAt = new Date();
            
            await matchedUser.save();
            stats.updated++;
        } else {
            // Create new
            // We need mandatory fields: odId, email, joiningDate
            // Generate them if missing
            const generatedOdId = `OD-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
            // Format name with dots for consistency if preferred, or keep as is? 
            // User DB has dots, so let's convert spaces to dots for the Name field to maintain consistency?
            // User said "it wont be having . in between that it had in my database".
            // So DB Convention seems to be Dot-Separated.
            const dbName = excelName.trim().replace(/\s+/g, '.');
            const generatedEmail = `${dbName.toLowerCase()}@example.com`; // Placeholder
            
            await User.create({
                odId: generatedOdId,
                name: dbName, // Store as "First.Last"
                email: generatedEmail, // Placeholder
                joiningDate: new Date(), // Default to today
                designation: updateData.designation,
                scheduleInOutTime: updateData.scheduleInOutTime,
                scheduleInOutTimeSat: updateData.scheduleInOutTimeSat,
                scheduleInOutTimeMonth: updateData.scheduleInOutTimeMonth,
                isActive: true
            });
            stats.created++;
        }

      } catch (err) {
        console.error(`Error processing employee ${emp.name}:`, err);
        stats.failed++;
        stats.errors.push(`Failed ${emp.name}: ${(err as Error).message}`);
      }
    }

    return NextResponse.json({
      success: true,
      data: stats
    });

  } catch (error) {
    console.error('Bulk update error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to process bulk update' },
      { status: 500 }
    );
  }
}
