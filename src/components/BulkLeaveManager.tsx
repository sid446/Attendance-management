
import React, { useState, useEffect, useRef } from 'react';
import { X, Search, Save, Loader2, ArrowRight, UserPlus, Trash2 } from 'lucide-react';
import { User } from '@/types/ui';

interface BulkLeaveManagerProps {
  isOpen: boolean;
  onClose: () => void;
  users: User[];
  currentMonthYear: string;
  onUpdateComplete: () => void;
}

interface AbsentRecord {
  userId: string;
  userName: string;
  odId: string;
  date: string;
  monthYear: string;
  currentStatus: string;
}

export const BulkLeaveManager: React.FC<BulkLeaveManagerProps> = ({
  isOpen,
  onClose,
  users,
  currentMonthYear,
  onUpdateComplete
}) => {
  // 1. Search State
  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState<User[]>([]);
  const searchContainerRef = useRef<HTMLDivElement>(null);
  
  // 2. Records State
  // We keep track of added users to avoid re-fetching or duplicates
  const [addedUserIds, setAddedUserIds] = useState<Set<string>>(new Set());
  const [absentRecords, setAbsentRecords] = useState<AbsentRecord[]>([]);
  const [loadingRecords, setLoadingRecords] = useState(false);
  const [selectedRecordKeys, setSelectedRecordKeys] = useState<Set<string>>(new Set()); // Keys: "userId|date"
  
  // 3. Action State
  const [updating, setUpdating] = useState(false);
  const [targetStatus, setTargetStatus] = useState<string>('Leave');

  const statusOptions = [
      'Leave',
      'Official Holiday Duty (OHD)',
      'Weekly Off - Present (WO-Present)',
      'Half Day (HD)',
      'Work From Home (WFH)',
      'Weekly Off - Work From Home (WO-WFH)',
      'Onsite Presence (OS-P)',
      'Week Off'
  ];

  // Reset on open
  useEffect(() => {
    if (isOpen) {
        setAbsentRecords([]);
        setAddedUserIds(new Set());
        setSelectedRecordKeys(new Set());
        setSearchTerm('');
        setSearchResults([]);
    }
  }, [isOpen]);

  // Search Effect
  useEffect(() => {
    if (!searchTerm.trim()) {
        setSearchResults([]);
        return;
    }
    const lower = searchTerm.toLowerCase();
    const results = users.filter(u => 
        (u.name && u.name.toLowerCase().includes(lower)) || 
        (u.odId && u.odId.toLowerCase().includes(lower))
    ).slice(0, 8); // Limit to 8 results for dropdown
    setSearchResults(results);
  }, [searchTerm, users]);

  // Handle clicking outside search to close dropdown
  useEffect(() => {
      const handleClickOutside = (event: MouseEvent) => {
          if (searchContainerRef.current && !searchContainerRef.current.contains(event.target as Node)) {
              setSearchResults([]);
          }
      };
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Handler: Add User & Fetch Records
  const addUserAndFetch = async (user: User) => {
      if (addedUserIds.has(user._id)) {
          setSearchTerm(''); // Just clear search if already added
          return;
      }

      setLoadingRecords(true);
      setSearchTerm(''); // Clear instantly for UI responsiveness
      setSearchResults([]); // Hide dropdown immediately
      
      try {
        const res = await fetch('/api/attendance/absent-records', {
            method: 'POST',
            body: JSON.stringify({ userIds: [user._id], monthYear: currentMonthYear })
        });
        const json = await res.json();
        
        if (json.success) {
            setAddedUserIds(prev => new Set(prev).add(user._id));
            const newRecords = json.data as AbsentRecord[];
            
            if (newRecords.length > 0) {
                setAbsentRecords(prev => [...prev, ...newRecords]);
                // Auto-select newly added records
                const newKeys = newRecords.map(r => `${r.userId}|${r.date}`);
                setSelectedRecordKeys(prev => {
                    const next = new Set(prev);
                    newKeys.forEach(k => next.add(k));
                    return next;
                });
            } else {
                // Optional: Notification that no records were found?
            }
        }
      } catch (e) {
          console.error(e);
          alert('Failed to fetch records');
      } finally {
          setLoadingRecords(false);
      }
  };

  // Handler: Update Status
  const handleUpdate = async () => {
    if (selectedRecordKeys.size === 0) return;
    setUpdating(true);
    
    const updates = Array.from(selectedRecordKeys).map(key => {
        const [userId, date] = key.split('|');
        return { userId, date, monthYear: currentMonthYear };
    });

    try {
        const res = await fetch('/api/attendance/update-status', {
            method: 'POST',
            body: JSON.stringify({ updates, newStatus: targetStatus })
        });
        const json = await res.json();
        if (json.success) {
            alert(`Successfully updated ${json.updated} records to ${targetStatus}.`);
            onUpdateComplete();
            onClose();
        } else {
            alert('Update failed');
        }
    } catch (e) {
        alert('Error updating');
    } finally {
        setUpdating(false);
    }
  };

  const toggleRecord = (key: string) => {
      const next = new Set(selectedRecordKeys);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      setSelectedRecordKeys(next);
  };
  
  const removeRecord = (key: string) => {
    const nextKeys = new Set(selectedRecordKeys);
    nextKeys.delete(key);
    setSelectedRecordKeys(nextKeys);
    setAbsentRecords(prev => prev.filter(r => `${r.userId}|${r.date}` !== key));
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
        <div className="flex flex-col w-full max-w-4xl h-[85vh] bg-slate-900 border border-slate-800 rounded-xl shadow-2xl overflow-hidden">
            
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-slate-800 bg-slate-950">
                <div>
                   <h2 className="text-lg font-semibold text-white">Bulk Leave Status Manager</h2>
                   <p className="text-xs text-slate-400">Search employees and approve absent days as Leave</p>
                </div>
                <button onClick={onClose} className="p-2 text-slate-400 hover:text-white rounded-full hover:bg-slate-800">
                    <X className="w-5 h-5"/>
                </button>
            </div>

            {/* Main Content */}
            <div className="flex-1 overflow-hidden flex flex-col p-4 gap-4">
                
                {/* 1. Search Bar */}
                <div className="relative z-20" ref={searchContainerRef}>
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                        <input
                            type="text"
                            placeholder="Search employee by name or ID to add..."
                            value={searchTerm}
                            onChange={e => setSearchTerm(e.target.value)}
                            className="w-full bg-slate-950 border border-slate-800 rounded-lg py-3 pl-10 pr-4 text-sm text-slate-200 outline-none focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/20 placeholder:text-slate-600 shadow-sm"
                            autoComplete="off"
                        />
                        {loadingRecords && (
                            <div className="absolute right-3 top-1/2 -translate-y-1/2">
                                <Loader2 className="w-4 h-4 text-emerald-500 animate-spin" />
                            </div>
                        )}
                    </div>

                    {/* Autocomplete Dropdown */}
                    {searchResults.length > 0 && (
                        <div className="absolute top-full left-0 right-0 mt-1 bg-slate-900 border border-slate-700 rounded-lg shadow-xl overflow-hidden max-h-60 overflow-y-auto">
                            {searchResults.map(user => {
                                const isAdded = addedUserIds.has(user._id);
                                return (
                                    <button
                                        key={user._id}
                                        onClick={() => addUserAndFetch(user)}
                                        disabled={isAdded}
                                        className={`w-full flex items-center justify-between px-4 py-3 text-left hover:bg-slate-800 border-b border-slate-800/50 last:border-0 transition-colors ${isAdded ? 'opacity-50 cursor-not-allowed' : ''}`}
                                    >
                                        <div className="flex flex-col">
                                            <span className="text-slate-200 font-medium text-sm">{user.name}</span>
                                            <span className="text-slate-500 text-xs font-mono">{user.odId || 'No ID'}</span>
                                        </div>
                                        {!isAdded && <UserPlus className="w-4 h-4 text-emerald-500" />}
                                        {isAdded && <span className="text-xs text-emerald-600 font-medium">Added</span>}
                                    </button>
                                );
                            })}
                        </div>
                    )}
                </div>

                {/* 2. Records List (Dynamic Table) */}
                <div className="flex-1 bg-slate-950/30 border border-slate-800 rounded-lg flex flex-col min-h-0">
                    {/* List Header */}
                    <div className="px-4 py-2 border-b border-slate-800 bg-slate-900/50 flex items-center justify-between">
                        <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-2">
                             Review Absent Records 
                             <span className="px-2 py-0.5 bg-slate-800 rounded-full text-slate-300">{absentRecords.length}</span>
                        </div>
                        {absentRecords.length > 0 && (
                             <div className="flex items-center gap-2">
                                <label className="text-xs text-slate-400 cursor-pointer flex items-center gap-1.5 hover:text-white">
                                    <input 
                                        type="checkbox" 
                                        className="rounded bg-slate-800 border-slate-700 w-3.5 h-3.5"
                                        checked={selectedRecordKeys.size === absentRecords.length && absentRecords.length > 0}
                                        onChange={(e) => {
                                            if (e.target.checked) {
                                                const all = new Set(absentRecords.map(r => `${r.userId}|${r.date}`));
                                                setSelectedRecordKeys(all);
                                            } else {
                                                setSelectedRecordKeys(new Set());
                                            }
                                        }}
                                    />
                                    Select All
                                </label>
                             </div>
                        )}
                    </div>

                    {/* List Body with Scrolling */}
                    <div className="flex-1 overflow-y-auto p-0 scrollbar-thin scrollbar-thumb-slate-700 scrollbar-track-transparent">
                        {absentRecords.length === 0 ? (
                            <div className="h-full flex flex-col items-center justify-center text-slate-500 gap-2 opacity-60">
                                <Search className="w-8 h-8 opacity-50"/>
                                <p className="text-sm">Search and add employees to view their absent records.</p>
                            </div>
                        ) : (
                            <table className="w-full text-left text-sm text-slate-300">
                                <thead className="bg-slate-900/50 text-slate-500 sticky top-0 z-10 backdrop-blur-sm border-b border-slate-800/50">
                                    <tr>
                                        <th className="px-4 py-2 w-10"></th>
                                        <th className="px-4 py-2 font-medium">Employee</th>
                                        <th className="px-4 py-2 font-medium">Date</th>
                                        <th className="px-4 py-2 font-medium">Action</th>
                                        <th className="px-4 py-2 w-10"></th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-800/50">
                                    {absentRecords.map((rec) => {
                                        const key = `${rec.userId}|${rec.date}`;
                                        const isSel = selectedRecordKeys.has(key);
                                        return (
                                            <tr key={key} className={`hover:bg-slate-800/30 transition-colors ${isSel ? 'bg-emerald-500/5' : ''}`}>
                                                <td className="px-4 py-3">
                                                   <input 
                                                     type="checkbox" 
                                                     checked={isSel} 
                                                     onChange={() => toggleRecord(key)}
                                                     className="rounded bg-slate-800 border-slate-700 w-4 h-4 text-emerald-500 focus:ring-emerald-500/20 focus:ring-offset-0"
                                                   />
                                                </td>
                                                <td className="px-4 py-3">
                                                    <div className="font-medium text-slate-200">{rec.userName}</div>
                                                    <div className="text-[10px] text-slate-500 font-mono">{rec.odId}</div>
                                                </td>
                                                <td className="px-4 py-3 font-mono text-slate-400 text-xs">
                                                    {new Date(rec.date).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })}
                                                </td>
                                                <td className="px-4 py-3">
                                                    <div className="flex items-center gap-2 text-xs">
                                                        <span className="px-2 py-0.5 bg-rose-500/10 text-rose-400 rounded border border-rose-500/20">Absent</span>
                                                        <ArrowRight className="w-3 h-3 text-slate-600" />
                                                        <span className={`px-2 py-0.5 rounded border text-xs font-medium ${isSel ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-slate-800 text-slate-500 border-slate-700'}`}>
                                                            {targetStatus}
                                                        </span>
                                                    </div>
                                                </td>
                                                <td className="px-4 py-3 text-right">
                                                    <button onClick={() => removeRecord(key)} className="text-slate-600 hover:text-rose-400 transition-colors p-1" title="Remove from list">
                                                        <Trash2 className="w-4 h-4"/>
                                                    </button>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        )}
                    </div>
                </div>

                {/* 3. Footer Action */}
                <div className="flex justify-between items-center pt-2 border-t border-slate-800">
                     <div className="flex items-center gap-3">
                         <div className="text-xs text-slate-400">
                            {loadingRecords ? 'Fetching records...' : ''}
                         </div>
                         <select 
                            value={targetStatus}
                            onChange={(e) => setTargetStatus(e.target.value)}
                            className="bg-slate-900 border border-slate-700 text-slate-300 text-xs rounded-md px-2 py-1.5 outline-none focus:border-emerald-500 max-w-[200px]"
                         >
                            {statusOptions.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                         </select>
                     </div>
                     <button 
                        onClick={handleUpdate}
                        disabled={selectedRecordKeys.size === 0 || updating}
                        className="flex items-center gap-2 px-6 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-sm rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg shadow-emerald-900/20"
                     >
                        {updating ? <Loader2 className="w-4 h-4 animate-spin"/> : <Save className="w-4 h-4"/>}
                        Convert {selectedRecordKeys.size} to {targetStatus === 'Leave' ? 'Leave' : 'Selected'}
                     </button>
                </div>
            </div>
        </div>
    </div>
  );
};
