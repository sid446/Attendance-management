import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import User from '@/models/User';

// GET - Fetch all users
export async function GET() {
  try {
    await dbConnect();

    const users = await User.find({ isActive: true }).sort({ name: 1 });

    // Ensure attendanceEmail is set for backward compatibility
    const usersData = users.map(user => {
      const userData = user.toObject();
      if (!userData.attendanceEmail && userData.email) {
        userData.attendanceEmail = userData.email;
      }
      return userData;
    });

    return NextResponse.json({
      success: true,
      data: usersData,
    });
  } catch (error) {
    console.error('Error fetching users:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch users' },
      { status: 500 }
    );
  }
}

// POST - Create new user
export async function POST(request: NextRequest) {
  try {
    await dbConnect();

    const body = await request.json();
    const { 
      odId, 
      name, 
      email,
      attendanceEmail,
      designation,
      team,
      joiningDate,
      scheduleInOutTime,
      scheduleInOutTimeSat,
      scheduleInOutTimeMonth,
      isActive,
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
    } = body;

    if (!odId || !name || !email || !joiningDate) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields: odId, name, email, joiningDate' },
        { status: 400 }
      );
    }

    // Determine attendanceEmail:
    // 1. If explicitly provided, use it
    // 2. If workingUnderPartner is set, look up partner's email
    // 3. Fall back to employee's own email
    let finalAttendanceEmail = attendanceEmail;
    if (!finalAttendanceEmail && workingUnderPartner) {
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
      }
    }
    if (!finalAttendanceEmail) {
      finalAttendanceEmail = email;
    }

    const user = await User.create({
      odId,
      name,
      email,
      attendanceEmail: finalAttendanceEmail, // Partner's email or provided value or employee's email
      designation,
      team,
      joiningDate: new Date(joiningDate),
      scheduleInOutTime: scheduleInOutTime || { inTime: '09:00', outTime: '18:00' },
      scheduleInOutTimeSat: scheduleInOutTimeSat || { inTime: '09:00', outTime: '13:00' },
      scheduleInOutTimeMonth: scheduleInOutTimeMonth || { inTime: '09:00', outTime: '18:00' },
      isActive: isActive !== undefined ? isActive : true,
      // Extended fields
      ...(registrationNo && { registrationNo }),
      ...(employeeCode && { employeeCode }),
      ...(paidFrom && { paidFrom }),
      ...(category && { category }),
      ...(tallyName && { tallyName }),
      ...(gender && { gender }),
      ...(parentName && { parentName }),
      ...(parentOccupation && { parentOccupation }),
      ...(mobileNumber && { mobileNumber }),
      ...(alternateMobileNumber && { alternateMobileNumber }),
      ...(alternateEmail && { alternateEmail }),
      ...(address1 && { address1 }),
      ...(address2 && { address2 }),
      ...(emergencyContactNo && { emergencyContactNo }),
      ...(emergencyContactRelation && { emergencyContactRelation }),
      ...(anniversaryDate && { anniversaryDate: new Date(anniversaryDate) }),
      ...(bankName && { bankName }),
      ...(branchName && { branchName }),
      ...(accountNumber && { accountNumber }),
      ...(ifscCode && { ifscCode }),
      ...(accountType && { accountType }),
      ...(accountHolderName && { accountHolderName }),
      ...(aadhaarNumber && { aadhaarNumber }),
      ...(panNumber && { panNumber }),
      ...(basicSalary && { basicSalary }),
      ...(laptopAllowance && { laptopAllowance }),
      ...(otherAllowance && { otherAllowance }),
      ...(bonus && { bonus }),
      ...(incentive && { incentive }),
      ...(totalSalaryPerMonth && { totalSalaryPerMonth }),
      ...(totalSalaryPerAnnum && { totalSalaryPerAnnum }),
      ...(pf && { pf }),
      ...(esi && { esi }),
      ...(gratuity && { gratuity }),
      ...(articleshipStartDate && { articleshipStartDate: new Date(articleshipStartDate) }),
      ...(transferCase && { transferCase }),
      ...(firstYearArticleship && { firstYearArticleship }),
      ...(secondYearArticleship && { secondYearArticleship }),
      ...(thirdYearArticleship && { thirdYearArticleship }),
      ...(filledScholarship && { filledScholarship }),
      ...(qualificationLevel && { qualificationLevel }),
      ...(nextAttemptDueDate && { nextAttemptDueDate: new Date(nextAttemptDueDate) }),
      ...(registeredUnderPartner && { registeredUnderPartner }),
      ...(workingUnderPartner && { workingUnderPartner }),
      ...(workingTiming && { workingTiming }),
    });

    return NextResponse.json(
      { success: true, data: user },
      { status: 201 }
    );
  } catch (error: unknown) {
    console.error('Error creating user:', error);
    
    if (error && typeof error === 'object' && 'code' in error && error.code === 11000) {
      return NextResponse.json(
        { success: false, error: 'User with this odId or email already exists' },
        { status: 409 }
      );
    }

    return NextResponse.json(
      { success: false, error: 'Failed to create user' },
      { status: 500 }
    );
  }
}
