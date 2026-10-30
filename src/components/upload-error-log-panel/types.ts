import type { GroupedUploadError, UploadLogType } from '@/lib/uploadErrorLogUtils';

export interface UploadErrorLogPanelProps {
  groupedErrors: GroupedUploadError[];
  logType: UploadLogType;
  sectionTitle?: string;
  currentErrorsLabel?: string;
  exportFilePrefix: string;
}
