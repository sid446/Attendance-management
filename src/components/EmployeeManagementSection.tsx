import React, { useState, useEffect, ChangeEvent, useMemo } from 'react';
import * as XLSX from 'xlsx';
import { User, ScheduleTime } from '@/types/ui';
import { Edit2, Save, X, Plus, Upload, FileUp, Filter, Trash2, Search, Download, ChevronDown, ChevronUp } from 'lucide-react';

export const EmployeeManagementSection: React.FC<{ selectedUserId?: string | null }> = ({ selectedUserId }) => {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  
  // Edit State
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [formData, setFormData] = useState<Partial<User>>({});
  const [saveLoading, setSaveLoading] = useState<boolean>(false);
  const [isAddingNew, setIsAddingNew] = useState<boolean>(false);

  // Filter State
  const [filterDesignation, setFilterDesignation] = useState<string>('');
  const [searchTerm, setSearchTerm] = useState<string>('');

  // Upload State
  const [isUploading, setIsUploading] = useState<boolean>(false);
  const [uploadStats, setUploadStats] = useState<any>(null);

  // UI State
  const [showAdditionalFields, setShowAdditionalFields] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<'basic' | 'schedule' | 'extended'>('basic');

  // Extra Info State
  const [newExtraLabel, setNewExtraLabel] = useState<string>('');
  const [isSavingExtraLabel, setIsSavingExtraLabel] = useState<boolean>(false);

  // Unique Designations
  const uniqueDesignations = useMemo(() => {
    const list = users.map(u => u.designation).filter(Boolean);
    return Array.from(new Set(list)).sort() as string[];
  }, [users]);

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

  // Set editing user when selectedUserId changes
  useEffect(() => {
    if (selectedUserId && users.length > 0) {
      const user = users.find(u => u._id === selectedUserId);
      if (user) {
        setEditingUser(user);
        setFormData(user);
      }
    }
  }, [selectedUserId, users]);

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

  const handleExtraInfoChange = (index: number, field: 'label' | 'value', value: string) => {
    setFormData(prev => {
      const current = Array.isArray(prev.extraInfo) ? [...prev.extraInfo] : [];
      if (!current[index]) current[index] = { label: '', value: '' };
      current[index] = { ...current[index], [field]: value };
      return { ...prev, extraInfo: current };
    });
  };

  const handleAddExtraInfo = () => {
    setFormData(prev => ({
      ...prev,
      extraInfo: [...(prev.extraInfo || []), { label: '', value: '' }],
    }));
  };

  const handleRemoveExtraInfo = (index: number) => {
    setFormData(prev => {
      const current = Array.isArray(prev.extraInfo) ? [...prev.extraInfo] : [];
      current.splice(index, 1);
      return { ...prev, extraInfo: current };
    });
  };

  const allExtraLabels = useMemo(() => {
    const labels = new Set<string>();
    for (const u of users) {
      if (Array.isArray(u.extraInfo)) {
        for (const item of u.extraInfo) {
          const label = (item.label || '').trim();
          if (label) labels.add(label);
        }
      }
    }
    return Array.from(labels).sort((a, b) => a.localeCompare(b));
  }, [users]);

  const handleAddGlobalExtraLabel = async () => {
    const label = newExtraLabel.trim();
    if (!label) {
      alert('Please enter a label name');
      return;
    }
    if (allExtraLabels.some((l) => l.toLowerCase() === label.toLowerCase())) {
      alert('This field already exists');
      return;
    }

    setIsSavingExtraLabel(true);
    try {
      const res = await fetch('/api/users/extra-info', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ label }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || 'Failed to add field');
      }
      setNewExtraLabel('');
      // Refresh users so new field appears everywhere
      fetchUsers();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to add field');
    } finally {
      setIsSavingExtraLabel(false);
    }
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

  const handleCreateNew = async () => {
    if (!formData.name || !formData.email || !formData.odId || !formData.joiningDate) {
      setError('OD ID, Name, Email, and Joining Date are required');
      return;
    }

    setSaveLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/users', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formData),
      });

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Failed to create user');
      }

      // Add to local state
      setUsers(prev => [...prev, result.data]);
      setIsAddingNew(false);
      setFormData({});
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create employee');
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
        emergencyContactNo: findCol(['Emergency Contact No.', 'Emergency Contact']),
        emergencyContactRelation: findCol(['Relation', 'Emergency Contact Relation']),
        anniversaryDate: findCol(['Anniversary Date']),
        bankName: findCol(['Bank Name']),
        branchName: findCol(['Branch Name']),
        accountNumber: findCol(['Account No.', 'Account Number']),
        ifscCode: findCol(['IFSC', 'IFSC Code']),
        accountType: findCol(['Type of Account', 'Account Type']),
        accountHolderName: findCol(['Name of Account Holder', 'Account Holder Name']),
        aadhaarNumber: findCol(['Aadhar No.', 'Aadhaar Number']),
        panNumber: findCol(['PAN', 'PAN Number']),
        basicSalary: findCol(['Basis Salary/Stipend/Fees', 'Basic Salary']),
        laptopAllowance: findCol(['Laptop Allowance']),
        totalSalaryPerMonth: findCol(['Total Salary (P/M)', 'Total Salary Per Month']),
        totalSalaryPerAnnum: findCol(['Per Annum', 'Total Salary Per Annum']),
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
          emergencyContactNo: getVal(idx.emergencyContactNo),
          emergencyContactRelation: getVal(idx.emergencyContactRelation),
          anniversaryDate: formatExcelDate(row[idx.anniversaryDate]),
          bankName: getVal(idx.bankName),
          branchName: getVal(idx.branchName),
          accountNumber: getVal(idx.accountNumber),
          ifscCode: getVal(idx.ifscCode),
          accountType: getVal(idx.accountType),
          accountHolderName: getVal(idx.accountHolderName),
          aadhaarNumber: getVal(idx.aadhaarNumber),
          panNumber: getVal(idx.panNumber),
          basicSalary: getVal(idx.basicSalary),
          laptopAllowance: getVal(idx.laptopAllowance),
          totalSalaryPerMonth: getVal(idx.totalSalaryPerMonth),
          totalSalaryPerAnnum: getVal(idx.totalSalaryPerAnnum),
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
          schOut,
          extraInfo: allExtraLabels.map(label => {
            const colIndex = headers.findIndex(h => String(h).trim().toLowerCase() === label.toLowerCase());
            const value = colIndex !== -1 ? getVal(colIndex) : '';
            return { label, value: value || '' };
          }),
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

  const handleScheduleUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setLoading(true);
    setUploadStats(null);
    setError(null);

    try {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data, { cellDates: false });
      const worksheet = workbook.Sheets[workbook.SheetNames[0]]; // Assume first sheet or user ensures correct sheet
      const jsonData: any[][] = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

      // Find header row with "Name as per Master Sheet"
      let headerRowIndex = -1;
      for (let i = 0; i < jsonData.length; i++) {
        const row = jsonData[i] as any[];
        if (row && row.some(cell => String(cell).trim().includes('Name as per Master Sheet'))) {
             headerRowIndex = i;
             break;
        }
      }

      if (headerRowIndex === -1) {
          throw new Error('Could not find header row with "Name as per Master Sheet"');
      }

      const headers = jsonData[headerRowIndex].map(h => String(h).trim());
      
      const colDetails = {
          name: headers.findIndex(h => h.includes('Name as per Master Sheet')),
          inTime: headers.findIndex(h => h.includes('Sch-In')),
          outTime: headers.findIndex(h => h === 'Sch-Out'), // Exact match or partial? Use exact to differentiate from other Sch-Outs
          outTimeSat: headers.findIndex(h => h.includes('Sch-Out (For Sat)')),
          outTimeMonth: headers.findIndex(h => h.includes('Sch-Out (Dec- Jan)'))
      };

      if (colDetails.name === -1) throw new Error('Column "Name as per Master Sheet" not found');

      // Helper to format time
      const fmtTime = (val: any) => {
          if (!val) return undefined;
          let s = String(val).trim();
          if (typeof val === 'number') {
              const totalSeconds = Math.round(val * 86400);
              const h = Math.floor(totalSeconds / 3600);
              const m = Math.floor((totalSeconds % 3600) / 60);
              s = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
          }
          // Validate HH:mm
          if (/^\d{1,2}:\d{2}$/.test(s)) {
             const parts = s.split(':');
             return `${parts[0].padStart(2, '0')}:${parts[1]}`;
          }
          return s; 
      };

      const schedules = [];
      for (let i = headerRowIndex + 1; i < jsonData.length; i++) {
          const row = jsonData[i] as any[];
          if (!row || !row[colDetails.name]) continue;

          schedules.push({
              name: row[colDetails.name],
              inTime: colDetails.inTime !== -1 ? fmtTime(row[colDetails.inTime]) : undefined,
              outTime: colDetails.outTime !== -1 ? fmtTime(row[colDetails.outTime]) : undefined,
              outTimeSat: colDetails.outTimeSat !== -1 ? fmtTime(row[colDetails.outTimeSat]) : undefined,
              outTimeMonth: colDetails.outTimeMonth !== -1 ? fmtTime(row[colDetails.outTimeMonth]) : undefined
          });
      }

      const response = await fetch('/api/users/bulk-schedule-update', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ schedules })
      });

      const result = await response.json();
      if (result.success) {
          setUploadStats(result.stats);
          fetchUsers();
      } else {
          throw new Error(result.error);
      }

    } catch (err) {
       setError(err instanceof Error ? err.message : 'Schedule upload failed');
    } finally {
       setLoading(false);
       e.target.value = '';
    }
  };

  const filteredUsers = users.filter((user) => {
    // Designation filter
    if (filterDesignation && user.designation !== filterDesignation) {
      return false;
    }

    // Search term filter
    if (searchTerm) {
      const lowerTerm = searchTerm.toLowerCase();
      const matchName = user.name?.toLowerCase().includes(lowerTerm);
      const matchEmail = user.email?.toLowerCase().includes(lowerTerm);
      const matchOdId = user.odId?.toLowerCase().includes(lowerTerm);
      const matchEmpCode = user.employeeCode?.toLowerCase().includes(lowerTerm);
      
      return matchName || matchEmail || matchOdId || matchEmpCode;
    }

    return true;
  });

  const handleExportToExcel = () => {
    if (!users.length) {
      alert('No employees to export');
      return;
    }

    const headerRow = [
      'Name',
      'Registration / Membership No.',
      'Employee Code',
      'Paid From',
      'Designation',
      'Category',
      'Tally Name',
      'Gender',
      'Asija Mail ID',
      'Parents/Guardians Names',
      'Parents/Guardians Occupation',
      'Cell No.',
      'Alternate No.',
      'Alternate Mail Id',
      'Address 1',
      'Address 2',
      'Emergency Contact No.',
      'Relation',
      'Anniversary Date',
      'Bank Name',
      'Branch Name',
      'Account No.',
      'IFSC',
      'Type of Account',
      'Name of Account Holder',
      'Aadhar No.',
      'PAN',
      'Basis Salary/Stipend/Fees',
      'Laptop Allowance',
      'Total Salary (P/M)',
      'Per Annum',
      'Date of Joining -in Asija',
      'Articleship Start Date',
      'Transfer Case',
      '1st Yr of Articleship',
      '2nd Yr of Articleship',
      '3rd Yr of Articleship',
      'Filled Scholarship',
      'Qualification Level',
      'Next Attempt Due Date',
      'Registered Under Partner',
      'Working Under Partner',
      'Work Timings',
      ...allExtraLabels,
    ];

    const toDateString = (value?: string) => {
      if (!value) return '';
      const d = new Date(value);
      if (isNaN(d.getTime())) return '';
      const yyyy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const dd = String(d.getDate()).padStart(2, '0');
      return `${dd}-${mm}-${yyyy}`;
    };

    const rows = users.map((u) => {
      const regularIn = u.scheduleInOutTime?.inTime || '';
      const regularOut = u.scheduleInOutTime?.outTime || '';
      const workTimingText =
        u.workingTiming && u.workingTiming.trim().length > 0
          ? u.workingTiming
          : regularIn && regularOut
          ? `${regularIn}-${regularOut}`
          : '';

      return [
        u.name || '',
        u.registrationNo || '',
        u.employeeCode || '',
        u.paidFrom || '',
        u.designation || '',
        u.category || '',
        u.tallyName || '',
        u.gender || '',
        u.email || '',
        u.parentName || '',
        u.parentOccupation || '',
        u.mobileNumber || '',
        u.alternateMobileNumber || '',
        u.alternateEmail || '',
        u.address1 || '',
        u.address2 || '',
        u.emergencyContactNo || '',
        u.emergencyContactRelation || '',
        toDateString(u.anniversaryDate),
        u.bankName || '',
        u.branchName || '',
        u.accountNumber || '',
        u.ifscCode || '',
        u.accountType || '',
        u.accountHolderName || '',
        u.aadhaarNumber || '',
        u.panNumber || '',
        u.basicSalary || '',
        u.laptopAllowance || '',
        u.totalSalaryPerMonth || '',
        u.totalSalaryPerAnnum || '',
        toDateString(u.joiningDate),
        toDateString(u.articleshipStartDate),
        u.transferCase || '',
        u.firstYearArticleship || '',
        u.secondYearArticleship || '',
        u.thirdYearArticleship || '',
        u.filledScholarship || '',
        u.qualificationLevel || '',
        toDateString(u.nextAttemptDueDate),
        u.registeredUnderPartner || '',
        u.workingUnderPartner || '',
        workTimingText,
        ...allExtraLabels.map(label => {
          const item = u.extraInfo?.find(e => e.label === label);
          return item?.value || '';
        }),
      ];
    });

    const ws = XLSX.utils.aoa_to_sheet([headerRow, ...rows]);

    // Set column widths so header text is fully visible
    const colWidths = headerRow.map((header) => {
      const base = header.length + 2;
      // Limit max width to keep sheet readable
      const wch = Math.max(12, Math.min(base, 40));
      return { wch };
    });
    (ws as any)['!cols'] = colWidths;
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Master');
    XLSX.writeFile(wb, 'employee_master.xlsx');
  };

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
          {/* Tab Navigation */}
          <div className="md:col-span-2 mb-4">
            <div className="flex space-x-1 bg-slate-950/50 p-1 rounded-lg border border-slate-800">
              <button
                onClick={() => setActiveTab('basic')}
                className={`flex-1 px-3 py-2 text-sm font-medium rounded-md transition-colors ${
                  activeTab === 'basic'
                    ? 'bg-emerald-600 text-white'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
                }`}
              >
                Basic Info
              </button>
              <button
                onClick={() => setActiveTab('schedule')}
                className={`flex-1 px-3 py-2 text-sm font-medium rounded-md transition-colors ${
                  activeTab === 'schedule'
                    ? 'bg-emerald-600 text-white'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
                }`}
              >
                Schedule
              </button>
              <button
                onClick={() => setActiveTab('extended')}
                className={`flex-1 px-3 py-2 text-sm font-medium rounded-md transition-colors ${
                  activeTab === 'extended'
                    ? 'bg-emerald-600 text-white'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
                }`}
              >
                Extended
              </button>
            </div>
          </div>

          {/* Basic Info Tab */}
          {activeTab === 'basic' && (
            <>
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

              {/* Placeholder for second column */}
              <div className="hidden md:block"></div>
            </>
          )}

          {/* Schedule Tab */}
          {activeTab === 'schedule' && (
            <div className="md:col-span-2 space-y-6">
              <h3 className="text-sm font-medium text-slate-300 border-b border-slate-800 pb-2">Work Schedule</h3>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {/* Regular Schedule */}
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-emerald-500/80">Regular (Mon-Fri)</label>
                  <div className="space-y-2">
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
                  <div className="space-y-2">
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
                  <div className="space-y-2">
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
          )}

          {/* Extended Tab */}
          {activeTab === 'extended' && (
            <div className="md:col-span-2">
              <h3 className="text-sm font-medium text-slate-300 border-b border-slate-800 pb-2 mb-4">Extended Details</h3>
              
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

                {/* Emergency Contact & Banking */}
                <div className="md:col-span-3 grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">Emergency Contact No.</label>
                    <input
                      type="text"
                      value={(formData as any).emergencyContactNo || ''}
                      onChange={(e) => handleInputChange('emergencyContactNo' as keyof User, e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-emerald-500/50"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">Relation</label>
                    <input
                      type="text"
                      value={(formData as any).emergencyContactRelation || ''}
                      onChange={(e) => handleInputChange('emergencyContactRelation' as keyof User, e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-emerald-500/50"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">Anniversary Date</label>
                    <input
                      type="date"
                      value={(formData as any).anniversaryDate ? new Date((formData as any).anniversaryDate).toISOString().split('T')[0] : ''}
                      onChange={(e) => handleInputChange('anniversaryDate' as keyof User, e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-emerald-500/50"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">Bank Name</label>
                    <input
                      type="text"
                      value={(formData as any).bankName || ''}
                      onChange={(e) => handleInputChange('bankName' as keyof User, e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-emerald-500/50"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">Branch Name</label>
                    <input
                      type="text"
                      value={(formData as any).branchName || ''}
                      onChange={(e) => handleInputChange('branchName' as keyof User, e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-emerald-500/50"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">Account No.</label>
                    <input
                      type="text"
                      value={(formData as any).accountNumber || ''}
                      onChange={(e) => handleInputChange('accountNumber' as keyof User, e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-emerald-500/50"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">IFSC</label>
                    <input
                      type="text"
                      value={(formData as any).ifscCode || ''}
                      onChange={(e) => handleInputChange('ifscCode' as keyof User, e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-emerald-500/50"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">Type of Account</label>
                    <input
                      type="text"
                      value={(formData as any).accountType || ''}
                      onChange={(e) => handleInputChange('accountType' as keyof User, e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-emerald-500/50"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">Name of Account Holder</label>
                    <input
                      type="text"
                      value={(formData as any).accountHolderName || ''}
                      onChange={(e) => handleInputChange('accountHolderName' as keyof User, e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-emerald-500/50"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">Aadhar No.</label>
                    <input
                      type="text"
                      value={(formData as any).aadhaarNumber || ''}
                      onChange={(e) => handleInputChange('aadhaarNumber' as keyof User, e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-emerald-500/50"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">PAN</label>
                    <input
                      type="text"
                      value={(formData as any).panNumber || ''}
                      onChange={(e) => handleInputChange('panNumber' as keyof User, e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-emerald-500/50"
                    />
                  </div>
                </div>

                {/* Salary Information */}
                <div className="md:col-span-3 grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">Basis Salary/Stipend/Fees</label>
                    <input
                      type="text"
                      value={(formData as any).basicSalary || ''}
                      onChange={(e) => handleInputChange('basicSalary' as keyof User, e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-emerald-500/50"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">Laptop Allowance</label>
                    <input
                      type="text"
                      value={(formData as any).laptopAllowance || ''}
                      onChange={(e) => handleInputChange('laptopAllowance' as keyof User, e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-emerald-500/50"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">Total Salary (P/M)</label>
                    <input
                      type="text"
                      value={(formData as any).totalSalaryPerMonth || ''}
                      onChange={(e) => handleInputChange('totalSalaryPerMonth' as keyof User, e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-emerald-500/50"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">Per Annum</label>
                    <input
                      type="text"
                      value={(formData as any).totalSalaryPerAnnum || ''}
                      onChange={(e) => handleInputChange('totalSalaryPerAnnum' as keyof User, e.target.value)}
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

              {/* Flexible Additional Info */}
              <div className="mt-6 md:col-span-3">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-xs font-semibold text-slate-300 uppercase tracking-wide">Additional Info (PAN, Aadhaar, etc.)</h4>
                  <p className="text-[11px] text-slate-500">Fields are managed from the main page.</p>
                </div>
                <div className="space-y-2">
                  {(formData.extraInfo || []).map((item, idx) => (
                    <div key={idx} className="grid grid-cols-12 gap-2 items-center">
                      <input
                        type="text"
                        value={item.label}
                        disabled
                        className="col-span-4 bg-slate-950 border border-slate-800 rounded px-3 py-2 text-xs text-slate-500 cursor-not-allowed"
                      />
                      <input
                        type="text"
                        placeholder="Value"
                        value={item.value}
                        onChange={(e) => handleExtraInfoChange(idx, 'value', e.target.value)}
                        className="col-span-8 bg-slate-950 border border-slate-800 rounded px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-emerald-500/50"
                      />
                    </div>
                  ))}
                  {(formData.extraInfo || []).length === 0 && (
                    <p className="text-[11px] text-slate-500">No additional info fields defined yet.</p>
                  )}
                </div>
              </div>
            </div>
          )}
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

  // ============== ADD NEW EMPLOYEE FORM VIEW =================
  if (isAddingNew) {
    return (
      <div className="bg-slate-900/50 rounded-lg border border-slate-800 p-6">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-semibold text-purple-400">Add New Employee</h2>
          <button onClick={() => setIsAddingNew(false)} className="text-slate-400 hover:text-slate-200">
            <X className="w-5 h-5" />
          </button>
        </div>

        {error && (
          <div className="bg-rose-500/10 text-rose-300 px-4 py-3 rounded-md mb-6 border border-rose-500/20">
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Tab Navigation */}
          <div className="md:col-span-2 mb-4">
            <div className="flex space-x-1 bg-slate-950/50 p-1 rounded-lg border border-slate-800">
              <button
                onClick={() => setActiveTab('basic')}
                className={`flex-1 px-3 py-2 text-sm font-medium rounded-md transition-colors ${
                  activeTab === 'basic'
                    ? 'bg-purple-600 text-white'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
                }`}
              >
                Basic Info
              </button>
              <button
                onClick={() => setActiveTab('schedule')}
                className={`flex-1 px-3 py-2 text-sm font-medium rounded-md transition-colors ${
                  activeTab === 'schedule'
                    ? 'bg-purple-600 text-white'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
                }`}
              >
                Schedule
              </button>
              <button
                onClick={() => setActiveTab('extended')}
                className={`flex-1 px-3 py-2 text-sm font-medium rounded-md transition-colors ${
                  activeTab === 'extended'
                    ? 'bg-purple-600 text-white'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
                }`}
              >
                Extended
              </button>
            </div>
          </div>

          {/* Basic Info Tab */}
          {activeTab === 'basic' && (
            <>
              <div className="space-y-4">
                <h3 className="text-sm font-medium text-slate-300 border-b border-slate-800 pb-2">Basic Information</h3>
                
                <div>
                  <label className="block text-xs text-slate-400 mb-1">OD ID *</label>
                  <input
                    type="text"
                    value={formData.odId || ''}
                    onChange={(e) => handleInputChange('odId', e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-purple-500/50"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs text-slate-400 mb-1">Name *</label>
                  <input
                    type="text"
                    value={formData.name || ''}
                    onChange={(e) => handleInputChange('name', e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-purple-500/50"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs text-slate-400 mb-1">Email *</label>
                  <input
                    type="email"
                    value={formData.email || ''}
                    onChange={(e) => handleInputChange('email', e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-purple-500/50"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs text-slate-400 mb-1">Designation</label>
                  <input
                    type="text"
                    value={formData.designation || ''}
                    onChange={(e) => handleInputChange('designation', e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-purple-500/50"
                  />
                </div>

                <div>
                  <label className="block text-xs text-slate-400 mb-1">Team</label>
                  <input
                    type="text"
                    value={formData.team || ''}
                    onChange={(e) => handleInputChange('team', e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-purple-500/50"
                  />
                </div>

                <div>
                  <label className="block text-xs text-slate-400 mb-1">Joining Date *</label>
                  <input
                    type="date"
                    value={formData.joiningDate as string || ''}
                    onChange={(e) => handleInputChange('joiningDate', e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-purple-500/50"
                    required
                  />
                </div>
                
                 <div className="flex items-center gap-2 mt-4">
                  <input
                    type="checkbox"
                    id="isActiveNew"
                    checked={formData.isActive !== false} // Default to true for new employees
                    onChange={(e) => handleInputChange('isActive', e.target.checked)}
                    className="w-4 h-4 bg-slate-950 border-slate-800 rounded text-purple-500 focus:ring-0"
                  />
                  <label htmlFor="isActiveNew" className="text-sm text-slate-300">Active Employee</label>
                </div>
              </div>

              {/* Placeholder for second column */}
              <div className="hidden md:block"></div>
            </>
          )}

          {/* Schedule Tab */}
          {activeTab === 'schedule' && (
            <div className="md:col-span-2 space-y-6">
              <h3 className="text-sm font-medium text-slate-300 border-b border-slate-800 pb-2">Work Schedule</h3>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {/* Regular Schedule */}
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-purple-500/80">Regular (Mon-Fri)</label>
                  <div className="space-y-2">
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
                  <label className="text-xs font-semibold text-purple-500/80">Saturday</label>
                  <div className="space-y-2">
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
                  <label className="text-xs font-semibold text-purple-500/80">Monthly Special</label>
                  <div className="space-y-2">
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
          )}

          {/* Extended Tab */}
          {activeTab === 'extended' && (
            <div className="md:col-span-2">
              <h3 className="text-sm font-medium text-slate-300 border-b border-slate-800 pb-2 mb-4">Extended Details (Optional)</h3>
              
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
                      className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-purple-500/50"
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
                          className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-purple-500/50"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-slate-400 mb-1">Address Line 2</label>
                        <input
                          type="text"
                          value={formData.address2 || ''}
                          onChange={(e) => handleInputChange('address2', e.target.value)}
                          className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-purple-500/50"
                        />
                      </div>
                </div>

                {/* Emergency Contact & Banking */}
                <div className="md:col-span-3 grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">Emergency Contact No.</label>
                    <input
                      type="text"
                      value={(formData as any).emergencyContactNo || ''}
                      onChange={(e) => handleInputChange('emergencyContactNo' as keyof User, e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-purple-500/50"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">Relation</label>
                    <input
                      type="text"
                      value={(formData as any).emergencyContactRelation || ''}
                      onChange={(e) => handleInputChange('emergencyContactRelation' as keyof User, e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-purple-500/50"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">Anniversary Date</label>
                    <input
                      type="date"
                      value={(formData as any).anniversaryDate ? new Date((formData as any).anniversaryDate).toISOString().split('T')[0] : ''}
                      onChange={(e) => handleInputChange('anniversaryDate' as keyof User, e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-purple-500/50"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">Bank Name</label>
                    <input
                      type="text"
                      value={(formData as any).bankName || ''}
                      onChange={(e) => handleInputChange('bankName' as keyof User, e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-purple-500/50"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">Branch Name</label>
                    <input
                      type="text"
                      value={(formData as any).branchName || ''}
                      onChange={(e) => handleInputChange('branchName' as keyof User, e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-purple-500/50"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">Account No.</label>
                    <input
                      type="text"
                      value={(formData as any).accountNumber || ''}
                      onChange={(e) => handleInputChange('accountNumber' as keyof User, e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-purple-500/50"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">IFSC</label>
                    <input
                      type="text"
                      value={(formData as any).ifscCode || ''}
                      onChange={(e) => handleInputChange('ifscCode' as keyof User, e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-purple-500/50"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">Type of Account</label>
                    <input
                      type="text"
                      value={(formData as any).accountType || ''}
                      onChange={(e) => handleInputChange('accountType' as keyof User, e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-purple-500/50"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">Name of Account Holder</label>
                    <input
                      type="text"
                      value={(formData as any).accountHolderName || ''}
                      onChange={(e) => handleInputChange('accountHolderName' as keyof User, e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-purple-500/50"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">Aadhar No.</label>
                    <input
                      type="text"
                      value={(formData as any).aadhaarNumber || ''}
                      onChange={(e) => handleInputChange('aadhaarNumber' as keyof User, e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-purple-500/50"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">PAN</label>
                    <input
                      type="text"
                      value={(formData as any).panNumber || ''}
                      onChange={(e) => handleInputChange('panNumber' as keyof User, e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-purple-500/50"
                    />
                  </div>
                </div>

                {/* Salary Information */}
                <div className="md:col-span-3 grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">Basis Salary/Stipend/Fees</label>
                    <input
                      type="text"
                      value={(formData as any).basicSalary || ''}
                      onChange={(e) => handleInputChange('basicSalary' as keyof User, e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-purple-500/50"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">Laptop Allowance</label>
                    <input
                      type="text"
                      value={(formData as any).laptopAllowance || ''}
                      onChange={(e) => handleInputChange('laptopAllowance' as keyof User, e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-purple-500/50"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">Total Salary (P/M)</label>
                    <input
                      type="text"
                      value={(formData as any).totalSalaryPerMonth || ''}
                      onChange={(e) => handleInputChange('totalSalaryPerMonth' as keyof User, e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-purple-500/50"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">Per Annum</label>
                    <input
                      type="text"
                      value={(formData as any).totalSalaryPerAnnum || ''}
                      onChange={(e) => handleInputChange('totalSalaryPerAnnum' as keyof User, e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-purple-500/50"
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
                      className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-purple-500/50"
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
                    className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-purple-500/50"
                  />
                </div>
                 <div>
                  <label className="block text-xs text-slate-400 mb-1">Next Attempt Due</label>
                  <input
                    type="date"
                    value={formData.nextAttemptDueDate ? new Date(formData.nextAttemptDueDate).toISOString().split('T')[0] : ''}
                    onChange={(e) => handleInputChange('nextAttemptDueDate', e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-purple-500/50"
                  />
                </div>

              </div>
            </div>
          )}
        </div>

        <div className="mt-8 flex justify-end gap-3 pt-4 border-t border-slate-800">
          <button
            onClick={() => setIsAddingNew(false)}
            className="px-4 py-2 rounded text-sm text-slate-300 hover:text-white transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleCreateNew}
            disabled={saveLoading || !formData.name || !formData.email || !formData.odId || !formData.joiningDate}
            className="flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded text-sm transition-colors disabled:opacity-50"
          >
            <Plus className="w-4 h-4" />
            {saveLoading ? 'Creating...' : 'Create Employee'}
          </button>
        </div>
      </div>
    );
  }

  // ============== LIST VIEW =================
  return (
    <div className="bg-slate-900/50 rounded-lg border border-slate-800">
      {/* Header */}
      <div className="p-4 border-b border-slate-800">
        <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-semibold text-slate-200">Employee Management</h2>
            {!loading && (
              <span className="px-2.5 py-0.5 rounded-full bg-slate-800 text-xs font-medium text-slate-400 border border-slate-700">
                {filteredUsers.length} employees
                {filterDesignation && <span className="text-slate-500 ml-1">({filterDesignation})</span>}
              </span>
            )}
          </div>
          
          {/* Search and Filter Row */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full lg:w-auto">
            <div className="flex items-center gap-3">
              {/* Search Input */}
              <div className="relative">
                <input
                  type="text"
                  placeholder="Search employees..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="bg-slate-950 border border-slate-700 text-slate-300 text-sm rounded-lg pl-8 pr-3 py-2 focus:outline-none focus:border-emerald-500/50 hover:bg-slate-900 transition-colors w-48 lg:w-64"
                />
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 pointer-events-none" />
              </div>

              {/* Designation Filter */}
              <div className="relative">
                <select
                  value={filterDesignation}
                  onChange={(e) => setFilterDesignation(e.target.value)}
                  className="appearance-none bg-slate-950 border border-slate-700 text-slate-300 text-sm rounded-lg pl-8 pr-8 py-2 focus:outline-none focus:border-emerald-500/50 hover:bg-slate-900 transition-colors cursor-pointer min-w-[140px]"
                >
                  <option value="">All Designations</option>
                  {uniqueDesignations.map((opt) => (
                    <option key={opt} value={opt}>{opt}</option>
                  ))}
                </select>
                <Filter className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 pointer-events-none" />
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex items-center gap-2 flex-wrap">
              {/* Primary Actions */}
              <button
                type="button"
                onClick={() => {
                  setFormData({ isActive: true });
                  setIsAddingNew(true);
                }}
                className="flex items-center gap-2 px-4 py-2 bg-purple-600/20 text-purple-400 border border-purple-500/30 rounded-lg text-sm hover:bg-purple-600/30 transition-colors font-medium"
              >
                <Plus className="w-4 h-4" />
                Add Employee
              </button>

              {/* Bulk Actions Dropdown */}
              <div className="relative">
                <button
                  type="button"
                  className="flex items-center gap-2 px-3 py-2 bg-slate-800/40 text-slate-200 border border-slate-700 rounded-lg text-sm hover:bg-slate-800/70 transition-colors"
                  onClick={() => {/* TODO: Add dropdown logic */}}
                >
                  <FileUp className="w-4 h-4" />
                  Bulk Actions
                </button>
                {/* TODO: Add dropdown menu with bulk update and schedule upload */}
              </div>

              {/* Export Button */}
              <button
                type="button"
                onClick={handleExportToExcel}
                className="flex items-center gap-2 px-3 py-2 bg-slate-800/40 text-slate-200 border border-slate-700 rounded-lg text-sm hover:bg-slate-800/70 transition-colors"
              >
                <Download className="w-4 h-4" />
                Export
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Global Additional Info Fields - Collapsible */}
      <div className="border-b border-slate-800">
        <button
          onClick={() => setShowAdditionalFields(!showAdditionalFields)}
          className="w-full px-4 py-3 flex items-center justify-between text-left hover:bg-slate-800/30 transition-colors"
        >
          <div className="space-y-1">
            <div className="text-xs font-semibold text-slate-300 uppercase tracking-wide">Additional Info Fields</div>
            <div className="text-[11px] text-slate-500">
              {allExtraLabels.length} custom fields • Click to {showAdditionalFields ? 'hide' : 'show'} management
            </div>
          </div>
          {showAdditionalFields ? (
            <ChevronUp className="w-4 h-4 text-slate-400" />
          ) : (
            <ChevronDown className="w-4 h-4 text-slate-400" />
          )}
        </button>
        
        {showAdditionalFields && (
          <div className="px-4 pb-3 flex flex-col md:flex-row md:items-center md:justify-between gap-3 border-t border-slate-800/50">
            <div className="space-y-1">
              {allExtraLabels.length > 0 ? (
                <div className="flex flex-wrap gap-1">
                  {allExtraLabels.map((label) => (
                    <span
                      key={label}
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-800 text-[11px] text-slate-200 border border-slate-700"
                    >
                      <span>{label}</span>
                      <button
                        type="button"
                        className="text-slate-500 hover:text-rose-400"
                        onClick={async () => {
                          if (!window.confirm(`Remove field "${label}" from all employees?`)) return;
                          try {
                            const res = await fetch('/api/users/extra-info', {
                              method: 'DELETE',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ label }),
                            });
                            const json = await res.json();
                            if (!res.ok || !json.success) {
                              throw new Error(json.error || 'Failed to remove field');
                            }
                            fetchUsers();
                          } catch (err) {
                            alert(err instanceof Error ? err.message : 'Failed to remove field');
                          }
                        }}
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
              ) : (
                <p className="text-[11px] text-slate-500">No additional fields yet.</p>
              )}
            </div>
            <div className="flex items-center gap-2">
              <input
                type="text"
                placeholder="Add field (e.g. PAN)"
                value={newExtraLabel}
                onChange={(e) => setNewExtraLabel(e.target.value)}
                className="bg-slate-950 border border-slate-700 text-slate-200 text-xs rounded px-2 py-1 focus:outline-none focus:border-emerald-500/50 min-w-[160px]"
              />
              <button
                type="button"
                onClick={handleAddGlobalExtraLabel}
                disabled={isSavingExtraLabel}
                className="px-3 py-1 rounded text-xs bg-emerald-600 text-white border border-emerald-500/70 hover:bg-emerald-500 disabled:opacity-50"
              >
                {isSavingExtraLabel ? 'Adding...' : 'Add Field'}
              </button>
            </div>
          </div>
        )}
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
                    {uploadStats.errors.map((err: string | number | bigint | boolean | React.ReactElement<unknown, string | React.JSXElementConstructor<any>> | Iterable<React.ReactNode> | React.ReactPortal | Promise<string | number | bigint | boolean | React.ReactPortal | React.ReactElement<unknown, string | React.JSXElementConstructor<any>> | Iterable<React.ReactNode> | null | undefined> | null | undefined, idx: React.Key | null | undefined) => (
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
function setUploadStats(arg0: null) {
  throw new Error('Function not implemented.');
}

