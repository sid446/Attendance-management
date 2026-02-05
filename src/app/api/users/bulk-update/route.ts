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
    
    // Create a lookup map by employee code (primary) and name (fallback)
    const userMapByCode = new Map<string, IUser>();
    const userMapByName = new Map<string, IUser>();
    existingUsers.forEach(u => {
      if (u.employeeCode) {
        userMapByCode.set(String(u.employeeCode).toLowerCase().trim(), u);
      }
      if (u.name) {
        // Keep name matching as fallback for backward compatibility
        userMapByName.set(u.name.toLowerCase().trim(), u);
      }
    });

    for (const emp of employees) {
      try {
        const excelName = emp.name;
        const employeeCode = emp.employeeCode;
        
        if (!excelName) {
            stats.failed++;
            stats.errors.push(`Missing name for employee`);
            continue;
        }

        // Primary matching by employee code
        let matchedUser: IUser | undefined;
        
        if (employeeCode) {
          matchedUser = userMapByCode.get(String(employeeCode).toLowerCase().trim());
        }
        
        // Fallback to name matching if no employee code match found
        if (!matchedUser) {
          // Try exact match first
          matchedUser = userMapByName.get(excelName.toLowerCase().trim());

          // If not found, try replacing spaces with dots
          if (!matchedUser) {
            const dotName = excelName.trim().replace(/\s+/g, '.').toLowerCase();
            matchedUser = userMapByName.get(dotName);
          }
        }

        const updateData: any = {
            registrationNo: emp.registrationNo,
            employeeCode: emp.employeeCode,
            paidFrom: emp.paidFrom,
            designation: emp.designation,
            category: emp.category,
            employmentType: emp.category === 'Article' ? 'article' : 'fulltime',
            tallyName: emp.tallyName,
            gender: emp.gender,
            parentName: emp.parentName,
            parentOccupation: emp.parentOccupation,
            mobileNumber: emp.mobileNumber,
            alternateMobileNumber: emp.alternateMobileNumber,
            alternateEmail: emp.alternateEmail,
            attendanceEmail: emp.attendanceEmail,
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
          otherAllowance: emp.otherAllowance,
          bonus: emp.bonus,
          incentive: emp.incentive,
          totalSalaryPerMonth: emp.totalSalaryPerMonth,
          totalSalaryPerAnnum: emp.totalSalaryPerAnnum,
          pf: emp.pf,
          esi: emp.esi,
          gratuity: emp.gratuity,
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
            // Remove old workingTiming field
            // workingTiming: emp.workingTiming,
            
            // Handle new schedules structure
            ...(emp.schedules && emp.schedules.length > 0 && { schedules: emp.schedules })
        };

        if (matchedUser) {
            // Update existing
            Object.assign(matchedUser, updateData);
            
            // Set employmentType based on category
            matchedUser.employmentType = emp.category === 'Article' ? 'article' : 'fulltime';
            
            // Should valid date checks be here? the model handles type casting usually, but explicit Date object is better if coming as string
            if (updateData.articleshipStartDate) matchedUser.articleshipStartDate = new Date(updateData.articleshipStartDate);
            if (updateData.nextAttemptDueDate) matchedUser.nextAttemptDueDate = new Date(updateData.nextAttemptDueDate);
            if (updateData.anniversaryDate) matchedUser.anniversaryDate = new Date(updateData.anniversaryDate);
            
            // Handle schedules update
            if (emp.schedules && emp.schedules.length > 0) {
                matchedUser.schedules = emp.schedules;
            }

            // Update leave balance if provided
            if (emp.leaveBalance) {
              matchedUser.leaveBalance = { ...matchedUser.leaveBalance, ...emp.leaveBalance };
            }

            // Update timestamp
            matchedUser.updatedAt = new Date();
            
            await matchedUser.save();
            stats.updated++;
        } else {
            // Create new - but check if employee code already exists
            if (employeeCode && userMapByCode.has(String(employeeCode).toLowerCase().trim())) {
              stats.failed++;
              stats.errors.push(`Employee code "${employeeCode}" already exists for another user`);
              continue;
            }
            
            // Use employee code as OD-ID if available, otherwise generate one
            const odId = employeeCode ? String(employeeCode) : `OD-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
            const dbName = excelName.trim().replace(/\s+/g, '.');
            const email = emp.email || `${dbName.toLowerCase().replace(/[^a-z0-9.]/g, '')}@asija.com`;
            
            await User.create({
                odId: odId,
                name: dbName, // Store as "First.Last" or "First Last"? User DB seemed "First.Last"
                email: email, 
                joiningDate: emp.joiningDate ? new Date(emp.joiningDate) : new Date(),
                isActive: true,
                leaveBalance: emp.leaveBalance,
                ...updateData
            });
            stats.created++;
        }

      } catch (err) {
        console.error(`Error processing employee ${emp.name} (${emp.employeeCode || 'no code'}):`, err);
        stats.failed++;
        stats.errors.push(`Failed ${emp.name} (${emp.employeeCode || 'no code'}): ${(err as Error).message}`);
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
