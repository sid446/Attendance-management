import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import EmployeeHistory from '@/models/EmployeeHistory';
import User from '@/models/User';
import { getHrOperatorEmailFromRequest } from '@/lib/hrAuthServer';
import { loadHrConsolePermissionDoc } from '@/lib/hrConsolePermissionDb';
import {
  effectiveFromDoc,
  assertCanReadEmployees,
  USER_PUT_KEY_TO_EMPLOYEE_TABS,
} from '@/lib/hrConsolePermissionUtils';

const HISTORY_FIELDS = [
  'workingUnderPartner',
  'designation',
  'paidFrom',
  'category',
  'qualificationLevel',
  'registeredUnderPartner',
] as const;

// GET /api/users/[id]/history - Get history for a specific employee
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await dbConnect();

    const operatorEmail = await getHrOperatorEmailFromRequest(request);
    if (!operatorEmail) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    const permDoc = await loadHrConsolePermissionDoc(operatorEmail);
    const effective = effectiveFromDoc(operatorEmail, permDoc);
    const readDenied = assertCanReadEmployees(effective);
    if (readDenied) return readDenied;

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

    const operatorEmail = await getHrOperatorEmailFromRequest(request);
    if (!operatorEmail) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    const permDoc = await loadHrConsolePermissionDoc(operatorEmail);
    const effective = effectiveFromDoc(operatorEmail, permDoc);
    if (effective.sections.employees !== 'edit' || effective.employeeTabs.history !== 'edit') {
      return NextResponse.json({ success: false, error: 'Not allowed to add history entries' }, { status: 403 });
    }

    const { id } = await params;
    const body = await request.json();
    const { fieldName, oldValue, newValue, changedBy, changeReason } = body;

    // Validate required fields
    if (!fieldName || !HISTORY_FIELDS.includes(fieldName as (typeof HISTORY_FIELDS)[number])) {
      return NextResponse.json(
        { success: false, error: 'Invalid or missing fieldName' },
        { status: 400 }
      );
    }

    const tabs = USER_PUT_KEY_TO_EMPLOYEE_TABS[fieldName];
    if (!tabs || !tabs.some((t) => effective.employeeTabs[t] === 'edit')) {
      return NextResponse.json({ success: false, error: 'Not allowed to edit this history field' }, { status: 403 });
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