
import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import Attendance from '@/models/Attendance';
import User, { IUser } from '@/models/User';

export async function POST(request: NextRequest) {
  try {
    await dbConnect();
    const { userIds, monthYear } = await request.json();

    if (!userIds || !Array.isArray(userIds) || !monthYear) {
      return NextResponse.json({ success: false, error: "Invalid parameters" }, { status: 400 });
    }

    // Find attendance docs for these users in this month
    const attendances = await Attendance.find({
      userId: { $in: userIds },
      monthYear: monthYear
    }).populate('userId', 'name odId');

    const results = [];

    for (const att of attendances) {
        if (!att.records) continue;
        
        // Convert Map to iterables to find Absent records
        // Att.records is a Map<string, DailyRecord>
        // We look for typeOfPresence === 'Absent'
        
        // Since it is a Mongoose Map, we iterate keys
        for (const [date, rec] of att.records.entries()) { // Mongoose Map entries
            // Need to handle if rec is actually a subdocument or plain object
            // Mongoose maps return objects often in lean queries or specific access
             
            // Check for explicit 'Absent' OR 'ThumbMachine' with 0 hours (implicit absent)
            if (rec.typeOfPresence === 'Absent' || (rec.typeOfPresence === 'ThumbMachine' && (rec.totalHour === 0 || !rec.totalHour))) {
                const user = att.userId as unknown as IUser;
                results.push({
                    userId: String(user._id),
                    userName: user.name,
                    odId: user.odId,
                    date: date,
                    monthYear: att.monthYear,
                    currentStatus: 'Absent'
                });
            }
        }
    }

    return NextResponse.json({ success: true, data: results });

  } catch (error) {
    console.error("Error fetching absent records:", error);
    return NextResponse.json({ success: false, error: "Server error" }, { status: 500 });
  }
}
