import { useState, useEffect, useRef } from 'react';
import { User } from '@/types/ui';
import type { AbsentRecord, BulkLeaveManagerProps } from '../types';

export function useBulkLeaveManagerLogic({
  isOpen,
  onClose,
  users,
  currentMonthYear,
  onUpdateComplete,
}: BulkLeaveManagerProps) {
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
  const [targetStatus, setTargetStatus] = useState<string>('On leave');

  const statusOptions = [
      'On leave',
      'Weekly Off - Present (WO-Present)',
      'Half Day (HD)',
      'Work From Home (WFH)',
      'Weekly Off - Work From Home (WO-WFH)',
      'Onsite Presence (OS-P)'
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

  return {
    searchTerm,
    setSearchTerm,
    searchResults,
    searchContainerRef,
    addedUserIds,
    absentRecords,
    loadingRecords,
    selectedRecordKeys,
    setSelectedRecordKeys,
    updating,
    targetStatus,
    setTargetStatus,
    statusOptions,
    addUserAndFetch,
    handleUpdate,
    toggleRecord,
    removeRecord,
  } as const;
}
