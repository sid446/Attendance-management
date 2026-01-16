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

        const updateData: any = {
            registrationNo: emp.registrationNo,
            employeeCode: emp.employeeCode,
            paidFrom: emp.paidFrom,
            designation: emp.designation,
            category: emp.category,
            tallyName: emp.tallyName,
            gender: emp.gender,
            parentName: emp.parentName,
            parentOccupation: emp.parentOccupation,
            mobileNumber: emp.mobileNumber,
            alternateMobileNumber: emp.alternateMobileNumber,
            alternateEmail: emp.alternateEmail,
            address1: emp.address1,
            address2: emp.address2,
          emergencyContactNo: emp.emergencyContactNo,
          emergencyContactRelation: emp.emergencyContactRelation,
          anniversaryDate: emp.anniversaryDate,
          bankName: emp.bankName,
          branchName: emp.branchName,
          accountNumber: emp.accountNumber,
          ifscCode: emp.ifscCode,
          accountType: emp.accountType,
          accountHolderName: emp.accountHolderName,
          aadhaarNumber: emp.aadhaarNumber,
          panNumber: emp.panNumber,
          basicSalary: emp.basicSalary,
          laptopAllowance: emp.laptopAllowance,
          totalSalaryPerMonth: emp.totalSalaryPerMonth,
          totalSalaryPerAnnum: emp.totalSalaryPerAnnum,
            articleshipStartDate: emp.articleshipStartDate,
            transferCase: emp.transferCase,
            firstYearArticleship: emp.firstYearArticleship,
            secondYearArticleship: emp.secondYearArticleship,
            thirdYearArticleship: emp.thirdYearArticleship,
            filledScholarship: emp.filledScholarship,
            qualificationLevel: emp.qualificationLevel,
            nextAttemptDueDate: emp.nextAttemptDueDate,
            registeredUnderPartner: emp.registeredUnderPartner,
            workingUnderPartner: emp.workingUnderPartner,
            workingTiming: emp.workingTiming,
            
            scheduleInOutTime: {
                inTime: emp.schIn ?? '09:00',
                outTime: emp.schOut ?? '18:00'
            },
            scheduleInOutTimeSat: {
                inTime: emp.schIn ?? '09:00', // Defaulting to same start
                outTime: '13:00' // Default Sat end, unless "10:00-19:00" logic overrides it which we should handle if needed, but for now defaulting
            },
            scheduleInOutTimeMonth: {
                inTime: emp.schIn ?? '09:00',
                outTime: emp.schOut ?? '18:00'
            }
        };

        if (matchedUser) {
            // Update existing
            Object.assign(matchedUser, updateData);
            
            // Should valid date checks be here? the model handles type casting usually, but explicit Date object is better if coming as string
            if (updateData.articleshipStartDate) matchedUser.articleshipStartDate = new Date(updateData.articleshipStartDate);
            if (updateData.nextAttemptDueDate) matchedUser.nextAttemptDueDate = new Date(updateData.nextAttemptDueDate);
            if (updateData.anniversaryDate) matchedUser.anniversaryDate = new Date(updateData.anniversaryDate);
            
            // Careful with schedule overwrites - only if provided
            if (emp.schIn && emp.schOut) {
                 matchedUser.scheduleInOutTime = updateData.scheduleInOutTime;
                 // Also update others if we rely on single Work Timing
                 matchedUser.scheduleInOutTimeMonth = updateData.scheduleInOutTimeMonth;
                 // Keep Sat default or derive? Let's leave Sat as default 13:00 out unless logic changes
                 matchedUser.scheduleInOutTimeSat = { inTime: emp.schIn, outTime: '13:00' };
            }

            // Update timestamp
            matchedUser.updatedAt = new Date();
            
            await matchedUser.save();
            stats.updated++;
        } else {
            // Create new
            const generatedOdId = `OD-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
            const dbName = excelName.trim().replace(/\s+/g, '.');
            const email = emp.email || `${dbName.toLowerCase().replace(/[^a-z0-9.]/g, '')}@asija.com`;
            
            await User.create({
                odId: generatedOdId,
                name: dbName, // Store as "First.Last" or "First Last"? User DB seemed "First.Last"
                email: email, 
                joiningDate: emp.joiningDate ? new Date(emp.joiningDate) : new Date(),
                isActive: true,
                ...updateData
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
