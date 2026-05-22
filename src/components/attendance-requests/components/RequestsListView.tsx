'use client';

import React from 'react';
import type { AttendanceRequest, DateRangeGroup, RequestsAdminActionsProps } from '../types';
import { DateRangeRequestBlock } from './cards/DateRangeRequestBlock';
import { IndividualRequestCard } from './cards/IndividualRequestCard';
import { AttendanceRequestsTable } from './table/AttendanceRequestsTable';

export interface RequestsListViewProps extends RequestsAdminActionsProps {
  viewMode: 'cards' | 'table';
  rangeGroups: DateRangeGroup[];
  individualRequests: AttendanceRequest[];
}

export const RequestsListView: React.FC<RequestsListViewProps> = ({
  viewMode,
  rangeGroups,
  individualRequests,
  isAdminView,
  hrAdminHighlight,
  processingRequest,
  openApprovalModal,
}) => {
  const adminProps = { isAdminView, hrAdminHighlight, processingRequest, openApprovalModal };

  if (viewMode === 'table') {
    return (
      <AttendanceRequestsTable
        rangeGroups={rangeGroups}
        individualRequests={individualRequests}
        {...adminProps}
      />
    );
  }

  return (
    <div className="space-y-3">
      {rangeGroups.map((rangeGroup) => (
        <DateRangeRequestBlock key={`range-${rangeGroup.ids.join('-')}`} rangeGroup={rangeGroup} {...adminProps} />
      ))}
      {individualRequests.map((request) => (
        <IndividualRequestCard key={request._id} request={request} {...adminProps} />
      ))}
    </div>
  );
};
