import React, { ChangeEvent, useState, useEffect } from 'react';
import { Upload, AlertCircle, ChevronDown, ChevronUp, FileSpreadsheet, ChevronRight } from 'lucide-react';

interface MachineFormat {
  machineId: string;
  name: string;
  description: string;
  headers: string[];
}

interface UploadSectionProps {
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
  onFixedFileChange?: (e: ChangeEvent<HTMLInputElement>) => void;
  onProcessFixedFile?: () => void;
}

export const UploadSection: React.FC<UploadSectionProps> = ({
  file = null,
  files = [],
  onFileChange,
  onFilesChange,
  onProcessFile,
  onProcessMultiple,
  processing,
  error,
  saveMessage,
  uploadErrors = [],
  machineFormat = 'machine2',
  onMachineFormatChange,
  fixedFile = null,
  onFixedFileChange,
  onProcessFixedFile
}) => {
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
  const [selectedFixedFile, setSelectedFixedFile] = useState<File | null>(fixedFile);

  // Keep selectedFiles in sync when parent supplies `file` or `files` props
  useEffect(() => {
    if (files && files.length > 0) {
      setSelectedFiles(files);
    } else if (file) {
      setSelectedFiles([file]);
    }
  }, [file, files]);

  useEffect(() => {
    setSelectedFixedFile(fixedFile);
  }, [fixedFile]);

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

  // Get current machine format details
  const currentFormat = machineFormats.find(f => f.machineId === machineFormat);

  const handleFileInputChange = (e: ChangeEvent<HTMLInputElement>) => {
    const list = e.target.files ? Array.from(e.target.files) : [];
    setSelectedFiles(list);
    onFilesChange?.(list);
    onFileChange?.(e);
  };

  const handleFixedFileInputChange = (e: ChangeEvent<HTMLInputElement>) => {
    const nextFile = e.target.files && e.target.files[0] ? e.target.files[0] : null;
    setSelectedFixedFile(nextFile);
    onFixedFileChange?.(e);
  };

  // Handle adding new machine format
  const handleAddMachine = async (e: React.FormEvent) => {
    e.preventDefault();
    setAddError(null);
    setAddingMachine(true);

    try {
      const headersArray = newMachine.headers.split(',').map(h => h.trim()).filter(h => h.length > 0);

      if (headersArray.length === 0) {
        throw new Error('At least one header is required');
      }

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

  return (
    <section className="rounded-md border border-blue-200/65 bg-panel p-5 shadow-sm sm:p-6">
      <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <h1 className="text-lg font-semibold tracking-tight text-slate-900 sm:text-xl">Upload attendance Excel</h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-600">
            Map punch exports to employees, preview rows, then save. Pick the format that matches your device export
            before choosing files.
          </p>
          <ol className="mt-3 flex list-none flex-wrap gap-2 text-xs text-slate-700">
            {['Machine format', 'Excel file(s)', 'Process'].map((t, i) => (
              <li
                key={t}
                className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-slate-50 px-2 py-1"
              >
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-blue-600 text-[10px] font-bold text-white">
                  {i + 1}
                </span>
                {t}
              </li>
            ))}
          </ol>
        </div>
        <div className="flex w-full flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end lg:w-auto lg:max-w-xl lg:justify-end">
          {/* Machine Format Selector */}
          <div className="relative machine-dropdown min-w-[12rem] flex-1">
            <label className="mb-1 block text-xs font-medium text-slate-600">Machine type</label>
            <button
              type="button"
              onClick={() => setShowMachineDropdown(!showMachineDropdown)}
              className="flex min-h-[2.5rem] w-full items-center justify-between rounded-md border border-blue-200/65 bg-panel px-3 py-2 text-left text-sm text-slate-800 transition-colors hover:border-blue-300 focus:outline-none focus:ring-2 focus:ring-blue-500/25"
            >
              <div className="flex min-w-0 items-center gap-2">
                <FileSpreadsheet className="h-4 w-4 shrink-0 text-blue-600" aria-hidden />
                <span className="truncate">
                  {loadingFormats ? 'Loading…' : currentFormat?.name || 'Select machine'}
                </span>
              </div>
              <ChevronDown className={`h-4 w-4 shrink-0 text-slate-500 transition-transform ${showMachineDropdown ? 'rotate-180' : ''}`} aria-hidden />
            </button>

            {showMachineDropdown && (
              <div className="absolute top-full z-20 mt-1 max-h-60 w-full overflow-y-auto rounded-md border border-blue-200/65 bg-panel shadow-lg">
                {renderDropdownContent()}
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={() => setShowAddForm(!showAddForm)}
            className="inline-flex shrink-0 items-center gap-2 rounded-md border border-blue-200/65 bg-panel px-3 py-2 text-sm font-medium text-slate-700 transition-colors hover:border-blue-200 hover:bg-blue-50 hover:text-blue-900"
          >
            <ChevronRight className={`h-4 w-4 transition-transform ${showAddForm ? 'rotate-90' : ''}`} aria-hidden />
            Add machine format
          </button>

          <p className="text-xs text-slate-500 sm:self-center">
            Files: <span className="font-medium text-slate-700">.xlsx, .xls</span>
          </p>
        </div>
      </div>

      {/* Add New Machine Form */}
      {showAddForm && (
        <div className="add-machine-form mb-6 rounded-md border border-slate-200 bg-slate-50/80 p-4">
          <h3 className="mb-3 text-sm font-semibold text-slate-900">Add new machine format</h3>
          <form onSubmit={handleAddMachine} className="space-y-3">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">Machine ID *</label>
                <input
                  type="text"
                  value={newMachine.machineId}
                  onChange={(e) => setNewMachine(prev => ({ ...prev, machineId: e.target.value }))}
                  className="w-full rounded-md border border-blue-200/65 bg-panel px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                  placeholder="e.g., machine3"
                  required
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">Display name *</label>
                <input
                  type="text"
                  value={newMachine.name}
                  onChange={(e) => setNewMachine(prev => ({ ...prev, name: e.target.value }))}
                  className="w-full rounded-md border border-blue-200/65 bg-panel px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                  placeholder="e.g., BioMax Pro"
                  required
                />
              </div>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">Description *</label>
              <input
                type="text"
                value={newMachine.description}
                onChange={(e) => setNewMachine(prev => ({ ...prev, description: e.target.value }))}
                className="w-full rounded-md border border-blue-200/65 bg-panel px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                placeholder="e.g., Advanced biometric attendance system"
                required
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">Excel headers * (comma-separated)</label>
              <input
                type="text"
                value={newMachine.headers}
                onChange={(e) => setNewMachine(prev => ({ ...prev, headers: e.target.value }))}
                className="w-full rounded-md border border-blue-200/65 bg-panel px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                placeholder="e.g., ID, Name, Date, Check In, Check Out"
                required
              />
              <p className="mt-1 text-xs text-slate-500">Use the exact column titles from row 1 of your export, separated by commas.</p>
            </div>
            {addError && (
              <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">{addError}</div>
            )}
            <div className="flex flex-wrap gap-2">
              <button
                type="submit"
                disabled={addingMachine}
                className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {addingMachine ? 'Adding…' : 'Add machine'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowAddForm(false);
                  setNewMachine({
                    machineId: '',
                    name: '',
                    description: '',
                    headers: ''
                  });
                  setAddError(null);
                }}
                className="rounded-md border border-blue-200/65 bg-panel px-4 py-2 text-sm text-slate-700 transition-colors hover:bg-slate-50"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="mb-6">
        <label className="mb-2 block text-xs font-medium text-slate-600">Machine export file(s)</label>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-stretch">
          <label className="flex flex-1 cursor-pointer items-center justify-between gap-2 rounded-lg border border-dashed border-slate-300 bg-slate-50/80 px-4 py-3 transition-colors hover:border-blue-300 hover:bg-blue-50/50">
            <div className="flex min-w-0 items-center gap-2">
              <Upload className="h-4 w-4 shrink-0 text-blue-600" aria-hidden />
              <span className="truncate text-xs text-slate-600">
                {selectedFiles.length > 0 ? (
                  selectedFiles.length === 1 ? selectedFiles[0].name : `${selectedFiles.length} files selected`
                ) : (
                  'Click to choose Excel file(s)'
                )}
              </span>
            </div>
            <span className="shrink-0 text-[11px] font-medium text-slate-500">Browse</span>
            <input type="file" accept=".xlsx,.xls" multiple onChange={handleFileInputChange} className="hidden" />
          </label>
          <button
            type="button"
            onClick={() => {
              if (selectedFiles.length > 1) {
                if (onProcessMultiple) {
                  onProcessMultiple(selectedFiles);
                } else if (onProcessFile) {
                  onProcessFile();
                }
              } else {
                onProcessFile?.();
              }
            }}
            disabled={selectedFiles.length === 0 || processing}
            className="inline-flex shrink-0 items-center justify-center rounded-md bg-blue-600 px-4 py-2.5 text-xs font-semibold text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50 sm:min-w-[10rem]"
          >
            {processing ? 'Processing…' : selectedFiles.length > 1 ? 'Process all files' : 'Process file'}
          </button>
        </div>
      </div>

      <div className="mb-6 rounded-md border border-slate-200 bg-slate-50/60 p-4">
        <div className="mb-3">
          <h3 className="text-sm font-semibold text-slate-900">Fixed attendance sheet (optional)</h3>
          <p className="mt-1 text-xs text-slate-600">
            Required headers: Date, Employee Name, Present / Absent, Actual InTime, Actual OutTime.
          </p>
          <p className="mt-1 text-[11px] text-slate-500">
            Date format: DD-MM-YYYY (example: 02-01-2026). Presence codes supported: Present, WO-Present, HD, OS-P,
            WO-HD, WFH, WO-WFH, Sun, A, Weekoff, OHD-P, OHD.
          </p>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-stretch">
          <label className="flex flex-1 cursor-pointer items-center justify-between gap-2 rounded-lg border border-dashed border-slate-300 bg-panel px-4 py-3 transition-colors hover:border-blue-300 hover:bg-blue-50/40">
            <div className="flex min-w-0 items-center gap-2">
              <Upload className="h-4 w-4 shrink-0 text-slate-500" aria-hidden />
              <span className="truncate text-xs text-slate-600">
                {selectedFixedFile ? selectedFixedFile.name : 'Choose fixed attendance Excel'}
              </span>
            </div>
            <span className="shrink-0 text-[11px] font-medium text-slate-500">Browse</span>
            <input type="file" accept=".xlsx,.xls" onChange={handleFixedFileInputChange} className="hidden" />
          </label>
          <button
            type="button"
            onClick={() => onProcessFixedFile?.()}
            disabled={!selectedFixedFile || processing}
            className="inline-flex shrink-0 items-center justify-center rounded-md border border-blue-200/65 bg-panel px-4 py-2.5 text-xs font-semibold text-slate-800 transition-colors hover:border-blue-200 hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-50 sm:min-w-[10rem]"
          >
            {processing ? 'Processing…' : 'Process fixed sheet'}
          </button>
        </div>
      </div>

      {selectedFiles.length > 1 && (
        <div className="mb-4 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700">
          <div className="mb-1 font-medium text-slate-800">Selected files</div>
          <ul className="max-h-28 list-inside list-disc overflow-y-auto text-slate-600">
            {selectedFiles.map((f, i) => (
              <li key={i} className="truncate">
                {f.name}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Excel Format Preview */}
      <div className="mb-6">
        <button
          type="button"
          onClick={() => setShowFormatPreview(!showFormatPreview)}
          className="flex items-center gap-2 text-sm font-medium text-slate-700 transition-colors hover:text-blue-700"
        >
          <FileSpreadsheet className="h-4 w-4 text-blue-600" aria-hidden />
          <span>Expected Excel layout</span>
          {showFormatPreview ? <ChevronUp className="h-4 w-4" aria-hidden /> : <ChevronDown className="h-4 w-4" aria-hidden />}
        </button>

        {showFormatPreview && (
          <div className="mt-3 overflow-hidden rounded-md border border-slate-200">
            <div className="border-b border-slate-200 bg-slate-50 px-4 py-2">
              <h3 className="text-sm font-semibold text-slate-900">Expected column headers</h3>
              <p className="mt-1 text-xs text-slate-600">
                Your file should include these columns (header row is detected automatically).
              </p>
            </div>
            <div className="max-h-80 overflow-y-auto bg-panel p-4">
              {machineFormat === 'machine2' ? (
                /* Special format preview for Machine 2 complex format */
                <div className="space-y-3">
                  <div className="mb-2 text-xs font-medium text-slate-600">Example file structure</div>
                  <div className="space-y-1 font-mono text-[11px]">
                    <div className="rounded bg-slate-100 px-2 py-1 text-slate-600">Row 1: Date wise Daily Attendance Report (Detailed) For Period : ...</div>
                    <div className="rounded bg-slate-100 px-2 py-1 text-slate-600">Row 2: Company Name : [Company]</div>
                    <div className="flex gap-4 rounded border-l-2 border-blue-500 bg-blue-50 px-2 py-1 text-slate-800">
                      <span className="text-slate-500">Col A:</span> Date :
                      <span className="text-slate-500">Col B:</span> 30-12-2025
                    </div>
                    <div className="flex gap-4 rounded bg-slate-100 px-2 py-1 text-slate-800">
                      <span className="text-slate-500">Col A:</span> Emp Name
                      <span className="text-slate-500">Col B:</span> In Time
                      <span className="text-slate-500">Col C:</span> Out Time
                    </div>
                    <div className="rounded bg-panel px-2 py-1 text-slate-600 ring-1 ring-slate-200">John Doe | 01-01-1900 09:00:00 | 01-01-1900 18:00:00</div>
                    <div className="rounded bg-panel px-2 py-1 text-slate-600 ring-1 ring-slate-200">Jane Smith | 01-01-1900 09:30:00 | 01-01-1900 17:30:00</div>
                    <div className="mt-2 flex gap-4 rounded border-l-2 border-blue-500 bg-blue-50 px-2 py-1 text-slate-800">
                      <span className="text-slate-500">Col A:</span> Date :
                      <span className="text-slate-500">Col B:</span> 31-12-2025
                    </div>
                    <div className="rounded bg-slate-100 px-2 py-1 text-slate-600">... attendance data continues ...</div>
                  </div>
                  <div className="rounded-md border border-amber-200 bg-amber-50 p-2 text-[11px] text-amber-950">
                    <strong>Time format:</strong> Times appear as &quot;01-01-1900 HH:MM:SS&quot; — only the time portion is extracted.
                  </div>
                </div>
              ) : machineFormat === 'machine3' ? (
                /* Special format preview for Machine 3 - Asija format */
                <div className="space-y-3">
                  <div className="mb-2 text-xs font-medium text-slate-600">Example file structure</div>
                  <div className="space-y-1 font-mono text-[11px]">
                    <div className="rounded bg-slate-100 px-2 py-1 text-slate-600">Row 1: Date wise Daily Attendance Report (Detailed) For Period : ...</div>
                    <div className="rounded bg-slate-100 px-2 py-1 text-slate-600">Row 2: Company Name : Asija and Associates LLP</div>
                    <div className="rounded bg-slate-100 px-2 py-1 text-slate-600">Row 3: Location : Delhi</div>
                    <div className="flex gap-4 rounded border-l-2 border-blue-500 bg-blue-50 px-2 py-1 text-slate-800">
                      <span className="text-slate-500">Col A:</span> Date :
                      <span className="text-slate-500">Col B:</span> 30-12-2025
                    </div>
                    <div className="flex gap-4 rounded bg-slate-100 px-2 py-1 text-slate-800">
                      <span className="text-slate-500">Col A:</span> Emp Name
                      <span className="text-slate-500">Col B:</span> In Time
                      <span className="text-slate-500">Col C:</span> Out Time
                    </div>
                    <div className="rounded bg-panel px-2 py-1 text-slate-600 ring-1 ring-slate-200">John Doe | 30-12-2025 08:42:00 | 30-12-2025 18:00:00</div>
                    <div className="rounded bg-panel px-2 py-1 text-slate-600 ring-1 ring-slate-200">Jane Smith | 30-12-2025 09:30:00 | 30-12-2025 17:30:00</div>
                    <div className="mt-2 flex gap-4 rounded border-l-2 border-blue-500 bg-blue-50 px-2 py-1 text-slate-800">
                      <span className="text-slate-500">Col A:</span> Date :
                      <span className="text-slate-500">Col B:</span> 31-12-2025
                    </div>
                    <div className="rounded bg-slate-100 px-2 py-1 text-slate-600">... attendance data continues ...</div>
                  </div>
                  <div className="rounded-md border border-amber-200 bg-amber-50 p-2 text-[11px] text-amber-950">
                    <strong>Time format:</strong> Times appear as &quot;DD-MM-YYYY HH:MM:SS&quot; — only the time portion is extracted.
                  </div>
                </div>
              ) : (
                /* Standard column-based format preview */
                <div className="grid grid-cols-1 gap-2 md:grid-cols-2 lg:grid-cols-3">
                  {expectedColumns.map((column, index) => (
                    <div
                      key={index}
                      className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-800"
                    >
                      {column}
                    </div>
                  ))}
                </div>
              )}
              <div className="mt-4 rounded-md border border-slate-200 bg-slate-50 p-3">
                <p className="text-xs text-slate-600">
                  <strong className="text-slate-800">Note:</strong>{' '}
                  {currentFormat?.description || 'Please select a machine format to see specific requirements.'}
                  {currentFormat && ' The system will match employees by name.'}
                </p>
              </div>
            </div>
          </div>
        )}
      </div>

      {error && (
        <div className="mt-3 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">{error}</div>
      )}

      {saveMessage && (
        <div className="mt-3 rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">{saveMessage}</div>
      )}

      {uploadErrors.length > 0 && (
        <div className="mt-4 overflow-hidden rounded-lg border border-red-200">
          <div className="flex items-center gap-2 border-b border-red-200 bg-red-50 px-4 py-2">
            <AlertCircle className="h-4 w-4 text-red-600" aria-hidden />
            <span className="text-xs font-semibold text-red-900">Rows that did not import ({uploadErrors.length})</span>
          </div>
          <div className="max-h-48 overflow-y-auto bg-panel p-2">
            <table className="w-full text-left text-[11px]">
              <thead className="font-medium text-slate-600">
                <tr>
                  <th className="px-2 py-1">ID</th>
                  <th className="px-2 py-1">Reason</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-800">
                {uploadErrors.map((err, i) => (
                  <tr key={i} className="hover:bg-slate-50">
                    <td className="px-2 py-1 font-mono">{err.odId}</td>
                    <td className="px-2 py-1">{err.reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
};
