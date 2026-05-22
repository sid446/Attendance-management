import type { AttendanceRequest, DateRangeGroup } from '../types';

export const groupRequestsIntoRanges = (
  requests: AttendanceRequest[]
): {
  rangeGroups: DateRangeGroup[];
  individualRequests: AttendanceRequest[];
} => {
  const rangeGroups: DateRangeGroup[] = [];
  const individualRequests: AttendanceRequest[] = [];

  const groupedByCriteria = new Map<string, AttendanceRequest[]>();

  requests.forEach((request) => {
    const key = `${request.userId._id}-${request.requestedStatus}-${request.status}-${request.reason || ''}-${request.partnerName}`;
    if (!groupedByCriteria.has(key)) {
      groupedByCriteria.set(key, []);
    }
    groupedByCriteria.get(key)!.push(request);
  });

  groupedByCriteria.forEach((groupRequests) => {
    if (groupRequests.length === 1) {
      individualRequests.push(groupRequests[0]);
      return;
    }

    groupRequests.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

    const timeWindow = 5 * 60 * 1000;
    const ranges: AttendanceRequest[][] = [];
    let currentRange: AttendanceRequest[] = [groupRequests[0]];

    for (let i = 1; i < groupRequests.length; i++) {
      const prevTime = new Date(currentRange[currentRange.length - 1].createdAt).getTime();
      const currentTime = new Date(groupRequests[i].createdAt).getTime();
      if (currentTime - prevTime <= timeWindow) {
        currentRange.push(groupRequests[i]);
      } else {
        ranges.push(currentRange);
        currentRange = [groupRequests[i]];
      }
    }
    ranges.push(currentRange);

    ranges.forEach((range) => {
      if (range.length === 1) {
        individualRequests.push(range[0]);
      } else {
        const firstRequest = range[0];
        range.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

        rangeGroups.push({
          userName: firstRequest.userName,
          userId: firstRequest.userId._id,
          designation: firstRequest.userId.designation,
          partnerName: firstRequest.partnerName,
          requestedStatus: firstRequest.requestedStatus,
          reason: firstRequest.reason,
          partnerRemarks: firstRequest.partnerRemarks,
          partnerApprovedAt: firstRequest.partnerApprovedAt,
          partnerProposedValue: firstRequest.partnerProposedValue,
          status: firstRequest.status,
          dates: range.map((r) => r.date),
          startDate: range[0].date,
          endDate: range[range.length - 1].date,
          startTime: firstRequest.startTime,
          endTime: firstRequest.endTime,
          approvedBy: firstRequest.approvedBy,
          approvedByEmail: firstRequest.approvedByEmail,
          approvedAt: firstRequest.approvedAt,
          rejectedBy: firstRequest.rejectedBy,
          rejectedByEmail: firstRequest.rejectedByEmail,
          rejectedAt: firstRequest.rejectedAt,
          hrValue: firstRequest.hrValue,
          hrRemarks: firstRequest.hrRemarks,
          createdAt: firstRequest.createdAt,
          ids: range.map((r) => r._id),
        });
      }
    });
  });

  return { rangeGroups, individualRequests };
};
