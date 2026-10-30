import type { ChangeEvent } from 'react';

export interface MachineFormat {
  machineId: string;
  name: string;
  description: string;
  headers: string[];
}

export interface UploadSectionProps {
  // Backwards-compatible single-file prop
  file?: File | null;
  // Optional multi-file prop
  files?: File[];
  // Existing handler (keeps compatibility)
  onFileChange?: (e: ChangeEvent<HTMLInputElement>) => void;
  // New optional multi-file change handler
  onFilesChange?: (files: File[]) => void;
  // Existing single-file process handler (keeps compatibility)
  onProcessFile?: () => void;
  // New optional multi-file process handler. If provided, it'll be called with all selected files.
  onProcessMultiple?: (files: File[]) => void;
  processing: boolean;
  error: string | null;
  saveMessage: string | null;
  uploadErrors?: { odId: string; reason: string }[];
  machineFormat?: string;
  onMachineFormatChange?: (format: string) => void;
  fixedFile?: File | null;
  fixedFiles?: File[];
  onFixedFileChange?: (e: ChangeEvent<HTMLInputElement>) => void;
  onFixedFilesChange?: (files: File[]) => void;
  onProcessFixedFile?: () => void;
  onProcessMultipleFixed?: (files: File[]) => void;
}
