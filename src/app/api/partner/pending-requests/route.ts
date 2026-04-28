import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import '@/models/User';
import AttendanceRequest from '@/models/AttendanceRequest';
import Attendance from '@/models/Attendance';

export async function GET(request: NextRequest) {
  try {
    await dbConnect();

    // For simplicity, assume partnerName is passed as query param, but in real app, get from session
    const { searchParams } = new URL(request.url);
    const partnerName = searchParams.get('partnerName');

    if (!partnerName) {
      return NextResponse.json({ success: false, error: 'Partner name required' }, { status: 400 });
    }

    const requests = await AttendanceRequest.find({ partnerName, status: 'Pending' })
      .sort({ createdAt: 1 })
      .populate('userId', 'name email designation')
      .lean();

    // Fetch original attendance data for each request
    const enrichedRequests = await Promise.all(requests.map(async (req: any) => {
      let originalCheckin = '-';
      let originalCheckout = '-';
      
      // Get the original attendance record
      if (req.userId && req.monthYear && req.date) {
        const attendance = await Attendance.findOne({
          userId: req.userId._id || req.userId,
          monthYear: req.monthYear
        }).lean();
        
        if (attendance && attendance.records) {
          const record = attendance.records instanceof Map 
            ? attendance.records.get(req.date)
            : attendance.records[req.date];
          
          if (record) {
            originalCheckin = record.checkin || '00:00';
            originalCheckout = record.checkout || '00:00';
          }
        }
      }
      
      return {
        _id: req._id,
        userName: req.userName,
        date: req.date,
        requestedStatus: req.requestedStatus,
        reason: req.reason,
        startTime: req.startTime,
        endTime: req.endTime,
        originalCheckin,
        originalCheckout
      };
    }));

    return NextResponse.json({
      success: true,
      data: enrichedRequests
    });
  } catch (error) {
    console.error('Fetch Pending Requests Error:', error);
    return NextResponse.json({ success: false, error: 'Failed to fetch requests' }, { status: 500 });
  }
}