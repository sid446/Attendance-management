import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import User from '@/models/User';
import EmployeeHistory from '@/models/EmployeeHistory';

interface RouteParams {
  params: Promise<{ id: string }>;
}

// GET - Fetch single user by ID
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    await dbConnect();

    const { id } = await params;
    const user = await User.findById(id);

    if (!user) {
      return NextResponse.json(
        { success: false, error: 'User not found' },
        { status: 404 }
      );
    }

    // Ensure attendanceEmail is set for backward compatibility
    const userData = user.toObject();
    if (!userData.attendanceEmail && userData.email) {
      userData.attendanceEmail = userData.email;
    }

    return NextResponse.json({
      success: true,
      data: userData,
    });
  } catch (error) {
    console.error('Error fetching user:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch user' },
      { status: 500 }
    );
  }
}

// PUT - Update user
export async function PUT(request: NextRequest, { params }: RouteParams) {
  try {
    await dbConnect();

    const { id } = await params;
    const body = await request.json();
    const {
      odId,
      name,
      email,
      attendanceEmail,
      designation,
      team,
      joiningDate,
      schedules, // New year-wise schedules
      // Legacy fields for backward compatibility
      scheduleInOutTime,
      scheduleInOutTimeSat,
      scheduleInOutTimeMonth,
      isActive,
      extraInfo,
      // Extended fields
      registrationNo,
      employeeCode,
      paidFrom,
      category,
      tallyName,
      gender,
      parentName,
      parentOccupation,
      mobileNumber,
      alternateMobileNumber,
      alternateEmail,
      address1,
      address2,
      emergencyContactNo,
      emergencyContactRelation,
      anniversaryDate,
      bankName,
      branchName,
      accountNumber,
      ifscCode,
      accountType,
      accountHolderName,
      aadhaarNumber,
      panNumber,
      basicSalary,
      laptopAllowance,
      otherAllowance,
      bonus,
      incentive,
      totalSalaryPerMonth,
      totalSalaryPerAnnum,
      pf,
      esi,
      gratuity,
      articleshipStartDate,
      transferCase,
      firstYearArticleship,
      secondYearArticleship,
      thirdYearArticleship,
      filledScholarship,
      qualificationLevel,
      nextAttemptDueDate,
      registeredUnderPartner,
      workingUnderPartner,
      workingTiming,
      employmentType,
      employmentTypeHistory,
      changedBy, // Who made the change
      changeReason // Reason for the change
    } = body;

    // Get current user data before update for history tracking
    const currentUser = await User.findById(id);
    if (!currentUser) {
      return NextResponse.json(
        { success: false, error: 'User not found' },
        { status: 404 }
      );
    }

    // Track changes for history fields
    const historyFields = ['workingUnderPartner', 'designation', 'paidFrom', 'category', 'qualificationLevel', 'registeredUnderPartner'];
    const historyEntries = [];

    for (const field of historyFields) {
      const newValue = body[field];
      const oldValue = currentUser[field as keyof typeof currentUser];

      // Check if the field value has changed
      if (newValue !== undefined && String(newValue) !== String(oldValue || '')) {
        historyEntries.push({
          employeeId: id,
          fieldName: field,
          oldValue: String(oldValue || ''),
          newValue: String(newValue || ''),
          changedBy: changedBy || 'System',
          changeReason: changeReason || 'Employee update',
          changedAt: new Date()
        });
      }
    }

    // Determine attendanceEmail:
    // 1. If explicitly provided, use it
    // 2. If workingUnderPartner is changing, look up new partner's email
    // 3. Keep existing or fall back to email
    let finalAttendanceEmail: string | undefined = undefined;
    if (attendanceEmail !== undefined) {
      // Explicitly provided
      finalAttendanceEmail = attendanceEmail;
    } else if (workingUnderPartner !== undefined && workingUnderPartner !== currentUser.workingUnderPartner) {
      // workingUnderPartner is changing, auto-update attendanceEmail from new partner
      if (workingUnderPartner) {
        const cleanName = workingUnderPartner.trim();
        const dottedName = cleanName.replace(/\s+/g, '.');
        const partnerUser = await User.findOne({
          $or: [
            { name: { $regex: new RegExp(`^${cleanName}$`, 'i') } },
            { name: { $regex: new RegExp(`^${dottedName}$`, 'i') } }
          ]
        });
        if (partnerUser) {
          finalAttendanceEmail = partnerUser.attendanceEmail || partnerUser.email;
        } else {
          // Partner not found, fall back to employee email
          finalAttendanceEmail = email || currentUser.email;
        }
      } else {
        // workingUnderPartner is being cleared, fall back to employee email
        finalAttendanceEmail = email || currentUser.email;
      }
    }

    // If employmentTypeHistory is provided, update it
    const updateObj: any = {
        ...(odId && { odId }),
        ...(name && { name }),
        ...(email && { email }),
        // Set attendanceEmail if determined
        ...(finalAttendanceEmail !== undefined && { attendanceEmail: finalAttendanceEmail }),
        ...(designation !== undefined && { designation }),
        ...(team !== undefined && { team }),
        ...(joiningDate && { joiningDate: new Date(joiningDate) }),
        ...(schedules && { schedules }), // New year-wise schedules
        // Legacy fields for backward compatibility
        ...(scheduleInOutTime && { scheduleInOutTime }),
        ...(scheduleInOutTimeSat && { scheduleInOutTimeSat }),
        ...(scheduleInOutTimeMonth && { scheduleInOutTimeMonth }),
        ...(isActive !== undefined && { isActive }),
        ...(Array.isArray(extraInfo) && { extraInfo }),
        // Extended fields
        ...(registrationNo !== undefined && { registrationNo }),
        ...(employeeCode !== undefined && { employeeCode }),
        ...(paidFrom !== undefined && { paidFrom }),
        ...(category !== undefined && { category }),
        ...(tallyName !== undefined && { tallyName }),
        ...(gender !== undefined && { gender }),
        ...(parentName !== undefined && { parentName }),
        ...(parentOccupation !== undefined && { parentOccupation }),
        ...(mobileNumber !== undefined && { mobileNumber }),
        ...(alternateMobileNumber !== undefined && { alternateMobileNumber }),
        ...(alternateEmail !== undefined && { alternateEmail }),
        ...(address1 !== undefined && { address1 }),
        ...(address2 !== undefined && { address2 }),
        ...(emergencyContactNo !== undefined && { emergencyContactNo }),
        ...(emergencyContactRelation !== undefined && { emergencyContactRelation }),
        ...(anniversaryDate && { anniversaryDate: anniversaryDate ? new Date(anniversaryDate) : undefined }),
        ...(bankName !== undefined && { bankName }),
        ...(branchName !== undefined && { branchName }),
        ...(accountNumber !== undefined && { accountNumber }),
        ...(ifscCode !== undefined && { ifscCode }),
        ...(accountType !== undefined && { accountType }),
        ...(accountHolderName !== undefined && { accountHolderName }),
        ...(aadhaarNumber !== undefined && { aadhaarNumber }),
        ...(panNumber !== undefined && { panNumber }),
        ...(basicSalary !== undefined && { basicSalary }),
        ...(laptopAllowance !== undefined && { laptopAllowance }),
        ...(otherAllowance !== undefined && { otherAllowance }),
        ...(bonus !== undefined && { bonus }),
        ...(incentive !== undefined && { incentive }),
        ...(totalSalaryPerMonth !== undefined && { totalSalaryPerMonth }),
        ...(totalSalaryPerAnnum !== undefined && { totalSalaryPerAnnum }),
        ...(pf !== undefined && { pf }),
        ...(esi !== undefined && { esi }),
        ...(gratuity !== undefined && { gratuity }),
        ...(articleshipStartDate && { articleshipStartDate: articleshipStartDate ? new Date(articleshipStartDate) : undefined }),
        ...(transferCase !== undefined && { transferCase }),
        ...(firstYearArticleship !== undefined && { firstYearArticleship }),
        ...(secondYearArticleship !== undefined && { secondYearArticleship }),
        ...(thirdYearArticleship !== undefined && { thirdYearArticleship }),
        ...(filledScholarship !== undefined && { filledScholarship }),
        ...(qualificationLevel !== undefined && { qualificationLevel }),
        ...(nextAttemptDueDate && { nextAttemptDueDate: nextAttemptDueDate ? new Date(nextAttemptDueDate) : undefined }),
        ...(registeredUnderPartner !== undefined && { registeredUnderPartner }),
        ...(workingUnderPartner !== undefined && { workingUnderPartner }),
        ...(workingTiming !== undefined && { workingTiming }),
        ...(employmentType !== undefined && { employmentType }),
        ...(employmentTypeHistory && { employmentTypeHistory }),
      };
    const user = await User.findByIdAndUpdate(
      id,
      updateObj,
      { new: true, runValidators: true }
    );

    // If employmentTypeHistory changed, trigger attendance recalculation from the earliest effectiveFrom
    if (employmentTypeHistory && Array.isArray(employmentTypeHistory) && employmentTypeHistory.length > 0) {
      // Find earliest effectiveFrom date
      const minDate = employmentTypeHistory.reduce((min, entry) => {
        const d = new Date(entry.effectiveFrom);
        return (!min || d < min) ? d : min;
      }, null as Date | null);
      if (minDate && user) {
        // Recalculate attendance for all months from minDate to now
        const startYear = minDate.getFullYear();
        const startMonth = minDate.getMonth() + 1;
        const now = new Date();
        const endYear = now.getFullYear();
        const endMonth = now.getMonth() + 1;
        for (let y = startYear; y <= endYear; y++) {
          const mStart = y === startYear ? startMonth : 1;
          const mEnd = y === endYear ? endMonth : 12;
          for (let m = mStart; m <= mEnd; m++) {
            const monthStr = `${y}-${String(m).padStart(2, '0')}`;
            const attendance = await (await import('@/models/Attendance')).default.findOne({ userId: user._id, monthYear: monthStr });
            if (attendance) {
              // For each day, determine employmentType in effect and recalculate halfDay
              const records = attendance.records;
              let changed = false;
              for (const [date, rec] of records.entries()) {
                // Find employmentType in effect for this date
                const eff = employmentTypeHistory.filter(e => new Date(e.effectiveFrom) <= new Date(date));
                let type = user.employmentType;
                if (eff.length > 0) {
                  eff.sort((a, b) => new Date(b.effectiveFrom).getTime() - new Date(a.effectiveFrom).getTime());
                  type = eff[0].employmentType;
                }
                // Recalculate halfDay logic based on type
                let newHalfDay = false;
                if (type === 'article') {
                  // Article: after 13:30 or < half scheduled hours
                  const isAfter1330 = rec.checkin && rec.checkin >= '13:30';
                  const halfScheduled = rec.totalHour < 4; // Example: 8h schedule
                  newHalfDay = isAfter1330 || halfScheduled;
                } else if (type === 'fulltime') {
                  // Fulltime: < half scheduled hours
                  newHalfDay = rec.totalHour < 4;
                } else if (type === 'halftime') {
                  // Halftime: < half of halftime schedule (e.g., 2h if 4h schedule)
                  newHalfDay = rec.totalHour < 2;
                }
                if (rec.halfDay !== newHalfDay) {
                  rec.halfDay = newHalfDay;
                  changed = true;
                }
              }
              if (changed) {
                attendance.markModified('records');
                await attendance.save();
              }
            }
          }
        }
      }
    }

    if (!user) {
      return NextResponse.json(
        { success: false, error: 'User not found' },
        { status: 404 }
      );
    }

    // Save history entries
    if (historyEntries.length > 0) {
      try {
        await EmployeeHistory.insertMany(historyEntries);
      } catch (historyError) {
        console.error('Error saving employee history:', historyError);
        // Don't fail the main update if history saving fails
      }
    }

    // If extraInfo labels were updated for this user, propagate those labels
    // to all other users so every employee shares the same set of fields.
    if (Array.isArray(extraInfo) && extraInfo.length > 0) {
      try {
        await syncExtraInfoLabelsFromUser(user._id.toString());
      } catch (syncError) {
        console.error('Error syncing extraInfo labels to all users:', syncError);
        // Do not fail the main request because of sync issues; just log.
      }
    }

    return NextResponse.json({
      success: true,
      data: user,
    });
  } catch (error) {
    console.error('Error updating user:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to update user' },
      { status: 500 }
    );
  }
}

async function syncExtraInfoLabelsFromUser(sourceUserId: string) {
  const sourceUser = await User.findById(sourceUserId).select('extraInfo');

  if (!sourceUser || !Array.isArray((sourceUser as any).extraInfo)) {
    return;
  }

  const sourceExtraInfo = (sourceUser as any).extraInfo as Array<{ label?: string; value?: string }>;

  const labelSet = new Set(
    sourceExtraInfo
      .map((item) => (typeof item.label === 'string' ? item.label.trim() : ''))
      .filter((label) => label)
  );

  if (labelSet.size === 0) {
    return;
  }

  const otherUsers = await User.find({ _id: { $ne: sourceUserId } }).select('extraInfo');

  const bulkOps: any[] = [];

  for (const other of otherUsers) {
    const otherExtraInfo = (other as any).extraInfo as Array<{ label?: string; value?: string }> | undefined;
    const existingLabels = new Set(
      (otherExtraInfo || [])
        .map((item) => (typeof item.label === 'string' ? item.label.trim() : ''))
        .filter((label) => label)
    );

    const newItems: { label: string; value: string }[] = [];

    for (const label of labelSet) {
      if (!existingLabels.has(label)) {
        newItems.push({ label, value: '' });
      }
    }

    if (newItems.length > 0) {
      bulkOps.push({
        updateOne: {
          filter: { _id: (other as any)._id },
          update: { $push: { extraInfo: { $each: newItems } } },
        },
      });
    }
  }

  if (bulkOps.length > 0) {
    await (User as any).bulkWrite(bulkOps);
  }
}

// DELETE - Delete user (soft delete by setting isActive to false)
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    await dbConnect();

    const { id } = await params;
    const user = await User.findByIdAndUpdate(
      id,
      { isActive: false },
      { new: true }
    );

    if (!user) {
      return NextResponse.json(
        { success: false, error: 'User not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'User deactivated successfully',
    });
  } catch (error) {
    console.error('Error deleting user:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to delete user' },
      { status: 500 }
    );
  }
}
