'use client';

import { useRef, useState } from 'react';
import { applyActionsFromExcel, exportRequestsToExcel } from '../exports';
import type { AttendanceRequest } from '../types';
import {
  filterIndividualRequests,
  filterRangeGroups,
  groupRequestsIntoRanges,
  type RequestListFilters,
} from '../utils';

interface UseRequestExcelOptions {
  requests: AttendanceRequest[];
  listFilters: RequestListFilters;
  refresh: () => Promise<void>;
  onRequestUpdate?: () => void;
  setError: (error: string | null) => void;
}

export function useRequestExcel({
  requests,
  listFilters,
  refresh,
  onRequestUpdate,
  setError,
}: UseRequestExcelOptions) {
  const uploadInputRef = useRef<HTMLInputElement | null>(null);
  const [excelUploading, setExcelUploading] = useState(false);

  const exportFiltered = () => {
    const { rangeGroups, individualRequests } = groupRequestsIntoRanges(requests);
    void exportRequestsToExcel({
      rangeGroups: filterRangeGroups(rangeGroups, listFilters),
      individualRequests: filterIndividualRequests(individualRequests, listFilters),
    });
  };

  const uploadExcel = async (file: File) => {
    if (excelUploading) return;
    setExcelUploading(true);
    setError(null);

    try {
      const { okCount, failCount, sampleErrors } = await applyActionsFromExcel({
        file,
        requests,
        onRefresh: refresh,
        onRequestUpdate,
      });

      if (failCount === 0) {
        alert(`Excel processed successfully. Updated ${okCount} row(s).`);
      } else {
        alert(
          `Excel processed with some errors.\n\nSuccess: ${okCount}\nFailed: ${failCount}\n\nFirst errors:\n${sampleErrors}`
        );
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to process Excel file.');
    } finally {
      if (uploadInputRef.current) uploadInputRef.current.value = '';
      setExcelUploading(false);
    }
  };

  return { uploadInputRef, excelUploading, exportFiltered, uploadExcel };
}
