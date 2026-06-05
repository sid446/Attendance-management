'use client';

import React from 'react';
import {
  RequestsApprovalModal,
  RequestsEmptyState,
  RequestsErrorBanner,
  RequestsHeader,
  RequestsListView,
  RequestsLoadingState,
} from './components';
import { useAttendanceRequests, useRequestApproval, useRequestExcel, useRequestFilters } from './hooks';
import type { AttendanceRequestsSectionProps } from './types';

export type { AttendanceRequestsSectionProps } from './types';

export const AttendanceRequestsSection: React.FC<AttendanceRequestsSectionProps> = ({
  userId,
  partnerName,
  isEmployeeView = false,
  isAdminView = false,
  userRole = 'Partner',
  onRequestUpdate,
}) => {
  const { requests, loading, error, setError, refresh } = useAttendanceRequests({ userId, partnerName });

  const filters = useRequestFilters(requests);
  const approval = useRequestApproval({ requests, refresh, onRequestUpdate, setError });
  const excel = useRequestExcel({
    requests,
    listFilters: filters.listFilters,
    refresh,
    onRequestUpdate,
    setError,
  });

  const hrAdminHighlight = isAdminView && userRole === 'HR';

  if (loading) {
    return <RequestsLoadingState />;
  }

  return (
    <section
      className="rounded-xl border border-blue-200/65 bg-panel p-6 shadow-sm"
      aria-labelledby="attendance-requests-heading"
    >
      <RequestsHeader
        isEmployeeView={isEmployeeView}
        isAdminView={isAdminView}
        requests={requests}
        viewMode={filters.viewMode}
        onViewModeChange={filters.setViewMode}
        monthFilter={filters.monthFilter}
        onMonthFilterChange={filters.setMonthFilter}
        leaveTypeFilter={filters.leaveTypeFilter}
        onLeaveTypeFilterChange={filters.setLeaveTypeFilter}
        statusFilter={filters.statusFilter}
        onStatusFilterChange={filters.setStatusFilter}
        onExport={excel.exportFiltered}
        excelUploading={excel.excelUploading}
        uploadInputRef={excel.uploadInputRef}
        onExcelUpload={excel.uploadExcel}
      />

      {error && <RequestsErrorBanner message={error} />}

      {filters.isEmpty ? (
        <RequestsEmptyState hasActiveFilters={filters.hasActiveFilters} />
      ) : (
        <RequestsListView
          viewMode={filters.viewMode}
          sortedRequestRows={filters.sortedRequestRows}
          isAdminView={isAdminView}
          hrAdminHighlight={hrAdminHighlight}
          processingRequest={approval.processingRequest}
          openApprovalModal={approval.openApprovalModal}
        />
      )}

      <RequestsApprovalModal
        isOpen={approval.showApprovalModal}
        action={approval.approvalAction}
        selectedRequestId={approval.selectedRequestId}
        requests={requests}
        remarks={approval.approvalRemarks}
        onRemarksChange={approval.setApprovalRemarks}
        value={approval.approvalValue}
        onValueChange={approval.setApprovalValue}
        valueError={approval.approvalValueError}
        onValueErrorClear={approval.clearApprovalValueError}
        modalProcessing={approval.modalProcessing}
        onClose={approval.closeApprovalModal}
        onSubmit={approval.handleModalSubmit}
      />
    </section>
  );
};
