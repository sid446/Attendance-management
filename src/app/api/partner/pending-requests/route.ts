import mongoose from 'mongoose';
import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import '@/models/User';
import AttendanceRequest from '@/models/AttendanceRequest';
import { verifyPartnerReviewToken } from '@/lib/partnerReviewToken';
import {
  autoApproveSelfRequests,
  filterSelfApprovablePendingRequestIds,
} from '@/lib/selfApproveAttendanceRequests';
import {
  getVisibleTeamMemberIdSet,
  normalizePartnerName,
  resolveViewerUserIdFromPartnerEmail,
} from '@/lib/teamRequestAuthorization';
import { enrichAttendanceRequestsWithOriginalTimes } from '@/lib/enrichAttendanceRequests';
import { isArticleEmployee } from '@/lib/isArticleEmployee';

export async function GET(request: NextRequest) {
  try {
    await dbConnect();

    const { searchParams } = new URL(request.url);
    const token = searchParams.get('token');
    const legacyPartnerName = searchParams.get('partnerName');
    let partnerName = '';
    let partnerEmail: string | null = null;
    let tokenViewerUserId = '';

    if (token) {
      const tokenCheck = verifyPartnerReviewToken(token);
      if (!tokenCheck.valid) {
        return NextResponse.json({ success: false, error: tokenCheck.error }, { status: 401 });
      }
      partnerName = tokenCheck.claims.partnerName;
      partnerEmail = tokenCheck.claims.partnerEmail;
      tokenViewerUserId = tokenCheck.claims.viewerUserId || '';
    } else if (process.env.NODE_ENV !== 'production' && legacyPartnerName) {
      partnerName = legacyPartnerName;
    }

    if (!partnerName) {
      return NextResponse.json(
        { success: false, error: 'Secure token is required for partner review access' },
        { status: 401 }
      );
    }

    const resolvedViewerUserId =
      tokenViewerUserId ||
      (partnerEmail ? await resolveViewerUserIdFromPartnerEmail(partnerEmail) : '') ||
      '';

    const visibleIds = resolvedViewerUserId
      ? Array.from(await getVisibleTeamMemberIdSet(resolvedViewerUserId))
      : [];

    const partnerRegex = new RegExp(
      `^${normalizePartnerName(partnerName).replace(/[.*+?^${}()|[\\]\\]/g, '\\\\$&')}$`,
      'i'
    );

    const orConditions: Record<string, unknown>[] = [{ partnerName: { $regex: partnerRegex } }];

    if (partnerEmail) {
      const emailRegex = new RegExp(
        `^${String(partnerEmail).trim().replace(/[.*+?^${}()|[\\]\\]/g, '\\\\$&')}$`,
        'i'
      );
      orConditions.push({ 'userDoc.attendanceEmail': { $regex: emailRegex } });
    }

    if (visibleIds.length > 0) {
      orConditions.push({
        userId: {
          $in: visibleIds
            .filter((id) => mongoose.Types.ObjectId.isValid(id))
            .map((id) => new mongoose.Types.ObjectId(id)),
        },
      });
    }

    let requests = await AttendanceRequest.aggregate([
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
      { $match: { $or: orConditions } },
      { $sort: { createdAt: 1 } },
      {
        $project: {
          _id: 1,
          userId: '$userDoc',
          userName: 1,
          date: 1,
          monthYear: 1,
          requestedStatus: 1,
          requestType: 1,
          reason: 1,
          startTime: 1,
          endTime: 1,
          extraWorkSlots: 1,
          createdAt: 1,
          partnerName: 1,
          status: 1,
        },
      },
    ]).exec();

    if (partnerEmail && token && Array.isArray(requests) && requests.length > 0) {
      const tokenEmail = String(partnerEmail).trim().toLowerCase();
      const selfIds = filterSelfApprovablePendingRequestIds(requests, tokenEmail);

      if (selfIds.length > 0) {
        const origin = new URL(request.url).origin;
        const approvedIds = await autoApproveSelfRequests(
          selfIds.map((id) => {
            const row = requests.find((r: { _id: unknown }) => String(r._id) === id);
            return { requestId: id, date: String(row?.date || '') };
          }),
          { name: partnerName, email: tokenEmail, attendanceEmail: tokenEmail },
          origin
        );

        const selfIdSet = new Set(approvedIds);
        requests = requests.filter((r: { _id: unknown }) => !selfIdSet.has(String(r._id)));
      }
    }

    const enrichedRequests = await enrichAttendanceRequestsWithOriginalTimes(
      requests as Array<Record<string, unknown>>
    );

    return NextResponse.json({
      success: true,
      actor: {
        partnerName,
        partnerEmail,
      },
      data: enrichedRequests.map((req) => ({
        _id: req._id,
        userName: req.userName,
        date: req.date,
        requestedStatus: req.requestedStatus,
        requestType: req.requestType,
        reason: req.reason,
        startTime: req.startTime,
        endTime: req.endTime,
        extraWorkSlots: req.extraWorkSlots,
        originalCheckin: req.originalCheckin,
        originalCheckout: req.originalCheckout,
        isArticleEmployee: isArticleEmployee(
          req.userId as { employmentType?: unknown; designation?: unknown; category?: unknown }
        ),
      })),
    });
  } catch (error) {
    console.error('Fetch Pending Requests Error:', error);
    return NextResponse.json({ success: false, error: 'Failed to fetch requests' }, { status: 500 });
  }
}
