import React, { useState, useEffect, ChangeEvent } from 'react';
import * as XLSX from 'xlsx';
import { User, ScheduleTime } from '@/types/ui';
import { Edit2, Save, X, Plus, Upload, FileUp, Filter, Trash2 } from 'lucide-react';

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
  const [uploadStats, setUploadStats] = useState<{created: number, updated: number, failed: number, errors: string[]} | null>(null);

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

  const handleDeleteUser = async (user: User) => {
    if (!window.confirm(`Are you sure you want to delete employee "${user.name}"? This will deactivate their account.`)) {
      return;
    }

    try {
      const response = await fetch(`/api/users/${user._id}`, {
        method: 'DELETE',
      });

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Failed to delete user');
      }

      // Remove from list or mark inactive
      // Since API does soft delete (isActive: false), we might want to filter them out or show them as inactive
      // Current fetchUsers() returns all users, so we can just update local state
      setUsers(prev => prev.filter(u => u._id !== user._id));
      
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to delete user');
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

  const formatExcelDate = (val: any) => {
    if (!val) return undefined;
    
    // Handle string values carefully
    if (typeof val === 'string') {
        const trimmed = val.trim();
        if (['-', 'NA', 'N/A', '', 'na', 'n/a'].includes(trimmed.toLowerCase())) return undefined;
        if (trimmed === '.') return undefined;
        
        // Try parsing string date
        const d = new Date(trimmed);
        return !isNaN(d.getTime()) ? d.toISOString() : undefined;
    }

    if (val instanceof Date) return !isNaN(val.getTime()) ? val.toISOString() : undefined;
    
    if (typeof val === 'number') {
        // Convert Excel serial date to JS Date
        // 25569 is the offset for 1970-01-01
        const date = new Date(Math.round((val - 25569) * 86400 * 1000));
        return !isNaN(date.getTime()) ? date.toISOString() : undefined;
    }
    
    return undefined;
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
      
      // Select sheet: Prioritize "Master", then any non-"Summary", then first sheet
      let targetSheetName = workbook.SheetNames.find(name => name.toLowerCase().includes('master'));
      if (!targetSheetName) {
         // Fallback: try to find one that isn't "Summary"
         targetSheetName = workbook.SheetNames.find(name => !name.toLowerCase().includes('summary'));
      }
      // Ultimate fallback
      if (!targetSheetName) {
         targetSheetName = workbook.SheetNames[0];
      }
      
      const worksheet = workbook.Sheets[targetSheetName];
      const jsonData: any[][] = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

      if (jsonData.length < 2) {
        throw new Error(`Sheet "${targetSheetName}" appears to be empty or missing headers`);
      }

      // Heuristic scan for header row using scoring
      let headerRowIndex = 0;
      let maxScore = 0;

      const scoreKeywords = [
        'designation', 'code', 'paid from', 'category', 
        'gender', 'registration', 'membership', 'tally', 'mail', 
        'parent', 'guardian', 'address', 'articleship', 'joining'
      ];

      for (let i = 0; i < Math.min(jsonData.length, 120); i++) {
        const row = jsonData[i] as any[];
        if (!row || !Array.isArray(row) || row.length === 0) continue;

        const rowStr = row.map(c => String(c || '').toLowerCase().trim());
        
        let score = 0;
        
        // Critical: Must have a Name-like column
        // Higher weight for exact matches
        if (rowStr.some(c => c === 'name' || c === 'employee name' || c === 'staff name' || c === 'student name')) {
            score += 10;
        } else if (rowStr.some(c => c.includes('name'))) {
            score += 5;
        }

        // Add points for other keywords
        const matches = scoreKeywords.filter(kw => rowStr.some(cell => cell.includes(kw))).length;
        score += matches;

        if (score > maxScore) {
            maxScore = score;
            headerRowIndex = i;
        }
      }
      
      // If maxScore is 0, it means we didn't finding ANYTHING resembling a header with Name.
      // We will fallback to 0 but it will likely fail.

      // Find headers
      // Find headers
      const headers = jsonData[headerRowIndex] as string[];
      if (!headers || headers.length === 0) {
          throw new Error('Could not find header row or header row is empty');
      }
      
      // Use lowercase comparison for better matching
      const findCol = (searches: string[]) => {
          return headers.findIndex(h => {
              if (!h) return false;
              const val = String(h).trim().toLowerCase();
              // check for exact match first
              if (searches.some(s => s.toLowerCase() === val)) return true;
              // check for partial match if exact fails? 
              // Let's stick to strict-ish matching but allow variations
              return searches.some(s => val.includes(s.toLowerCase()));
          });
      };

      const idx = {
        name: findCol(['Name', 'Employee Name']),
        regNo: findCol(['Registration / Membership No.', 'Registration No', 'Membership No']),
        empCode: findCol(['Employee Code', 'Emp Code']),
        paidFrom: findCol(['Paid From', 'Paid by']),
        designation: findCol(['Designation']),
        category: findCol(['Category']),
        tallyName: findCol(['Tally Name']),
        gender: findCol(['Gender']),
        email: findCol(['Asija Mail ID', 'Email', 'Mail ID']),
        parentName: findCol(['Parents/Guardians Names', 'Parent / Guardian Name', 'Father Name', 'Parent Name']),
        parentOcc: findCol(['Parents/Guardians Occupation', 'Parent / Guardian Occupation', 'Father Occupation']),
        mobile: findCol(['Cell No.', 'Mobile', 'Phone']),
        altMobile: findCol(['Alternate No.', 'Alternate Mobile']),
        altEmail: findCol(['Alternate Mail Id', 'Alt Email']),
        addr1: findCol(['Address 1', 'Address Line 1', 'Current Address']),
        addr2: findCol(['Address 2', 'Address Line 2', 'Permanent Address']),
        joinDate: findCol(['Date of Joining -in Asija', 'Date of Joining', 'Joining Date']),
        articleStart: findCol(['Articleship Start Date', 'Article Start']),
        transfer: findCol(['Transfer Case']),
        yr1: findCol(['1st Yr of Articleship', '1st Year']),
        yr2: findCol(['2nd Yr of Articleship', '2nd Year']),
        yr3: findCol(['3rd Yr of Articleship', '3rd Year']),
        scholarship: findCol(['Filled Scholarship', 'Scholarship']),
        qual: findCol(['Qualification Level', 'Qualification']),
        nextAttempt: findCol(['Next Attempt Due Date', 'Next Attempt']),
        regPartner: findCol(['Registered Under Partner', 'Reg Partner']),
        workPartner: findCol(['Working Under Partner', 'Work Partner']),
        timing: findCol(['Work Timings', 'Timings', 'Schedule'])
      };

      if (idx.name === -1) {
        throw new Error(`Could not find "Name" column in headers on row ${headerRowIndex + 1}. Found headers: ${headers.map(h => String(h)).join(', ')}`);
      }

      const employees = jsonData.slice(headerRowIndex + 1).map(row => {
        const name = row[idx.name];
        // Ensure name is a non-empty string
        if (!name || String(name).trim() === '') return null;

        // Helper to get val
        const getVal = (i: number) => i !== -1 ? row[i] : undefined;
        
        // Parse Work Timings "10:00-19:00"
        let schIn = '09:00';
        let schOut = '18:00';
        const timingRaw = getVal(idx.timing);
        if (timingRaw && typeof timingRaw === 'string') {
            const parts = timingRaw.split('-');
            if (parts.length >= 2) {
                schIn = parts[0].trim();
                schOut = parts[1].trim();
            }
        }

        return {
          name: String(name),
          registrationNo: getVal(idx.regNo),
          employeeCode: getVal(idx.empCode),
          paidFrom: getVal(idx.paidFrom),
          designation: getVal(idx.designation),
          category: getVal(idx.category),
          tallyName: getVal(idx.tallyName),
          gender: getVal(idx.gender),
            // Use Asija Mail ID as email logic or fallback
          email: getVal(idx.email), 
          parentName: getVal(idx.parentName),
          parentOccupation: getVal(idx.parentOcc),
          mobileNumber: getVal(idx.mobile),
          alternateMobileNumber: getVal(idx.altMobile),
          alternateEmail: getVal(idx.altEmail),
          address1: getVal(idx.addr1),
          address2: getVal(idx.addr2),
          joiningDate: formatExcelDate(row[idx.joinDate]), 
          articleshipStartDate: formatExcelDate(row[idx.articleStart]),
          transferCase: getVal(idx.transfer),
          firstYearArticleship: getVal(idx.yr1),
          secondYearArticleship: getVal(idx.yr2),
          thirdYearArticleship: getVal(idx.yr3),
          filledScholarship: getVal(idx.scholarship),
          qualificationLevel: getVal(idx.qual),
          nextAttemptDueDate: formatExcelDate(row[idx.nextAttempt]),
          registeredUnderPartner: getVal(idx.regPartner),
          workingUnderPartner: getVal(idx.workPartner),
          workingTiming: timingRaw,
          
          schIn,
          schOut
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

        {/* Extended Details */}
        <div className="mt-6 pt-6 border-t border-slate-800">
          <h3 className="text-sm font-medium text-slate-300 mb-4">Extended Details</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            
            {/* Identity & Contact */}
            {[
              { label: 'Registration No.', key: 'registrationNo' },
              { label: 'Employee Code', key: 'employeeCode' },
              { label: 'Paid From', key: 'paidFrom' },
              { label: 'Tally Name', key: 'tallyName' },
              { label: 'Category', key: 'category' },
              { label: 'Gender', key: 'gender' },
              { label: 'Mobile No.', key: 'mobileNumber' },
              { label: 'Alt Mobile', key: 'alternateMobileNumber' },
              { label: 'Alt Email', key: 'alternateEmail' },
              { label: 'Parent Name', key: 'parentName' },
              { label: 'Parent Occ.', key: 'parentOccupation' },
            ].map((field) => (
              <div key={field.key}>
                <label className="block text-xs text-slate-400 mb-1">{field.label}</label>
                <input
                  type="text"
                  value={(formData as any)[field.key] || ''}
                  onChange={(e) => handleInputChange(field.key as keyof User, e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-emerald-500/50"
                />
              </div>
            ))}

            <div className="md:col-span-3 grid grid-cols-1 md:grid-cols-2 gap-4">
                 <div>
                    <label className="block text-xs text-slate-400 mb-1">Address Line 1</label>
                    <input
                      type="text"
                      value={formData.address1 || ''}
                      onChange={(e) => handleInputChange('address1', e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-emerald-500/50"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">Address Line 2</label>
                    <input
                      type="text"
                      value={formData.address2 || ''}
                      onChange={(e) => handleInputChange('address2', e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-emerald-500/50"
                    />
                  </div>
            </div>

            {/* Articleship & Professional */}
            {[
              { label: 'Transfer Case', key: 'transferCase' },
              { label: '1st Year Art.', key: 'firstYearArticleship' },
              { label: '2nd Year Art.', key: 'secondYearArticleship' },
              { label: '3rd Year Art.', key: 'thirdYearArticleship' },
              { label: 'Filled Scholarship', key: 'filledScholarship' },
              { label: 'Qualification', key: 'qualificationLevel' },
              { label: 'Reg. Partner', key: 'registeredUnderPartner' },
              { label: 'Work. Partner', key: 'workingUnderPartner' },
              { label: 'Work Timing (Text)', key: 'workingTiming' },
            ].map((field) => (
              <div key={field.key}>
                 <label className="block text-xs text-slate-400 mb-1">{field.label}</label>
                <input
                  type="text"
                  value={(formData as any)[field.key] || ''}
                  onChange={(e) => handleInputChange(field.key as keyof User, e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-emerald-500/50"
                />
              </div>
            ))}

            {/* Dates */}
             <div>
              <label className="block text-xs text-slate-400 mb-1">Articleship Start</label>
              <input
                type="date"
                value={formData.articleshipStartDate ? new Date(formData.articleshipStartDate).toISOString().split('T')[0] : ''}
                onChange={(e) => handleInputChange('articleshipStartDate', e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-emerald-500/50"
              />
            </div>
             <div>
              <label className="block text-xs text-slate-400 mb-1">Next Attempt Due</label>
              <input
                type="date"
                value={formData.nextAttemptDueDate ? new Date(formData.nextAttemptDueDate).toISOString().split('T')[0] : ''}
                onChange={(e) => handleInputChange('nextAttemptDueDate', e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-emerald-500/50"
              />
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
        <div className="m-4">
          <div className="bg-emerald-500/10 text-emerald-300 px-4 py-3 rounded-md border border-emerald-500/20 text-sm">
            <strong>Upload Complete:</strong> Updated {uploadStats.updated}, Created {uploadStats.created}, Failed {uploadStats.failed}.
          </div>
          {uploadStats.errors && uploadStats.errors.length > 0 && (
            <div className="mt-2 bg-rose-950/20 border border-rose-900/30 rounded-md p-3 max-h-40 overflow-y-auto">
                <p className="text-xs font-semibold text-rose-300 mb-2">Error Details:</p>
                <ul className="text-xs text-rose-400/80 space-y-1">
                    {uploadStats.errors.map((err, idx) => (
                        <li key={idx}>{err}</li>
                    ))}
                </ul>
            </div>
          )}
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
                  <button
                    onClick={() => handleDeleteUser(user)}
                    className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 rounded transition-colors ml-1"
                    title="Delete User"
                  >
                    <Trash2 className="w-4 h-4" />
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
