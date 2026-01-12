import React, { useState, useEffect, ChangeEvent } from 'react';
import * as XLSX from 'xlsx';
import { User, ScheduleTime } from '@/types/ui';
import { Edit2, Save, X, Plus, Upload, FileUp, Filter } from 'lucide-react';

const DESIGNATION_OPTIONS = [
  'Partner',
  'Staff',
  'Director',
  'Article',
  'HR Intern',
  'Asso. Director',
  'AFS Manager',
  'Accounts Executive',
  'Intern'
];

export const EmployeeManagementSection: React.FC = () => {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  
  // Edit State
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [formData, setFormData] = useState<Partial<User>>({});
  const [saveLoading, setSaveLoading] = useState<boolean>(false);

  // Filter State
  const [filterDesignation, setFilterDesignation] = useState<string>('');

  // Bulk Upload State
  const [isUploading, setIsUploading] = useState<boolean>(false);
  const [uploadStats, setUploadStats] = useState<{created: number, updated: number, failed: number} | null>(null);

  // Fetch users
  const fetchUsers = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/users');
      const result = await response.json();
      if (result.success) {
        setUsers(result.data);
      } else {
        throw new Error(result.error);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch users');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const handleEditClick = (user: User) => {
    setEditingUser(user);
    // Deep copy or structured clone to avoid mutation issues, 
    // ensuring dates are strings compatible with inputs if needed
    setFormData({
      ...user,
      joiningDate: user.joiningDate ? new Date(user.joiningDate).toISOString().split('T')[0] : '',
    });
    setError(null);
  };

  const handleCancelEdit = () => {
    setEditingUser(null);
    setFormData({});
    setError(null);
  };

  const handleInputChange = (field: keyof User, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleScheduleChange = (
    scheduleType: 'scheduleInOutTime' | 'scheduleInOutTimeSat' | 'scheduleInOutTimeMonth',
    field: keyof ScheduleTime,
    value: string
  ) => {
    setFormData(prev => ({
      ...prev,
      [scheduleType]: {
        ...(prev[scheduleType] || { inTime: '00:00', outTime: '00:00' }),
        [field]: value
      }
    }));
  };

  const handleSave = async () => {
    if (!editingUser || !editingUser._id) return;

    setSaveLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/users/${editingUser._id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formData),
      });

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Failed to update user');
      }

      // Update local state
      setUsers(prev => prev.map(u => u._id === editingUser._id ? result.data : u));
      setEditingUser(null);
      setFormData({});
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save changes');
    } finally {
      setSaveLoading(false);
    }
  };

  const formatTime = (excelTime: any): string => {
      // Logic duplicated/simplified from main page to avoid circular deps or complex refactor
      if (!excelTime) return '00:00';
      if (typeof excelTime === 'string') return excelTime; // Assume "09:00"
      if (typeof excelTime === 'number') {
        // Excel decimal day
        const totalSeconds = Math.round(excelTime * 24 * 60 * 60);
        const hours = Math.floor(totalSeconds / 3600);
        const minutes = Math.floor((totalSeconds % 3600) / 60);
        return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
      }
      return '00:00';
  };

  const handleBulkUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    setUploadStats(null);
    setError(null);

    try {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data, { cellDates: false });
      const worksheet = workbook.Sheets[workbook.SheetNames[0]];
      const jsonData: any[][] = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

      if (jsonData.length < 2) {
        throw new Error('File appears to be empty or missing headers');
      }

      // Find headers
      const headers = jsonData[0] as string[];
      // Expected columns based on user request:
      // "Name as per Master Sheet", "Designation", "Sch-In", "Sch-Out", "Sch-Out (For Sat)", "Sch-Out (Dec- Jan)"
      
      const nameIdx = headers.findIndex(h => h && h.includes('Name'));
      const desigIdx = headers.findIndex(h => h && h.includes('Designation'));
      const schInIdx = headers.findIndex(h => h && h.includes('Sch-In'));
      const schOutIdx = headers.findIndex(h => h === 'Sch-Out');
      const schOutSatIdx = headers.findIndex(h => h && h.includes('Sch-Out') && h.includes('Sat'));
      const schOutMonthIdx = headers.findIndex(h => h && h.includes('Sch-Out') && (h.includes('Dec') || h.includes('Jan')));

      if (nameIdx === -1) {
        throw new Error('Could not find "Name" column');
      }

      const employees = jsonData.slice(1).map(row => {
        const name = row[nameIdx];
        if (!name) return null;

        return {
          name: String(name),
          designation: desigIdx !== -1 ? row[desigIdx] : undefined,
          schIn: formatTime(row[schInIdx]),
          schOut: formatTime(row[schOutIdx]),
          schOutSat: formatTime(row[schOutSatIdx]),
          schOutMonth: formatTime(row[schOutMonthIdx]),
        };
      }).filter(Boolean);

      const response = await fetch('/api/users/bulk-update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ employees }),
      });

      const result = await response.json();
      if (!result.success) {
        throw new Error(result.error);
      }

      setUploadStats(result.data);
      fetchUsers(); // Refresh list
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setIsUploading(false);
      // Reset input
      e.target.value = '';
    }
  };

  const filteredUsers = filterDesignation 
    ? users.filter(user => user.designation === filterDesignation)
    : users;

  if (loading && !users.length) {
    return <div className="text-slate-400 p-4">Loading employees...</div>;
  }

  // ============== EDIT FORM VIEW =================
  if (editingUser) {
    return (
      <div className="bg-slate-900/50 rounded-lg border border-slate-800 p-6">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-semibold text-emerald-400">Edit Employee</h2>
          <button onClick={handleCancelEdit} className="text-slate-400 hover:text-slate-200">
            <X className="w-5 h-5" />
          </button>
        </div>

        {error && (
          <div className="bg-rose-500/10 text-rose-300 px-4 py-3 rounded-md mb-6 border border-rose-500/20">
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Basic Info */}
          <div className="space-y-4">
            <h3 className="text-sm font-medium text-slate-300 border-b border-slate-800 pb-2">Basic Information</h3>
            
            <div>
              <label className="block text-xs text-slate-400 mb-1">OD ID</label>
              <input
                type="text"
                value={formData.odId || ''}
                onChange={(e) => handleInputChange('odId', e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-emerald-500/50"
              />
            </div>

            <div>
              <label className="block text-xs text-slate-400 mb-1">Name</label>
              <input
                type="text"
                value={formData.name || ''}
                onChange={(e) => handleInputChange('name', e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-emerald-500/50"
              />
            </div>

            <div>
              <label className="block text-xs text-slate-400 mb-1">Email</label>
              <input
                type="email"
                value={formData.email || ''}
                onChange={(e) => handleInputChange('email', e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-emerald-500/50"
              />
            </div>

            <div>
              <label className="block text-xs text-slate-400 mb-1">Designation</label>
              <input
                type="text"
                value={formData.designation || ''}
                onChange={(e) => handleInputChange('designation', e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-emerald-500/50"
              />
            </div>

            <div>
              <label className="block text-xs text-slate-400 mb-1">Team</label>
              <input
                type="text"
                value={formData.team || ''}
                onChange={(e) => handleInputChange('team', e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-emerald-500/50"
              />
            </div>

            <div>
              <label className="block text-xs text-slate-400 mb-1">Joining Date</label>
              <input
                type="date"
                value={formData.joiningDate as string || ''}
                onChange={(e) => handleInputChange('joiningDate', e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-emerald-500/50"
              />
            </div>
            
             <div className="flex items-center gap-2 mt-4">
              <input
                type="checkbox"
                id="isActive"
                checked={formData.isActive || false}
                onChange={(e) => handleInputChange('isActive', e.target.checked)}
                className="w-4 h-4 bg-slate-950 border-slate-800 rounded text-emerald-500 focus:ring-0"
              />
              <label htmlFor="isActive" className="text-sm text-slate-300">Active Employee</label>
            </div>
          </div>

          {/* Schedule Info */}
          <div className="space-y-6">
            <h3 className="text-sm font-medium text-slate-300 border-b border-slate-800 pb-2">Work Schedule</h3>

            {/* Regular Schedule */}
            <div className="space-y-2">
              <label className="text-xs font-semibold text-emerald-500/80">Regular (Mon-Fri)</label>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs text-slate-500">In Time</label>
                  <input
                    type="time"
                    value={formData.scheduleInOutTime?.inTime || ''}
                    onChange={(e) => handleScheduleChange('scheduleInOutTime', 'inTime', e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded px-2 py-1.5 text-sm text-slate-300"
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-500">Out Time</label>
                  <input
                    type="time"
                    value={formData.scheduleInOutTime?.outTime || ''}
                    onChange={(e) => handleScheduleChange('scheduleInOutTime', 'outTime', e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded px-2 py-1.5 text-sm text-slate-300"
                  />
                </div>
              </div>
            </div>

            {/* Saturday Schedule */}
            <div className="space-y-2">
              <label className="text-xs font-semibold text-emerald-500/80">Saturday</label>
              <div className="grid grid-cols-2 gap-2">
                 <div>
                  <label className="text-xs text-slate-500">In Time</label>
                  <input
                    type="time"
                    value={formData.scheduleInOutTimeSat?.inTime || ''}
                    onChange={(e) => handleScheduleChange('scheduleInOutTimeSat', 'inTime', e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded px-2 py-1.5 text-sm text-slate-300"
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-500">Out Time</label>
                  <input
                    type="time"
                    value={formData.scheduleInOutTimeSat?.outTime || ''}
                    onChange={(e) => handleScheduleChange('scheduleInOutTimeSat', 'outTime', e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded px-2 py-1.5 text-sm text-slate-300"
                  />
                </div>
              </div>
            </div>

             {/* Monthly Schedule */}
             <div className="space-y-2">
              <label className="text-xs font-semibold text-emerald-500/80">Monthly Special</label>
              <div className="grid grid-cols-2 gap-2">
                 <div>
                  <label className="text-xs text-slate-500">In Time</label>
                  <input
                    type="time"
                    value={formData.scheduleInOutTimeMonth?.inTime || ''}
                    onChange={(e) => handleScheduleChange('scheduleInOutTimeMonth', 'inTime', e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded px-2 py-1.5 text-sm text-slate-300"
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-500">Out Time</label>
                  <input
                    type="time"
                    value={formData.scheduleInOutTimeMonth?.outTime || ''}
                    onChange={(e) => handleScheduleChange('scheduleInOutTimeMonth', 'outTime', e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded px-2 py-1.5 text-sm text-slate-300"
                  />
                </div>
              </div>
            </div>

          </div>
        </div>

        <div className="mt-8 flex justify-end gap-3 pt-4 border-t border-slate-800">
          <button
            onClick={handleCancelEdit}
            className="px-4 py-2 rounded text-sm text-slate-300 hover:text-white transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saveLoading}
            className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded text-sm transition-colors disabled:opacity-50"
          >
            <Save className="w-4 h-4" />
            {saveLoading ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </div>
    );
  }

  // ============== LIST VIEW =================
  return (
    <div className="bg-slate-900/50 rounded-lg border border-slate-800">
      <div className="p-4 border-b border-slate-800 flex flex-col md:flex-row justify-between items-center gap-4">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-semibold text-slate-200">User Management</h2>
          {!loading && (
            <span className="px-2.5 py-0.5 rounded-full bg-slate-800 text-xs font-medium text-slate-400 border border-slate-700">
              {filteredUsers.length}
              {filterDesignation && <span className="text-slate-500 ml-1">(Filtered)</span>}
            </span>
          )}
        </div>
        
        <div className="flex items-center gap-3">
          
          {/* Designation Filter */}
          <div className="relative">
            <select
              value={filterDesignation}
              onChange={(e) => setFilterDesignation(e.target.value)}
              className="appearance-none bg-slate-950 border border-slate-700 text-slate-300 text-sm rounded pl-8 pr-8 py-1.5 focus:outline-none focus:border-emerald-500/50 hover:bg-slate-900 transition-colors cursor-pointer"
            >
              <option value="">All Designations</option>
              {DESIGNATION_OPTIONS.map((opt) => (
                <option key={opt} value={opt}>{opt}</option>
              ))}
            </select>
            <Filter className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500 pointer-events-none" />
          </div>

          {/* Upload Button */}
          <div className="relative">
            <input
              type="file"
              accept=".xlsx,.xls"
              onChange={handleBulkUpload}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
              disabled={isUploading}
            />
            <button className={`flex items-center gap-2 px-3 py-1.5 bg-emerald-600/20 text-emerald-400 border border-emerald-500/30 rounded text-sm hover:bg-emerald-600/30 transition-colors ${isUploading ? 'opacity-50' : ''}`}>
              {isUploading ? <Upload className="w-4 h-4 animate-bounce" /> : <FileUp className="w-4 h-4" />}
              {isUploading ? 'Uploading...' : 'Bulk Update'}
            </button>
          </div>
        </div>
      </div>
      
      {error && (
        <div className="m-4 bg-rose-500/10 text-rose-300 px-4 py-3 rounded-md border border-rose-500/20">
          {error}
        </div>
      )}

      {uploadStats && (
        <div className="m-4 bg-emerald-500/10 text-emerald-300 px-4 py-3 rounded-md border border-emerald-500/20 text-sm">
          <strong>Upload Complete:</strong> Updated {uploadStats.updated}, Created {uploadStats.created}, Failed {uploadStats.failed}.
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm text-slate-300">
          <thead className="bg-slate-950/50 text-slate-400 font-medium border-b border-slate-800">
            <tr>
              <th className="px-4 py-3">OD ID</th>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Email</th>
              <th className="px-4 py-3">Team</th>
              <th className="px-4 py-3">Designation</th>
              <th className="px-4 py-3">Joined</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {filteredUsers.map((user) => (
              <tr key={user._id} className="hover:bg-slate-800/30 transition-colors">
                <td className="px-4 py-3 font-mono text-slate-400">{user.odId}</td>
                <td className="px-4 py-3 text-slate-200 font-medium">{user.name}</td>
                <td className="px-4 py-3 text-slate-400">{user.email}</td>
                <td className="px-4 py-3 text-slate-400">{user.team || '-'}</td>
                <td className="px-4 py-3 text-slate-400">{user.designation || '-'}</td>
                <td className="px-4 py-3 text-slate-400">
                  {user.joiningDate ? new Date(user.joiningDate).toLocaleDateString() : '-'}
                </td>
                <td className="px-4 py-3 text-right">
                  <button
                    onClick={() => handleEditClick(user)}
                    className="p-1.5 text-slate-400 hover:text-emerald-400 hover:bg-emerald-500/10 rounded transition-colors"
                    title="Edit User"
                  >
                    <Edit2 className="w-4 h-4" />
                  </button>
                </td>
              </tr>
            ))}
            {users.length === 0 && !loading && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-slate-500">
                  No employees found. Upload attendance sheet to auto-create users.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
