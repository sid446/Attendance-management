import Attendance from '@/models/Attendance';

export interface EnrichedTeamAttendanceRequest {
  _id: unknown;
  userId?: unknown;
  userName?: string;
  date: string;
  monthYear?: string;
  requestedStatus: string;
  requestType?: string;
  originalStatus?: string;
  reason?: string;
  startTime?: string;
  endTime?: string;
  status?: string;
  partnerName?: string;
  partnerRemarks?: string;
  partnerApprovedAt?: Date;
  partnerProposedValue?: string;
  hrRemarks?: string;
  hrValue?: string;
  approvedBy?: string;
  approvedByEmail?: string;
  approvedAt?: Date;
  rejectedBy?: string;
  rejectedByEmail?: string;
  rejectedAt?: Date;
  createdAt?: Date;
  updatedAt?: Date;
  extraWorkSlots?: { startTime: string; endTime: string; reason: string }[];
  originalCheckin?: string;
  originalCheckout?: string;
}

export async function enrichAttendanceRequestsWithOriginalTimes(
  requests: Array<Record<string, unknown>>
): Promise<EnrichedTeamAttendanceRequest[]> {
  return Promise.all(
    requests.map(async (req) => {
      let originalCheckin = '-';
      let originalCheckout = '-';

      const effectiveMonthYear =
        (typeof req.monthYear === 'string' && req.monthYear) ||
        (typeof req.date === 'string' ? req.date.substring(0, 7) : null);

      const userRef = req.userId as { _id?: unknown } | unknown;
      const userObjectId =
        userRef && typeof userRef === 'object' && '_id' in userRef
          ? (userRef as { _id?: unknown })._id
          : userRef;

      if (userObjectId && effectiveMonthYear && typeof req.date === 'string') {
        const attendance = await Attendance.findOne({
          userId: userObjectId,
          monthYear: effectiveMonthYear,
        }).lean();

        if (attendance?.records) {
          let record: { checkin?: unknown; checkout?: unknown } | null = null;
          if (attendance.records instanceof Map) {
            record = attendance.records.get(req.date) || null;
          } else {
            record = (attendance.records as Record<string, { checkin?: unknown; checkout?: unknown }>)[req.date] || null;
          }

          if (record) {
            originalCheckin = String(record.checkin || '-');
            originalCheckout = String(record.checkout || '-');
          }
        }
      }

      return {
        ...(req as unknown as EnrichedTeamAttendanceRequest),
        originalCheckin,
        originalCheckout,
      };
    })
  );
}
