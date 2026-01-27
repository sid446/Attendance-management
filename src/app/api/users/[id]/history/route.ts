import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import EmployeeHistory from '@/models/EmployeeHistory';
import User from '@/models/User';

// GET /api/users/[id]/history - Get history for a specific employee
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await dbConnect();

    const { id } = await params;

    // Validate employee exists
    const employee = await User.findById(id);
    if (!employee) {
      return NextResponse.json(
        { success: false, error: 'Employee not found' },
        { status: 404 }
      );
    }

    // Get history sorted by most recent first
    const history = await EmployeeHistory.find({ employeeId: id })
      .sort({ changedAt: -1 })
      .lean();

    return NextResponse.json({
      success: true,
      data: history
    });

  } catch (error) {
    console.error('Error fetching employee history:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// POST /api/users/[id]/history - Add history entry for a specific employee
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await dbConnect();

    const { id } = await params;
    const body = await request.json();
    const { fieldName, oldValue, newValue, changedBy, changeReason } = body;

    // Validate required fields
    if (!fieldName || !['workingUnderPartner', 'designation', 'paidFrom', 'category', 'qualificationLevel', 'registeredUnderPartner'].includes(fieldName)) {
      return NextResponse.json(
        { success: false, error: 'Invalid or missing fieldName' },
        { status: 400 }
      );
    }

    // Validate employee exists
    const employee = await User.findById(id);
    if (!employee) {
      return NextResponse.json(
        { success: false, error: 'Employee not found' },
        { status: 404 }
      );
    }

    // Create history entry
    const historyEntry = new EmployeeHistory({
      employeeId: id,
      fieldName,
      oldValue: oldValue || '',
      newValue: newValue || '',
      changedBy: changedBy || 'System',
      changeReason: changeReason || '',
      changedAt: new Date()
    });

    await historyEntry.save();

    return NextResponse.json({
      success: true,
      data: historyEntry
    });

  } catch (error) {
    console.error('Error creating employee history:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}