import { NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import PendingAttendance from '@/models/PendingAttendance';
import User from '@/models/User';
import { rankUserCandidates, type CandidateUser } from '@/lib/nameSimilarity';
import { countPendingDays } from '@/lib/reconcilePendingAttendance';

/**
 * HR queue: pending monthly buckets + suggested employees by name similarity (not exact machine match).
 */
export async function GET() {
  try {
    await dbConnect();

    const [pendingDocs, users] = await Promise.all([
      PendingAttendance.find({ status: 'pending' }).sort({ updatedAt: -1 }).limit(100).lean(),
      User.find({ isActive: true }).select('name odId employeeCode').sort({ name: 1 }).lean(),
    ]);

    const data = pendingDocs.map((doc) => ({
      _id: doc._id,
      uploadName: doc.uploadName,
      nameNormalized: doc.nameNormalized,
      monthYear: doc.monthYear,
      dayCount: countPendingDays(doc.records),
      candidates: rankUserCandidates(doc.uploadName, users as CandidateUser[], 5),
    }));

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error('pending-attendance/review GET:', error);
    return NextResponse.json({ success: false, error: 'Failed to load pending review queue' }, { status: 500 });
  }
}
