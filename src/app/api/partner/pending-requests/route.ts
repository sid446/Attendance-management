import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import AttendanceRequest from '@/models/AttendanceRequest';

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

    return NextResponse.json({
      success: true,
      data: requests.map(req => ({
        _id: req._id,
        userName: req.userName,
        date: req.date,
        requestedStatus: req.requestedStatus,
        reason: req.reason,
        startTime: req.startTime,
        endTime: req.endTime
      }))
    });
  } catch (error) {
    console.error('Fetch Pending Requests Error:', error);
    return NextResponse.json({ success: false, error: 'Failed to fetch requests' }, { status: 500 });
  }
}