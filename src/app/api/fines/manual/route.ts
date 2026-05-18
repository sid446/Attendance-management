import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import Fine, { IFineRecord } from '@/models/Fine';
import User from '@/models/User';
import { getWorkingUnderPartnerForDate } from '@/lib/userFieldHistory';

export async function POST(request: NextRequest) {
  try {
    await dbConnect();

    const { employeeId, reason, amount, remark, monthYear } = await request.json();

    if (!employeeId || !reason || !amount || !monthYear) {
      return NextResponse.json({ success: false, error: 'Missing required fields' }, { status: 400 });
    }

    // Find the user
    const user = await User.findById(employeeId);
    if (!user) {
      return NextResponse.json({ success: false, error: 'Employee not found' }, { status: 404 });
    }

    // Check if fine already exists for this employee and month
    let fine = await Fine.findOne({ 'userId': employeeId, monthYear });

    if (!fine) {
      // Create new fine record
      fine = new Fine({
        userId: employeeId,
        monthYear,
        category: user.category || 'Staff',
        fineRecords: [],
        totalFine: 0,
        totalWarnings: 0,
      });
    }

    // Generate unique serial number
    const existingSerials = await Fine.find({ monthYear }).distinct('fineRecords.serialNo');
    let serialNo = 1;
    while (existingSerials.includes(`F${serialNo.toString().padStart(3, '0')}`)) {
      serialNo++;
    }
    const newSerialNo = `F${serialNo.toString().padStart(3, '0')}`;

    const fineDate = new Date().toISOString().split('T')[0];

    // Add the manual fine record
    const newRecord: IFineRecord = {
      serialNo: newSerialNo,
      date: fineDate,
      consecutiveDay: 0, // Manual fine
      fineAmount: amount,
      isWarning: false,
      status: 'pending' as const,
      penaltyImposedBy: 'Manual',
      reason,
      remark: remark || '',
      paymentDate: '',
      paymentMode: '' as const,
      vertical: getWorkingUnderPartnerForDate(user, fineDate),
    };

    fine.fineRecords.push(newRecord);
    fine.totalFine += amount;

    await fine.save();

    return NextResponse.json({ success: true, fine });
  } catch (error) {
    console.error('Error imposing manual fine:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}