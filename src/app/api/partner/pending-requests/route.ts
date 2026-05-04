import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import '@/models/User';
import AttendanceRequest from '@/models/AttendanceRequest';
import Attendance from '@/models/Attendance';
import { verifyPartnerReviewToken } from '@/lib/partnerReviewToken';

function normalizePartnerName(name: string): string {
  return String(name || '').replace(/[.\s]/g, '').toLowerCase();
}

export async function GET(request: NextRequest) {
  try {
    await dbConnect();

    const { searchParams } = new URL(request.url);
    const token = searchParams.get('token');
    const legacyPartnerName = searchParams.get('partnerName');
    let partnerName = '';
    let partnerEmail: string | null = null;

    if (token) {
      const tokenCheck = verifyPartnerReviewToken(token);
      if (!tokenCheck.valid) {
        return NextResponse.json({ success: false, error: tokenCheck.error }, { status: 401 });
      }
      partnerName = tokenCheck.claims.partnerName;
      partnerEmail = tokenCheck.claims.partnerEmail;
    } else if (process.env.NODE_ENV !== 'production' && legacyPartnerName) {
      partnerName = legacyPartnerName;
    }

    if (!partnerName) {
      return NextResponse.json(
        { success: false, error: 'Secure token is required for partner review access' },
        { status: 401 }
      );
    }

    // Build a case-insensitive exact-match regex for the normalized partner name
    const partnerRegex = new RegExp(
      `^${normalizePartnerName(partnerName).replace(/[.*+?^${}()|[\\]\\]/g, '\\\\$&')}$`,
      'i'
    );

    let requests: any[];

    if (partnerEmail) {
      // If we have a partnerEmail (from token), return pending requests that either
      // - have partnerName matching the partner, OR
      // - belong to a user whose attendanceEmail equals the partnerEmail.
      // Use aggregation to join the user document for the attendanceEmail check and to
      // return a populated `userId` field (so downstream code can use req.userId.name/email).
      const emailRegex = new RegExp(`^${String(partnerEmail).trim().replace(/[.*+?^${}()|[\\]\\]/g, '\\\\$&')}$`, 'i');

      requests = await AttendanceRequest.aggregate([
        { $match: { status: 'Pending' } },
        {
          $lookup: {
            from: 'users',
            localField: 'userId',
            foreignField: '_id',
            as: 'userDoc',
          },
        },
        { $unwind: { path: '$userDoc', preserveNullAndEmptyArrays: true } },
        {
          $match: {
            $or: [
              { partnerName: { $regex: partnerRegex } },
              { 'userDoc.attendanceEmail': { $regex: emailRegex } },
            ],
          },
        },
        { $sort: { createdAt: 1 } },
        {
          $project: {
            _id: 1,
            userId: '$userDoc',
            userName: 1,
            date: 1,
            monthYear: 1,
            requestedStatus: 1,
            reason: 1,
            startTime: 1,
            endTime: 1,
            createdAt: 1,
            partnerName: 1,
            status: 1,
          },
        },
      ]).exec();
    } else {
      // Fallback: match by partnerName only (legacy behavior)
      requests = await AttendanceRequest.find({
        partnerName: { $regex: partnerRegex },
        status: 'Pending',
      })
        .sort({ createdAt: 1 })
        .populate('userId', 'name email designation')
        .lean();
    }

    // Fetch original attendance data for each request
    const enrichedRequests = await Promise.all(requests.map(async (req: any) => {
      let originalCheckin = '-';
      let originalCheckout = '-';
      
      // Get the original attendance record
      const effectiveMonthYear = req.monthYear || (req.date ? req.date.substring(0, 7) : null);
      
      if (req.userId && effectiveMonthYear && req.date) {
        const attendance = await Attendance.findOne({
          userId: req.userId._id || req.userId,
          monthYear: effectiveMonthYear
        }).lean();
        
        if (attendance && attendance.records) {
          // If using lean(), Map might become a plain object
          let record = null;
          if (attendance.records instanceof Map) {
            record = attendance.records.get(req.date);
          } else {
            record = (attendance.records as any)[req.date];
          }
          
          if (record) {
            originalCheckin = record.checkin || '-';
            originalCheckout = record.checkout || '-';
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
      actor: {
        partnerName,
        partnerEmail,
      },
      data: enrichedRequests
    });
  } catch (error) {
    console.error('Fetch Pending Requests Error:', error);
    return NextResponse.json({ success: false, error: 'Failed to fetch requests' }, { status: 500 });
  }
}