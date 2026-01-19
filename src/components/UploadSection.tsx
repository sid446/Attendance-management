import React, { ChangeEvent, useState, useEffect } from 'react';
import { Upload, AlertCircle, ChevronDown, ChevronUp, FileSpreadsheet, ChevronRight } from 'lucide-react';

interface MachineFormat {
  machineId: string;
  name: string;
  description: string;
  headers: string[];
}

interface UploadSectionProps {
  file: File | null;
  onFileChange: (e: ChangeEvent<HTMLInputElement>) => void;
  onProcessFile: () => void;
  processing: boolean;
  error: string | null;
  saveMessage: string | null;
  uploadErrors?: { odId: string; reason: string }[];
  machineFormat?: string;
  onMachineFormatChange?: (format: string) => void;
}

export const UploadSection: React.FC<UploadSectionProps> = ({
  file,
  onFileChange,
  onProcessFile,
  processing,
  error,
  saveMessage,
  uploadErrors = [],
  machineFormat = 'machine2',
  onMachineFormatChange
}) => {
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
        <div className="px-3 py-2 text-sm text-slate-400">
          Loading machine formats...
        </div>
      );
    }

    if (machineFormats.length === 0) {
      return (
        <div className="px-3 py-2 text-sm text-slate-400">
          No machine formats available
        </div>
      );
    }

    return machineFormats.map((format) => {
      const isSelected = machineFormat === format.machineId;
      const buttonClassName = `w-full px-3 py-2 text-left hover:bg-slate-700 transition-colors ${
        isSelected ? 'bg-slate-700 text-emerald-400' : 'text-slate-200'
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
          <div className="text-xs text-slate-400 mt-1">{format.description}</div>
        </button>
      );
    });
  };

  return (
    <section className="bg-slate-900/60 border border-slate-800 rounded-xl shadow-sm p-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-xl font-semibold text-slate-50">Upload Attendance Excel</h1>
          <p className="text-xs text-slate-400 mt-1">
            Upload a single-day or full-month Excel export. Records will be mapped, users created if
            missing, and monthly summaries updated.
          </p>
        </div>
        <div className="flex items-center gap-4">
          {/* Machine Format Selector */}
          <div className="relative machine-dropdown">
            <label className="block text-xs font-medium text-slate-300 mb-1">
              Machine Type
            </label>
            <button
              onClick={() => setShowMachineDropdown(!showMachineDropdown)}
              className="flex items-center justify-between px-3 py-2 bg-slate-800 border border-slate-700 rounded-md text-sm text-slate-200 hover:border-slate-600 transition-colors min-w-[200px]"
            >
              <div className="flex items-center gap-2">
                <FileSpreadsheet className="w-4 h-4 text-slate-400" />
                <span>
                  {loadingFormats ? 'Loading...' : (currentFormat?.name || 'Select Machine')}
                </span>
              </div>
              <ChevronDown className={`w-4 h-4 transition-transform ${showMachineDropdown ? 'rotate-180' : ''}`} />
            </button>

            {showMachineDropdown && (
              <div className="absolute top-full mt-1 w-full bg-slate-800 border border-slate-700 rounded-md shadow-lg z-10 max-h-60 overflow-y-auto">
                {renderDropdownContent()}
              </div>
            )}
          </div>

          {/* Add New Machine Button */}
          <button
            onClick={() => setShowAddForm(!showAddForm)}
            className="px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm rounded-md transition-colors flex items-center gap-2"
          >
            <ChevronRight className={`w-4 h-4 transition-transform ${showAddForm ? 'rotate-90' : ''}`} />
            Add Machine
          </button>

          <div className="text-xs text-slate-500">
            Accepted: <span className="text-slate-300">.xlsx, .xls</span>
          </div>
        </div>
      </div>

      {/* Add New Machine Form */}
      {showAddForm && (
        <div className="mb-6 p-4 bg-slate-800/50 border border-slate-700 rounded-lg add-machine-form">
          <h3 className="text-sm font-medium text-slate-200 mb-3">Add New Machine Format</h3>
          <form onSubmit={handleAddMachine} className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Machine ID *
                </label>
                <input
                  type="text"
                  value={newMachine.machineId}
                  onChange={(e) => setNewMachine(prev => ({ ...prev, machineId: e.target.value }))}
                  className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-md text-sm text-slate-200 placeholder-slate-400 focus:border-emerald-500 focus:outline-none"
                  placeholder="e.g., machine3"
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Display Name *
                </label>
                <input
                  type="text"
                  value={newMachine.name}
                  onChange={(e) => setNewMachine(prev => ({ ...prev, name: e.target.value }))}
                  className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-md text-sm text-slate-200 placeholder-slate-400 focus:border-emerald-500 focus:outline-none"
                  placeholder="e.g., BioMax Pro"
                  required
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                Description *
              </label>
              <input
                type="text"
                value={newMachine.description}
                onChange={(e) => setNewMachine(prev => ({ ...prev, description: e.target.value }))}
                className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-md text-sm text-slate-200 placeholder-slate-400 focus:border-emerald-500 focus:outline-none"
                placeholder="e.g., Advanced biometric attendance system"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                Excel Headers * (comma-separated)
              </label>
              <input
                type="text"
                value={newMachine.headers}
                onChange={(e) => setNewMachine(prev => ({ ...prev, headers: e.target.value }))}
                className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-md text-sm text-slate-200 placeholder-slate-400 focus:border-emerald-500 focus:outline-none"
                placeholder="e.g., ID, Name, Date, Check In, Check Out"
                required
              />
              <p className="text-xs text-slate-400 mt-1">
                Enter column headers as they appear in your Excel file, separated by commas
              </p>
            </div>
            {addError && (
              <div className="text-xs text-rose-400 bg-rose-950/40 border border-rose-700/60 px-3 py-2 rounded-md">
                {addError}
              </div>
            )}
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={addingMachine}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-800 disabled:cursor-not-allowed text-white text-sm rounded-md transition-colors"
              >
                {addingMachine ? 'Adding...' : 'Add Machine'}
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
                className="px-4 py-2 bg-slate-600 hover:bg-slate-700 text-slate-200 text-sm rounded-md transition-colors"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="mb-5">
        <label className="block text-xs font-medium text-slate-300 mb-2">Excel file</label>
        <div className="flex items-center gap-3">
          <label className="flex-1 flex items-center justify-between px-4 py-3 border border-dashed border-slate-700 rounded-lg cursor-pointer bg-slate-900/80 hover:border-emerald-500 hover:bg-slate-900 transition-colors">
            <div className="flex items-center gap-2">
              <Upload className="w-4 h-4 text-slate-400" />
              <span className="text-xs text-slate-400 truncate">
                {file ? file.name : 'Click to choose an Excel file'}
              </span>
            </div>
            <span className="text-[11px] text-slate-500">Browse</span>
            <input
              type="file"
              accept=".xlsx,.xls"
              onChange={onFileChange}
              className="hidden"
            />
          </label>
          <button
            onClick={onProcessFile}
            disabled={!file || processing}
            className="px-4 py-2 bg-emerald-500 text-slate-950 text-xs font-medium rounded-md hover:bg-emerald-400 disabled:bg-slate-700 disabled:text-slate-400 disabled:cursor-not-allowed transition-colors"
          >
            {processing ? 'Processing…' : 'Upload & Process'}
          </button>
        </div>
      </div>

      {/* Excel Format Preview */}
      <div className="mb-5">
        <button
          onClick={() => setShowFormatPreview(!showFormatPreview)}
          className="flex items-center gap-2 text-xs text-slate-300 hover:text-slate-100 transition-colors"
        >
          <FileSpreadsheet className="w-4 h-4" />
          <span>View Expected Excel Format</span>
          {showFormatPreview ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>

        {showFormatPreview && (
          <div className="mt-3 border border-slate-700 rounded-lg overflow-hidden">
            <div className="bg-slate-800/50 px-4 py-2 border-b border-slate-700">
              <h3 className="text-sm font-medium text-slate-200">Expected Column Headers</h3>
              <p className="text-xs text-slate-400 mt-1">
                Your Excel file should have these columns in the first row. The system will automatically detect the header row and process attendance records.
              </p>
            </div>
            <div className="max-h-64 overflow-y-auto bg-slate-900/30 p-4">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                {expectedColumns.map((column, index) => (
                  <div
                    key={index}
                    className="text-xs text-slate-300 bg-slate-800/40 px-3 py-2 rounded border border-slate-700/50"
                  >
                    {column}
                  </div>
                ))}
              </div>
              <div className="mt-4 p-3 bg-slate-800/20 rounded border border-slate-700/30">
                <p className="text-xs text-slate-400">
                  <strong>Note:</strong> {currentFormat?.description || 'Please select a machine format to see specific requirements.'}
                  {currentFormat && ' The system will automatically create user accounts if they don\'t exist.'}
                </p>
              </div>
            </div>
          </div>
        )}
      </div>

      {error && (
        <div className="mt-3 bg-rose-950/40 border border-rose-700/60 text-rose-100 px-4 py-3 rounded-md text-xs">
          {error}
        </div>
      )}

      {saveMessage && (
        <div className="mt-3 bg-emerald-950/40 border border-emerald-700/60 text-emerald-100 px-4 py-3 rounded-md text-xs">
          {saveMessage}
        </div>
      )}

      {uploadErrors.length > 0 && (
        <div className="mt-4 border border-rose-800/50 rounded-lg overflow-hidden">
          <div className="bg-rose-950/50 px-4 py-2 border-b border-rose-800/50 flex items-center gap-2">
             <AlertCircle className="w-4 h-4 text-rose-400" />
             <span className="text-xs font-semibold text-rose-200">Failed Records details ({uploadErrors.length})</span>
          </div>
          <div className="max-h-48 overflow-y-auto bg-slate-900/50 p-2">
            <table className="w-full text-left text-[11px]">
              <thead className="text-rose-300 font-medium">
                <tr>
                   <th className="px-2 py-1">ID</th>
                   <th className="px-2 py-1">Reason</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-rose-900/30 text-rose-100/80">
                {uploadErrors.map((err, i) => (
                  <tr key={i} className="hover:bg-rose-900/10">
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
