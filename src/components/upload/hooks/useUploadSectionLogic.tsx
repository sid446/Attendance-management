import React, { ChangeEvent, useState, useEffect } from 'react';
import { confirmMajorAction } from '@/lib/confirmMajorAction';
import { exportGroupedErrorsToExcel, exportHistoricalLogToExcel, exportAllHistoricalLogsToExcel, sanitizeDownloadFileName } from '@/lib/uploadErrorLogUtils';
import type { MachineFormat, UploadSectionProps } from '../types';

export function useUploadSectionLogic({
  file = null,
  files = [],
  onFileChange,
  onFilesChange,
  onProcessFile,
  onProcessMultiple,
  uploadErrors = [],
  machineFormat = 'machine2',
  onMachineFormatChange,
  fixedFile = null,
  fixedFiles = [],
  onFixedFileChange,
  onFixedFilesChange,
  onProcessFixedFile,
  onProcessMultipleFixed,
}: Pick<UploadSectionProps, 'file' | 'files' | 'onFileChange' | 'onFilesChange' | 'onProcessFile' | 'onProcessMultiple' | 'uploadErrors' | 'machineFormat' | 'onMachineFormatChange' | 'fixedFile' | 'fixedFiles' | 'onFixedFileChange' | 'onFixedFilesChange' | 'onProcessFixedFile' | 'onProcessMultipleFixed'>) {
  const [selectedFiles, setSelectedFiles] = useState<File[]>(file ? [file] : files || []);
  const [showFormatPreview, setShowFormatPreview] = useState(false);
  const [machineFormats, setMachineFormats] = useState<MachineFormat[]>([]);
  const [showMachineDropdown, setShowMachineDropdown] = useState(false);
  const [loadingFormats, setLoadingFormats] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newMachine, setNewMachine] = useState({
    machineId: '',
    name: '',
    description: '',
    headers: ''
  });
  const [addingMachine, setAddingMachine] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [selectedFixedFiles, setSelectedFixedFiles] = useState<File[]>(fixedFile ? [fixedFile] : fixedFiles || []);

  const [showLogs, setShowLogs] = useState(false);
  const [logs, setLogs] = useState<any[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(false);

  const [showPendingReview, setShowPendingReview] = useState(false);
  const [pendingReviewRows, setPendingReviewRows] = useState<
    {
      _id: string;
      uploadName: string;
      monthYear: string;
      dayCount: number;
      candidates: { userId: string; name: string; odId: string; employeeCode: string; score: number }[];
    }[]
  >([]);
  const [loadingPendingReview, setLoadingPendingReview] = useState(false);
  const [assigningPendingId, setAssigningPendingId] = useState<string | null>(null);
  const [selectedCandidateByPending, setSelectedCandidateByPending] = useState<Record<string, string>>({});

  const fetchLogs = async () => {
    setLoadingLogs(true);
    try {
      const response = await fetch('/api/upload-logs?type=attendance');
      const result = await response.json();
      if (result.success) {
        setLogs(result.data);
      }
    } catch (err) {
      console.error('Failed to load logs:', err);
    } finally {
      setLoadingLogs(false);
    }
  };

  useEffect(() => {
    if (showLogs) {
      fetchLogs();
    }
  }, [showLogs]);

  useEffect(() => {
    if (!showPendingReview) return;
    let cancelled = false;
    (async () => {
      setLoadingPendingReview(true);
      try {
        const response = await fetch('/api/pending-attendance/review');
        const result = await response.json();
        if (cancelled || !result.success || !Array.isArray(result.data)) return;
        const rows = result.data as typeof pendingReviewRows;
        setPendingReviewRows(rows);
        const defaults: Record<string, string> = {};
        for (const row of rows) {
          const top = row.candidates?.[0];
          if (top) defaults[row._id] = top.userId;
        }
        setSelectedCandidateByPending(defaults);
      } catch (e) {
        console.error('Failed to load pending review queue:', e);
      } finally {
        if (!cancelled) setLoadingPendingReview(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [showPendingReview]);

  const assignPendingMatch = async (pendingId: string) => {
    const userId = selectedCandidateByPending[pendingId];
    if (!userId) return;
    const row = pendingReviewRows.find((r) => r._id === pendingId);
    const candidate = row?.candidates.find((c) => c.userId === userId);
    if (
      !confirmMajorAction('Apply pending attendance name match', [
        row ? `Name from file: ${row.uploadName}` : '',
        row ? `Month: ${row.monthYear} (${row.dayCount} day(s))` : '',
        candidate ? `Match to: ${candidate.name}` : '',
        'Uploaded attendance rows will be assigned to the selected employee.',
      ].filter(Boolean))
    ) {
      return;
    }
    setAssigningPendingId(pendingId);
    try {
      const response = await fetch('/api/pending-attendance/assign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pendingId, userId }),
      });
      const result = await response.json();
      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Could not apply match');
      }
      setPendingReviewRows((prev) => prev.filter((r) => r._id !== pendingId));
      setSelectedCandidateByPending((prev) => {
        const next = { ...prev };
        delete next[pendingId];
        return next;
      });
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Assign failed');
    } finally {
      setAssigningPendingId(null);
    }
  };

  const groupedCurrentErrors = React.useMemo(() => {
    return uploadErrors.reduce((acc, curr) => {
      const existing = acc.find(e => e.message === curr.reason);
      if (existing) {
        existing.count++;
        if (existing.sampleRows.length < 5 && !existing.sampleRows.includes(curr.odId)) {
          existing.sampleRows.push(curr.odId);
        }
      } else {
        acc.push({
          message: curr.reason,
          count: 1,
          sampleRows: [curr.odId]
        });
      }
      return acc;
    }, [] as { message: string, count: number, sampleRows: string[] }[]);
  }, [uploadErrors]);

  const exportCurrentErrors = async () => {
    try {
      await exportGroupedErrorsToExcel(groupedCurrentErrors, 'Current_Upload_Errors.xlsx');
    } catch (err) {
      console.error('Failed to export current upload errors:', err);
      alert(err instanceof Error ? err.message : 'Failed to download error report');
    }
  };

  const exportHistoricalLog = async (log: any) => {
    try {
      const original = String(log.fileName || 'upload').replace(/\.xlsx$/i, '');
      await exportHistoricalLogToExcel(
        log,
        sanitizeDownloadFileName(`Upload_Errors_${original}.xlsx`)
      );
    } catch (err) {
      console.error('Failed to export historical upload errors:', err);
      alert(err instanceof Error ? err.message : 'Failed to download error report');
    }
  };

  const exportAllHistoricalLogs = async () => {
    if (logs.length === 0) return;
    try {
      const stamp = new Date().toISOString().slice(0, 10);
      await exportAllHistoricalLogsToExcel(
        logs,
        sanitizeDownloadFileName(`All_Upload_Errors_${stamp}.xlsx`)
      );
    } catch (err) {
      console.error('Failed to export all upload error logs:', err);
      alert(err instanceof Error ? err.message : 'Failed to download all error logs');
    }
  };

  // Keep selectedFiles in sync when parent supplies `file` or `files` props
  useEffect(() => {
    if (files && files.length > 0) {
      setSelectedFiles(files);
    } else if (file) {
      setSelectedFiles([file]);
    }
  }, [file, files]);

  useEffect(() => {
    if (fixedFiles && fixedFiles.length > 0) {
      setSelectedFixedFiles(fixedFiles);
    } else if (fixedFile) {
      setSelectedFixedFiles([fixedFile]);
    }
  }, [fixedFile, fixedFiles]);

  // Load machine formats on component mount
  useEffect(() => {
    const loadMachineFormats = async () => {
      try {
        const response = await fetch('/api/machine-formats');
        const result = await response.json();
        if (result.success) {
          setMachineFormats(result.data);
        }
      } catch (error) {
        console.error('Failed to load machine formats:', error);
      } finally {
        setLoadingFormats(false);
      }
    };

    loadMachineFormats();
  }, []);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (showMachineDropdown && !(event.target as Element).closest('.machine-dropdown')) {
        setShowMachineDropdown(false);
      }
      if (showAddForm && !(event.target as Element).closest('.add-machine-form')) {
        setShowAddForm(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showMachineDropdown, showAddForm]);

  const runProcessMachineFiles = () => {
    if (selectedFiles.length === 0) return;
    const fileLabel =
      selectedFiles.length === 1 ? selectedFiles[0].name : `${selectedFiles.length} files`;
    if (
      !confirmMajorAction(
        `Process machine attendance export${selectedFiles.length > 1 ? 's' : ''}`,
        [
          `File(s): ${fileLabel}`,
          `Machine format: ${currentFormat?.name || machineFormat}`,
          'This will import punch data and create or update attendance records for matched employees.',
        ]
      )
    ) {
      return;
    }
    if (selectedFiles.length > 1) {
      if (onProcessMultiple) {
        onProcessMultiple(selectedFiles);
      } else if (onProcessFile) {
        onProcessFile();
      }
    } else {
      onProcessFile?.();
    }
  };

  const runProcessFixedFiles = () => {
    if (selectedFixedFiles.length === 0) return;
    const fileLabel =
      selectedFixedFiles.length === 1
        ? selectedFixedFiles[0].name
        : `${selectedFixedFiles.length} files`;
    if (
      !confirmMajorAction(
        `Process fixed attendance sheet${selectedFixedFiles.length > 1 ? 's' : ''}`,
        [
          `File(s): ${fileLabel}`,
          'This will import present/absent, in-time, and out-time rows from the fixed sheet format.',
          'Unchanged days, approved-request days, location punches, and HR-edited days are left as they are.',
          'If Present replaces a system On leave day, that leave credit is returned and leave is replayed from January so later months pick up paid/unpaid correctly.',
        ]
      )
    ) {
      return;
    }
    if (selectedFixedFiles.length > 1) {
      if (onProcessMultipleFixed) {
        onProcessMultipleFixed(selectedFixedFiles);
      } else if (onProcessFixedFile) {
        onProcessFixedFile();
      }
    } else {
      onProcessFixedFile?.();
    }
  };

  // Get current machine format details
  const currentFormat = machineFormats.find(f => f.machineId === machineFormat);

  const handleFileInputChange = (e: ChangeEvent<HTMLInputElement>) => {
    const list = e.target.files ? Array.from(e.target.files) : [];
    setSelectedFiles(list);
    onFilesChange?.(list);
    onFileChange?.(e);
  };

  const handleFixedFileInputChange = (e: ChangeEvent<HTMLInputElement>) => {
    const list = e.target.files ? Array.from(e.target.files) : [];
    setSelectedFixedFiles(list);
    onFixedFilesChange?.(list);
    onFixedFileChange?.(e);
  };

  // Handle adding new machine format
  const handleAddMachine = async (e: React.FormEvent) => {
    e.preventDefault();
    setAddError(null);

    const headersArray = newMachine.headers.split(',').map(h => h.trim()).filter(h => h.length > 0);
    if (headersArray.length === 0) {
      setAddError('At least one header is required');
      return;
    }

    if (
      !confirmMajorAction('Add a new machine attendance format', [
        `Machine ID: ${newMachine.machineId}`,
        `Name: ${newMachine.name}`,
        `Headers: ${headersArray.join(', ')}`,
      ])
    ) {
      return;
    }

    setAddingMachine(true);

    try {

      const response = await fetch('/api/machine-formats', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          machineId: newMachine.machineId,
          name: newMachine.name,
          description: newMachine.description,
          headers: headersArray
        }),
      });

      const result = await response.json();

      if (result.success) {
        // Add the new format to the local state
        setMachineFormats(prev => [...prev, result.data]);
        // Reset form
        setNewMachine({
          machineId: '',
          name: '',
          description: '',
          headers: ''
        });
        setShowAddForm(false);
        // Optionally switch to the new format
        onMachineFormatChange?.(result.data.machineId);
      } else {
        setAddError(result.error || 'Failed to add machine format');
      }
    } catch (error) {
      setAddError(error instanceof Error ? error.message : 'Failed to add machine format');
    } finally {
      setAddingMachine(false);
    }
  };

  // Expected Excel columns based on selected machine format
  const expectedColumns = currentFormat?.headers || ['ID', 'Name', 'Date', 'In', 'Out'];

  // Render dropdown content
  const renderDropdownContent = () => {
    if (loadingFormats) {
      return (
        <div className="px-3 py-2 text-sm text-slate-500">Loading machine formats…</div>
      );
    }

    if (machineFormats.length === 0) {
      return (
        <div className="px-3 py-2 text-sm text-slate-500">No machine formats available</div>
      );
    }

    return machineFormats.map((format) => {
      const isSelected = machineFormat === format.machineId;
      const buttonClassName = `w-full px-3 py-2 text-left text-sm transition-colors ${
        isSelected ? 'bg-blue-50 font-medium text-blue-900' : 'text-slate-700 hover:bg-slate-50'
      }`;

      return (
        <button
          key={format.machineId}
          onClick={() => {
            onMachineFormatChange?.(format.machineId);
            setShowMachineDropdown(false);
          }}
          className={buttonClassName}
        >
          <div className="font-medium text-sm">{format.name}</div>
          <div className="mt-1 text-xs text-slate-500">{format.description}</div>
        </button>
      );
    });
  };

  return {
    selectedFiles,
    showFormatPreview,
    setShowFormatPreview,
    showMachineDropdown,
    setShowMachineDropdown,
    loadingFormats,
    showAddForm,
    setShowAddForm,
    newMachine,
    setNewMachine,
    addingMachine,
    addError,
    setAddError,
    selectedFixedFiles,
    showLogs,
    setShowLogs,
    logs,
    loadingLogs,
    showPendingReview,
    setShowPendingReview,
    pendingReviewRows,
    loadingPendingReview,
    assigningPendingId,
    selectedCandidateByPending,
    setSelectedCandidateByPending,
    assignPendingMatch,
    groupedCurrentErrors,
    exportCurrentErrors,
    exportHistoricalLog,
    exportAllHistoricalLogs,
    runProcessMachineFiles,
    runProcessFixedFiles,
    currentFormat,
    handleFileInputChange,
    handleFixedFileInputChange,
    handleAddMachine,
    expectedColumns,
    renderDropdownContent,
  } as const;
}
