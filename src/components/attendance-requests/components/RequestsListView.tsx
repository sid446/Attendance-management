'use client';

import React from 'react';
import type { RequestDisplayRow, RequestsAdminActionsProps } from '../types';
import { DateRangeRequestBlock } from './cards/DateRangeRequestBlock';
import { IndividualRequestCard } from './cards/IndividualRequestCard';
import { AttendanceRequestsTable } from './table/AttendanceRequestsTable';

export interface RequestsListViewProps extends RequestsAdminActionsProps {
  viewMode: 'cards' | 'table';
  sortedRequestRows: RequestDisplayRow[];
}

export const RequestsListView: React.FC<RequestsListViewProps> = ({
  viewMode,
  sortedRequestRows,
  isAdminView,
  hrAdminHighlight,
  processingRequest,
  openApprovalModal,
}) => {
  const adminProps = { isAdminView, hrAdminHighlight, processingRequest, openApprovalModal };

  if (viewMode === 'table') {
    return <AttendanceRequestsTable sortedRequestRows={sortedRequestRows} {...adminProps} />;
  }

  return (
    <div className="space-y-3">
      {sortedRequestRows.map((row) =>
        row.type === 'range' ? (
          <DateRangeRequestBlock
            key={`range-${row.item.ids.join('-')}`}
            rangeGroup={row.item}
            {...adminProps}
          />
        ) : (
          <IndividualRequestCard key={row.item._id} request={row.item} {...adminProps} />
        )
      )}
    </div>
  );
};
