'use client';

import React, { useState, useEffect, useMemo } from 'react';
import {
  RefreshCw,
  AlertTriangle,
  IndianRupee,
  Download,
  Check,
  X,
  ChevronDown,
  ChevronUp,
  Info,
  Users,
  AlertCircle,
  FileText,
  Search,
  Mail,
} from 'lucide-react';
import { getWorkingUnderPartnerForDate, lastDayOfMonthYear } from '@/lib/userFieldHistory';
import { hrCredentialsInit } from '@/lib/hrAuthHeaders';
import { confirmMajorAction } from '@/lib/confirmMajorAction';

interface FineRecord {
  serialNo: string;
  date: string;
  consecutiveDay: number;
  fineAmount: number;
  isWarning: boolean;
  status: 'pending' | 'paid' | 'waived';
  penaltyImposedBy?: string;
  reason?: string;
  remark?: string;
  paymentDate?: string;
  paymentMode?: 'cash' | 'upi' | 'bank_transfer' | 'salary_deduction' | '';
  vertical?: string;
}

interface Fine {
  _id: string;
  userId: {
    _id: string;
    name: string;
    odId: string;
    category?: string;
    team?: string;
    workingUnderPartner?: string;
    designation?: string;
  };
  monthYear: string;
  category: 'Staff' | 'Article';
  fineRecords: FineRecord[];
  totalFine: number;
  totalWarnings: number;
}

interface FineManagementProps {
  selectedMonth?: number;
  selectedYear?: number;
}

const FINE_MANAGEMENT_WORKFLOW_STEPS = [
  'Pick month & run calc',
  'Filter or impose manual',
  'Email / update status / export',
] as const;

export const FineManagementSection: React.FC<FineManagementProps> = ({
  selectedMonth = new Date().getMonth() + 1,
  selectedYear = new Date().getFullYear(),
}) => {
  const [fines, setFines] = useState<Fine[]>([]);
  const [loading, setLoading] = useState(false);
  const [calculating, setCalculating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [showManualFineForm, setShowManualFineForm] = useState(false);
  const [manualFineEmployee, setManualFineEmployee] = useState('');
  const [manualFineReason, setManualFineReason] = useState('');
  const [manualFineAmount, setManualFineAmount] = useState('');
  const [manualFineRemark, setManualFineRemark] = useState('');
  const [imposingFine, setImposingFine] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<'all' | 'Staff' | 'Article'>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'paid' | 'waived'>('all');
  const [teamFilter, setTeamFilter] = useState('all');
  const [month, setMonth] = useState(selectedMonth);
  const [year, setYear] = useState(selectedYear);
  const [selectedUserIds, setSelectedUserIds] = useState<Set<string>>(new Set());
  const [emailBusy, setEmailBusy] = useState(false);
  const [emailingUserId, setEmailingUserId] = useState<string | null>(null);
  const [emailNotice, setEmailNotice] = useState<string | null>(null);

  const monthYear = `${year}-${String(month).padStart(2, '0')}`;

  // Fetch fines
  const fetchFines = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/fines?monthYear=${monthYear}`);
      const data = await response.json();
      if (data.success) {
        setFines(data.fines);
      } else {
        setError(data.error || 'Failed to fetch fines');
      }
    } catch (err) {
      setError('Failed to fetch fines');
    } finally {
      setLoading(false);
    }
  };

  // Calculate fines for the month
  const calculateFines = async () => {
    setCalculating(true);
    setError(null);
    try {
      const response = await fetch('/api/fines', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ monthYear }),
      });
      const data = await response.json();
      if (data.success) {
        setFines(data.fines);
      } else {
        setError(data.error || 'Failed to calculate fines');
      }
    } catch (err) {
      setError('Failed to calculate fines');
    } finally {
      setCalculating(false);
    }
  };

  // Update fine status
  const updateFineStatus = async (fineId: string, recordDate: string, status: 'paid' | 'waived') => {
    try {
      const response = await fetch('/api/fines', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fineId, recordDate, status }),
      });
      const data = await response.json();
      if (data.success) {
        setFines(prev => prev.map(f => f._id === fineId ? data.fine : f));
      }
    } catch (err) {
      console.error('Failed to update fine status:', err);
    }
  };

  // Impose manual fine
  const imposeManualFine = async () => {
    if (!manualFineEmployee || !manualFineReason || !manualFineAmount) {
      setError('Please fill all required fields');
      return;
    }
    setImposingFine(true);
    setError(null);
    try {
      const response = await fetch('/api/fines/manual', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          employeeId: manualFineEmployee,
          reason: manualFineReason,
          amount: parseFloat(manualFineAmount),
          remark: manualFineRemark,
          monthYear,
        }),
      });
      const data = await response.json();
      if (data.success) {
        // Check if fine already exists for this employee and month
        const existingFineIndex = fines.findIndex(f => f.userId._id === manualFineEmployee && f.monthYear === monthYear);
        if (existingFineIndex >= 0) {
          // Update existing fine
          setFines(prev => prev.map((f, i) => i === existingFineIndex ? data.fine : f));
        } else {
          // Add new fine
          setFines(prev => [...prev, data.fine]);
        }
        setManualFineEmployee('');
        setManualFineReason('');
        setManualFineAmount('');
        setManualFineRemark('');
        setShowManualFineForm(false);
      } else {
        setError(data.error || 'Failed to impose fine');
      }
    } catch (err) {
      setError('Failed to impose fine');
    } finally {
      setImposingFine(false);
    }
  };

  useEffect(() => {
    fetchFines();
    setSelectedUserIds(new Set());
    setEmailNotice(null);
  }, [monthYear]);

  // Toggle row expansion
  const toggleRow = (fineId: string) => {
    setExpandedRows(prev => {
      const newSet = new Set(prev);
      if (newSet.has(fineId)) {
        newSet.delete(fineId);
      } else {
        newSet.add(fineId);
      }
      return newSet;
    });
  };

  const getFineUserId = (fine: Fine): string => String(fine.userId?._id || '');

  const toggleSelectUser = (userId: string) => {
    if (!userId) return;
    setSelectedUserIds((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  };

  // Filter fines
  const filteredFines = useMemo(() => {
    return fines.filter(fine => {
      // Search filter
      if (searchTerm) {
        const search = searchTerm.toLowerCase();
        const matchName = fine.userId?.name?.toLowerCase().includes(search);
        const matchId = fine.userId?.odId?.toLowerCase().includes(search);
        if (!matchName && !matchId) return false;
      }
      // Category filter
      if (categoryFilter !== 'all' && fine.category !== categoryFilter) return false;
      // Team filter
      if (teamFilter !== 'all') {
        const teamVal = fine.userId
          ? getWorkingUnderPartnerForDate(
              fine.userId,
              lastDayOfMonthYear(fine.monthYear || monthYear)
            )
          : '';
        if (teamVal !== teamFilter) return false;
      }
      // Status filter - check if any record matches
      if (statusFilter !== 'all') {
        const hasMatchingStatus = fine.fineRecords.some(r => r.status === statusFilter);
        if (!hasMatchingStatus) return false;
      }
      return true;
    });
  }, [fines, searchTerm, categoryFilter, statusFilter, teamFilter, monthYear]);

  const filteredUserIds = useMemo(
    () => filteredFines.map(getFineUserId).filter(Boolean),
    [filteredFines]
  );

  const allFilteredSelected =
    filteredUserIds.length > 0 && filteredUserIds.every((id) => selectedUserIds.has(id));

  const toggleSelectAllFiltered = () => {
    setSelectedUserIds((prev) => {
      if (allFilteredSelected) {
        const next = new Set(prev);
        for (const id of filteredUserIds) next.delete(id);
        return next;
      }
      const next = new Set(prev);
      for (const id of filteredUserIds) next.add(id);
      return next;
    });
  };

  const emailFineNotices = async (employeeIds: string[], label: string) => {
    const ids = [...new Set(employeeIds.filter(Boolean))];
    if (ids.length === 0) return;

    if (ids.length > 1) {
      if (
        !confirmMajorAction(`Email pending fine notices (${label})`, [
          `${ids.length} employee(s) will be emailed.`,
          'Only pending fines/warnings are included.',
          'Employees without an Asija email or with no pending items will be skipped.',
        ])
      ) {
        return;
      }
    }

    setEmailBusy(true);
    setEmailingUserId(ids.length === 1 ? ids[0] : null);
    setError(null);
    setEmailNotice(null);
    try {
      const response = await fetch(
        '/api/fines/notify',
        hrCredentialsInit({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ employeeIds: ids, monthYear }),
        })
      );
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.success) {
        throw new Error(data.error || `Failed to send fine notices (${response.status})`);
      }
      const sent = Number(data.sentCount || 0);
      const skipped = Number(data.skippedCount || 0);
      const errList: string[] = Array.isArray(data.errors) ? data.errors : [];
      let notice = `Sent ${sent} fine notice${sent === 1 ? '' : 's'}. Skipped ${skipped}.`;
      if (errList.length > 0) {
        notice += ` ${errList.slice(0, 3).join(' · ')}${errList.length > 3 ? '…' : ''}`;
      }
      setEmailNotice(notice);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send fine notices');
    } finally {
      setEmailBusy(false);
      setEmailingUserId(null);
    }
  };

  // Calculate totals
  const totals = useMemo(() => {
    return filteredFines.reduce((acc, fine) => ({
      totalFines: acc.totalFines + fine.totalFine,
      totalWarnings: acc.totalWarnings + fine.totalWarnings,
      employeesWithFines: acc.employeesWithFines + (fine.totalFine > 0 ? 1 : 0),
      employeesWithWarnings: acc.employeesWithWarnings + (fine.totalWarnings > 0 ? 1 : 0),
    }), { totalFines: 0, totalWarnings: 0, employeesWithFines: 0, employeesWithWarnings: 0 });
  }, [filteredFines]);

  // Export to Excel with professional styling
  const exportToExcel = async () => {
    if (filteredFines.length === 0) return;

    // Import ExcelJS dynamically
    const ExcelJS = (await import('exceljs')).default;

    // Create workbook
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Fine Records');

    // Define columns with widths
    worksheet.columns = [
      { key: 'sr', header: 'SR', width: 12 },
      { key: 'date', header: 'Date', width: 12 },
      { key: 'employeeName', header: 'Employee Name', width: 25 },
      { key: 'employeeId', header: 'Employee ID', width: 15 },
      { key: 'category', header: 'Category', width: 12 },
      { key: 'vertical', header: 'Vertical', width: 20 },
      { key: 'penaltyImposedBy', header: 'Penalty Imposed By', width: 20 },
      { key: 'fineAmount', header: 'Fine Amount (₹)', width: 15 },
      { key: 'reason', header: 'Reason', width: 20 },
      { key: 'remark', header: 'Remark', width: 25 },
      { key: 'paymentDate', header: 'Payment Date', width: 14 },
      { key: 'paymentMode', header: 'Payment Mode', width: 14 },
      { key: 'status', header: 'Status', width: 12 },
    ];

    // Add data rows
    filteredFines.forEach(fine => {
      fine.fineRecords.forEach(record => {
        worksheet.addRow({
          sr: record.serialNo || '',
          date: record.date,
          employeeName: fine.userId?.name || '',
          employeeId: fine.userId?.odId || '',
          category: fine.category,
          vertical:
            record.vertical ||
            (fine.userId
              ? getWorkingUnderPartnerForDate(fine.userId, record.date)
              : ''),
          penaltyImposedBy: record.penaltyImposedBy || '',
          fineAmount: record.isWarning ? 'Warning' : record.fineAmount,
          reason: record.reason || '',
          remark: record.remark || '',
          paymentDate: record.paymentDate || '',
          paymentMode: record.paymentMode || '',
          status: record.status.charAt(0).toUpperCase() + record.status.slice(1),
        });
      });
    });

    // Style the header row
    const headerRow = worksheet.getRow(1);
    headerRow.eachCell((cell) => {
      cell.font = { bold: true, size: 11, color: { argb: 'FFFFFFFF' } };
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF1E40AF' } // Blue header
      };
      cell.alignment = { vertical: 'middle', horizontal: 'center' };
      cell.border = {
        top: { style: 'thin', color: { argb: 'FF000000' } },
        bottom: { style: 'thin', color: { argb: 'FF000000' } },
        left: { style: 'thin', color: { argb: 'FF000000' } },
        right: { style: 'thin', color: { argb: 'FF000000' } }
      };
    });
    headerRow.height = 24;

    // Style data rows
    worksheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return; // Skip header row

      const isEvenRow = rowNumber % 2 === 0;
      row.eachCell((cell, colNumber) => {
        cell.font = { size: 10 };
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: isEvenRow ? 'FFF1F5F9' : 'FFFFFFFF' }
        };
        cell.alignment = {
          vertical: 'middle',
          horizontal: colNumber === 3 ? 'left' : 'center' // Left align employee name
        };
        cell.border = {
          top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
          bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
          left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
          right: { style: 'thin', color: { argb: 'FFE2E8F0' } }
        };

        // Special styling for status column
        if (colNumber === 13) {
          const status = cell.value?.toString().toLowerCase();
          if (status === 'paid') {
            cell.font = { size: 10, color: { argb: 'FF16A34A' }, bold: true };
          } else if (status === 'waived') {
            cell.font = { size: 10, color: { argb: 'FF2563EB' }, bold: true };
          } else if (status === 'pending') {
            cell.font = { size: 10, color: { argb: 'FFDC2626' }, bold: true };
          }
        }

        // Special styling for fine amount (warning vs fine)
        if (colNumber === 8) {
          const value = cell.value?.toString();
          if (value === 'Warning') {
            cell.font = { size: 10, color: { argb: 'FFD97706' }, bold: true };
          } else {
            cell.font = { size: 10, bold: true };
          }
        }
      });
    });

    // Add summary row at the bottom
    const totalFine = filteredFines.reduce((sum, f) => sum + f.totalFine, 0);
    const totalWarnings = filteredFines.reduce((sum, f) => sum + f.totalWarnings, 0);
    const summaryRow = worksheet.addRow({
      sr: '',
      date: '',
      employeeName: 'TOTAL',
      employeeId: '',
      category: '',
      vertical: '',
      penaltyImposedBy: '',
      fineAmount: `₹${totalFine}`,
      reason: `${totalWarnings} Warnings`,
      remark: '',
      paymentDate: '',
      paymentMode: '',
      status: '',
    });

    summaryRow.eachCell((cell, colNumber) => {
      cell.font = { bold: true, size: 11, color: { argb: 'FFFFFFFF' } };
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF475569' } // Slate header
      };
      cell.alignment = { vertical: 'middle', horizontal: 'center' };
      cell.border = {
        top: { style: 'medium', color: { argb: 'FF000000' } },
        bottom: { style: 'medium', color: { argb: 'FF000000' } },
        left: { style: 'thin', color: { argb: 'FF000000' } },
        right: { style: 'thin', color: { argb: 'FF000000' } }
      };
      if (colNumber === 3) {
        cell.alignment = { vertical: 'middle', horizontal: 'left' };
      }
    });
    summaryRow.height = 24;

    // Generate filename
    const fileName = `Fine_Records_${year}_${String(month).padStart(2, '0')}.xlsx`;

    // Save file
    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });

    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
  };

  // Generate PDF Penalty Slip for a fine record
  const generatePenaltySlip = async (fine: Fine, record: FineRecord) => {
    // Import jsPDF dynamically
    const { jsPDF } = await import('jspdf');
    
    const doc = new jsPDF({
      orientation: 'landscape',
      unit: 'mm',
      format: [150, 100] // Rectangular slip 150mm x 100mm
    });

    const pageWidth = 150;
    const margin = 10;
    const contentWidth = pageWidth - 2 * margin;
    
    // Format dates
    const fineDate = new Date(record.date);
    const formattedDate = `${String(fineDate.getDate()).padStart(2, '0')}/${String(fineDate.getMonth() + 1).padStart(2, '0')}/${fineDate.getFullYear()}`;
    const paymentDateFormatted = record.paymentDate 
      ? (() => {
          const pd = new Date(record.paymentDate);
          return `${String(pd.getDate()).padStart(2, '0')}/${String(pd.getMonth() + 1).padStart(2, '0')}/${pd.getFullYear()}`;
        })()
      : '--/--/----';

    // Draw border
    doc.setDrawColor(0);
    doc.setLineWidth(0.5);
    doc.rect(5, 5, 140, 90);

    // Header - Penalty Slip
    doc.setFillColor(220, 38, 38); // Red background
    doc.rect(5, 5, 140, 12, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text('PENALTY SLIP', pageWidth / 2, 13, { align: 'center' });

    // Employee Name
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text(`Employee: ${fine.userId?.name || 'N/A'}`, margin, 24);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.text(`ID: ${fine.userId?.odId || 'N/A'}`, pageWidth - margin - 30, 24);

    // Table settings
    const tableTop = 30;
    const rowHeight = 10;
    const col1Width = 35;
    const col2Width = 35;
    const col3Width = 35;
    const col4Width = 35;

    doc.setDrawColor(0);
    doc.setLineWidth(0.3);

    // Row 1: SR | Value | Date | DD/MM/YYYY
    const row1Y = tableTop;
    doc.rect(margin, row1Y, col1Width, rowHeight);
    doc.rect(margin + col1Width, row1Y, col2Width, rowHeight);
    doc.rect(margin + col1Width + col2Width, row1Y, col3Width, rowHeight);
    doc.rect(margin + col1Width + col2Width + col3Width, row1Y, col4Width, rowHeight);
    
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.text('SR', margin + 2, row1Y + 6);
    doc.setFont('helvetica', 'normal');
    doc.text(record.serialNo || '-', margin + col1Width + 2, row1Y + 6);
    doc.setFont('helvetica', 'bold');
    doc.text('Date', margin + col1Width + col2Width + 2, row1Y + 6);
    doc.setFont('helvetica', 'normal');
    doc.text(formattedDate, margin + col1Width + col2Width + col3Width + 2, row1Y + 6);

    // Row 2: Penalty Amount | Value | Payment Date | DD/MM/YYYY
    const row2Y = tableTop + rowHeight;
    doc.rect(margin, row2Y, col1Width, rowHeight);
    doc.rect(margin + col1Width, row2Y, col2Width, rowHeight);
    doc.rect(margin + col1Width + col2Width, row2Y, col3Width, rowHeight);
    doc.rect(margin + col1Width + col2Width + col3Width, row2Y, col4Width, rowHeight);
    
    doc.setFont('helvetica', 'bold');
    doc.text('Penalty Amt', margin + 2, row2Y + 6);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(220, 38, 38);
    doc.text(`Rs. ${record.fineAmount}`, margin + col1Width + 2, row2Y + 6);
    doc.setTextColor(0, 0, 0);
    doc.setFont('helvetica', 'bold');
    doc.text('Payment Date', margin + col1Width + col2Width + 2, row2Y + 6);
    doc.setFont('helvetica', 'normal');
    doc.text(paymentDateFormatted, margin + col1Width + col2Width + col3Width + 2, row2Y + 6);

    // Row 3: Payment Mode | Value | Penalty Imposed By | Name
    const row3Y = tableTop + rowHeight * 2;
    doc.rect(margin, row3Y, col1Width, rowHeight);
    doc.rect(margin + col1Width, row3Y, col2Width, rowHeight);
    doc.rect(margin + col1Width + col2Width, row3Y, col3Width, rowHeight);
    doc.rect(margin + col1Width + col2Width + col3Width, row3Y, col4Width, rowHeight);
    
    doc.setFont('helvetica', 'bold');
    doc.text('Payment Mode', margin + 2, row3Y + 6);
    doc.setFont('helvetica', 'normal');
    const paymentModeDisplay = record.paymentMode ? record.paymentMode.replace('_', ' ').toUpperCase() : '-';
    doc.text(paymentModeDisplay, margin + col1Width + 2, row3Y + 6);
    doc.setFont('helvetica', 'bold');
    doc.text('Imposed By', margin + col1Width + col2Width + 2, row3Y + 6);
    doc.setFont('helvetica', 'normal');
    doc.text(record.penaltyImposedBy || '-', margin + col1Width + col2Width + col3Width + 2, row3Y + 6);

    // Row 4: Reason (full width)
    const row4Y = tableTop + rowHeight * 3;
    doc.rect(margin, row4Y, col1Width, rowHeight);
    doc.rect(margin + col1Width, row4Y, col2Width + col3Width + col4Width, rowHeight);
    
    doc.setFont('helvetica', 'bold');
    doc.text('Reason', margin + 2, row4Y + 6);
    doc.setFont('helvetica', 'normal');
    const reasonText = record.reason || '-';
    // Truncate reason text to fit within available space (approximately 80 characters for the combined columns)
    doc.text(reasonText.substring(0, 80), margin + col1Width + 2, row4Y + 6);

    // Row 5: Remark (full width)
    const row5Y = tableTop + rowHeight * 4;
    doc.rect(margin, row5Y, col1Width, rowHeight);
    doc.rect(margin + col1Width, row5Y, col2Width + col3Width + col4Width, rowHeight);
    
    doc.setFont('helvetica', 'bold');
    doc.text('Remark', margin + 2, row5Y + 6);
    doc.setFont('helvetica', 'normal');
    const remarkText = record.remark || '-';
    doc.text(remarkText.substring(0, 50), margin + col1Width + 2, row5Y + 6);

    // Footer
    doc.setFontSize(8);
    doc.setTextColor(100, 100, 100);
    doc.text(`Generated on: ${new Date().toLocaleDateString('en-IN')}`, margin, 88);
    doc.text(`Category: ${fine.category}`, pageWidth - margin - 25, 88);

    // Save PDF
    const fileName = `Penalty_Slip_${record.serialNo?.replace('/', '_') || 'slip'}_${record.date}.pdf`;
    doc.save(fileName);
  };

  // Generate consolidated penalty slip for an employee with all fines in one slip
  const generateAllPenaltySlips = async (fine: Fine) => {
    const fineRecords = fine.fineRecords.filter(r => !r.isWarning);
    if (fineRecords.length === 0) return;

    // Import jsPDF dynamically
    const { jsPDF } = await import('jspdf');
    
    // Page and table layout
    const pageWidth = 180;
    const margin = 10;
    const contentWidth = pageWidth - 2 * margin;
    const rowHeight = 8;
    const tableHeaderHeight = 36;
    const footerHeight = 15;
    const rowsPerPage = Math.floor((100 - tableHeaderHeight - footerHeight) / rowHeight); // ~6 rows per page
    let doc = new jsPDF({
      orientation: 'landscape',
      unit: 'mm',
      format: [180, 100]
    });

    let totalAmount = 0;
    let rowIndex = 0;
    let page = 0;
    while (rowIndex < fineRecords.length) {
      page++;
      // Draw border
      doc.setDrawColor(0);
      doc.setLineWidth(0.5);
      doc.rect(5, 5, 170, 90);

      let tableTop = 36;
      // Only show header and employee details on first page
      if (page === 1) {
        // Header - Penalty Slip
        doc.setFillColor(220, 38, 38);
        doc.rect(5, 5, 170, 12, 'F');
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(14);
        doc.setFont('helvetica', 'bold');
        doc.text('CONSOLIDATED PENALTY SLIP', pageWidth / 2, 13, { align: 'center' });

        // Employee Details Row
        doc.setTextColor(0, 0, 0);
        doc.setFontSize(10);
        doc.setFont('helvetica', 'bold');
        doc.text(`Employee: ${fine.userId?.name || 'N/A'}`, margin, 24);
        doc.setFont('helvetica', 'normal');
        doc.text(`ID: ${fine.userId?.odId || 'N/A'}`, margin + 60, 24);
        // Second line for Month and Category
        doc.text(`Month: ${fine.monthYear}`, margin, 30);
        doc.text(`Category: ${fine.category}`, margin + 60, 30);
        tableTop = 36;
      } else {
        // On overflow pages, start table at top
        tableTop = 12;
      }

      // Table Header
      const col1Width = 15;  // S.No
      const col2Width = 25;  // SR Code
      const col3Width = 25;  // Date
      const col4Width = 40;  // Reason
      const col5Width = 25;  // Amount
      const col6Width = 30;  // Status

      doc.setDrawColor(0);
      doc.setLineWidth(0.3);
      // Header row background
      doc.setFillColor(100, 100, 100);
      doc.rect(margin, tableTop, contentWidth, rowHeight, 'F');
      // Header row cells
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(8);
      doc.setFont('helvetica', 'bold');
      let xPos = margin;
      doc.rect(xPos, tableTop, col1Width, rowHeight);
      doc.text('S.No', xPos + 2, tableTop + 5.5);
      xPos += col1Width;
      doc.rect(xPos, tableTop, col2Width, rowHeight);
      doc.text('SR Code', xPos + 2, tableTop + 5.5);
      xPos += col2Width;
      doc.rect(xPos, tableTop, col3Width, rowHeight);
      doc.text('Date', xPos + 2, tableTop + 5.5);
      xPos += col3Width;
      doc.rect(xPos, tableTop, col4Width, rowHeight);
      doc.text('Reason', xPos + 2, tableTop + 5.5);
      xPos += col4Width;
      doc.rect(xPos, tableTop, col5Width, rowHeight);
      doc.text('Amount', xPos + 2, tableTop + 5.5);
      xPos += col5Width;
      doc.rect(xPos, tableTop, col6Width, rowHeight);
      doc.text('Status', xPos + 2, tableTop + 5.5);

      // Data rows for this page
      doc.setTextColor(0, 0, 0);
      doc.setFont('helvetica', 'normal');
      let rowsOnThisPage = 0;
      for (; rowIndex < fineRecords.length && rowsOnThisPage < rowsPerPage; rowIndex++, rowsOnThisPage++) {
        const record = fineRecords[rowIndex];
        const rowY = tableTop + rowHeight * (rowsOnThisPage + 1);
        const isEven = rowIndex % 2 === 0;
        // Alternate row background
        if (isEven) {
          doc.setFillColor(245, 245, 245);
          doc.rect(margin, rowY, contentWidth, rowHeight, 'F');
        }
        xPos = margin;
        // S.No
        doc.rect(xPos, rowY, col1Width, rowHeight);
        doc.text(String(rowIndex + 1), xPos + 5, rowY + 5.5);
        xPos += col1Width;
        // SR Code
        doc.rect(xPos, rowY, col2Width, rowHeight);
        doc.text(record.serialNo || '-', xPos + 2, rowY + 5.5);
        xPos += col2Width;
        // Date
        const fineDate = new Date(record.date);
        const formattedDate = `${String(fineDate.getDate()).padStart(2, '0')}/${String(fineDate.getMonth() + 1).padStart(2, '0')}/${fineDate.getFullYear()}`;
        doc.rect(xPos, rowY, col3Width, rowHeight);
        doc.text(formattedDate, xPos + 2, rowY + 5.5);
        xPos += col3Width;
        // Reason - handle manual fines differently
        doc.rect(xPos, rowY, col4Width, rowHeight);
        let reasonText = '';
        if (record.penaltyImposedBy === 'Manual') {
          // For manual fines, just show the reason as entered
          reasonText = record.reason || record.remark || '-';
        } else {
          // For automatic fines, show late day and in-time
          let reasonParts = [];
          if (record.consecutiveDay) {
            reasonParts.push(`Day ${record.consecutiveDay} Late`);
          }
          if (record.reason) {
            // Extract just the check-in time from the reason
            const inTimeMatch = record.reason.match(/In Time-([^(\s]+)/);
            if (inTimeMatch) {
              reasonParts.push(`In: ${inTimeMatch[1]}`);
            }
          }
          reasonText = reasonParts.join(' ');
          if (!reasonText && record.remark) {
            reasonText = record.remark;
          } else if (!reasonText) {
            reasonText = '-';
          }
        }
        // Truncate to fit in 40mm column (approximately 25-30 characters)
        doc.text(reasonText.substring(0, 25), xPos + 2, rowY + 5.5);
        xPos += col4Width;
        // Amount
        doc.rect(xPos, rowY, col5Width, rowHeight);
        doc.setTextColor(220, 38, 38);
        doc.text(`Rs. ${record.fineAmount}`, xPos + 2, rowY + 5.5);
        doc.setTextColor(0, 0, 0);
        totalAmount += record.fineAmount;
        xPos += col5Width;
        // Status
        doc.rect(xPos, rowY, col6Width, rowHeight);
        const statusText = record.status.charAt(0).toUpperCase() + record.status.slice(1);
        doc.text(statusText, xPos + 2, rowY + 5.5);
      }

      // If last page, add total and footer
      if (rowIndex === fineRecords.length) {
        const totalRowY = tableTop + rowHeight * (rowsOnThisPage + 1);
        doc.setFillColor(220, 38, 38);
        doc.rect(margin, totalRowY, contentWidth, rowHeight, 'F');
        doc.setTextColor(255, 255, 255);
        doc.setFont('helvetica', 'bold');
        doc.rect(margin, totalRowY, col1Width + col2Width + col3Width + col4Width, rowHeight);
        doc.text('TOTAL PENALTY AMOUNT', margin + 2, totalRowY + 5.5);
        doc.rect(margin + col1Width + col2Width + col3Width + col4Width, totalRowY, col5Width + col6Width, rowHeight);
        doc.setFontSize(10);
        doc.text(`Rs. ${totalAmount}`, margin + col1Width + col2Width + col3Width + col4Width + 2, totalRowY + 5.5);
        // Footer
        doc.setFontSize(8);
        doc.setTextColor(100, 100, 100);
        doc.text(`Generated on: ${new Date().toLocaleDateString('en-IN')}`, margin, 100 - 7);
        doc.text(`Total Fines: ${fineRecords.length}`, pageWidth - margin - 25, 100 - 7);
      }
      // Add new page if more rows remain
      if (rowIndex < fineRecords.length) {
        doc.addPage([180, 100], 'landscape');
      }
    }

    // Save PDF
    const fileName = `Penalty_Slip_${fine.userId?.name?.replace(/\s+/g, '_') || 'employee'}_${fine.monthYear}.pdf`;
    doc.save(fileName);
  };

  const selectCls =
    'rounded-lg border border-blue-200/65 bg-panel px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20';
  const inputCls =
    'w-full rounded-lg border border-blue-200/65 bg-panel px-3 py-2 text-sm text-slate-900 shadow-sm placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20';
  const thBase = 'px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-600';

  return (
    <section className="space-y-5 p-6 text-slate-900" aria-labelledby="fine-management-heading">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-2">
          <h2 id="fine-management-heading" className="text-2xl font-bold tracking-tight text-slate-900">
            Fine management
          </h2>
          <p className="text-sm text-slate-600">Manage late arrival fines and warnings.</p>
          <ol className="flex flex-wrap gap-2" aria-label="Workflow">
            {FINE_MANAGEMENT_WORKFLOW_STEPS.map((label, i) => (
              <li
                key={label}
                className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-700"
              >
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-blue-600 text-[10px] font-bold text-white">
                  {i + 1}
                </span>
                {label}
              </li>
            ))}
          </ol>
        </div>

        <div className="flex flex-wrap items-center gap-2 sm:justify-end">
          <div className="flex flex-wrap items-center gap-2">
            <label htmlFor="fine-month" className="sr-only">
              Month
            </label>
            <select
              id="fine-month"
              value={month}
              onChange={(e) => setMonth(Number(e.target.value))}
              className={selectCls}
            >
              {Array.from({ length: 12 }, (_, i) => (
                <option key={i + 1} value={i + 1}>
                  {new Date(2000, i, 1).toLocaleString('default', { month: 'long' })}
                </option>
              ))}
            </select>
            <label htmlFor="fine-year" className="sr-only">
              Year
            </label>
            <select id="fine-year" value={year} onChange={(e) => setYear(Number(e.target.value))} className={selectCls}>
              {Array.from({ length: 5 }, (_, i) => (
                <option key={2024 + i} value={2024 + i}>
                  {2024 + i}
                </option>
              ))}
            </select>
          </div>
          <button
            type="button"
            onClick={calculateFines}
            disabled={calculating}
            className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500/30 disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${calculating ? 'animate-spin' : ''}`} aria-hidden />
            {calculating ? 'Calculating…' : 'Calculate fines'}
          </button>
          <button
            type="button"
            onClick={exportToExcel}
            disabled={filteredFines.length === 0}
            className="inline-flex items-center gap-2 rounded-lg border border-blue-200/65 bg-panel px-4 py-2 text-sm font-medium text-slate-800 shadow-sm transition-colors hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500/20 disabled:opacity-50"
          >
            <Download className="h-4 w-4 text-slate-600" aria-hidden />
            Export Excel
          </button>
          <button
            type="button"
            onClick={() =>
              void emailFineNotices([...selectedUserIds], 'selected employees')
            }
            disabled={emailBusy || selectedUserIds.size === 0}
            className="inline-flex items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 px-4 py-2 text-sm font-medium text-rose-900 shadow-sm transition-colors hover:bg-rose-100 focus:outline-none focus:ring-2 focus:ring-rose-500/25 disabled:opacity-50"
            title="Email pending fine notices to selected employees"
          >
            <Mail className={`h-4 w-4 ${emailBusy ? 'animate-pulse' : ''}`} aria-hidden />
            Email selected ({selectedUserIds.size})
          </button>
          <button
            type="button"
            onClick={() => void emailFineNotices(filteredUserIds, 'all filtered')}
            disabled={emailBusy || filteredUserIds.length === 0}
            className="inline-flex items-center gap-2 rounded-lg bg-rose-700 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-rose-800 focus:outline-none focus:ring-2 focus:ring-rose-500/30 disabled:opacity-50"
            title="Email pending fine notices to all employees in the current filter"
          >
            <Mail className={`h-4 w-4 ${emailBusy ? 'animate-pulse' : ''}`} aria-hidden />
            Email all filtered ({filteredUserIds.length})
          </button>
        </div>
      </header>

      <div className="rounded-xl border border-blue-200/65 bg-panel p-4 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-base font-semibold text-slate-900">Impose manual fine</h3>
          <button
            type="button"
            onClick={() => setShowManualFineForm(!showManualFineForm)}
            className="rounded-lg border border-slate-200 p-1.5 text-slate-600 transition-colors hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            aria-expanded={showManualFineForm}
            aria-controls="manual-fine-panel"
          >
            {showManualFineForm ? (
              <ChevronUp className="h-5 w-5" aria-hidden />
            ) : (
              <ChevronDown className="h-5 w-5" aria-hidden />
            )}
            <span className="sr-only">{showManualFineForm ? 'Collapse' : 'Expand'} manual fine form</span>
          </button>
        </div>
        {showManualFineForm && (
          <div id="manual-fine-panel" className="space-y-4">
            <div>
              <label htmlFor="manual-fine-employee" className="mb-1 block text-sm font-medium text-slate-700">
                Search employee
              </label>
              <input
                id="manual-fine-employee"
                type="text"
                placeholder="Search by name or ID…"
                value={manualFineEmployee}
                onChange={(e) => setManualFineEmployee(e.target.value)}
                className={inputCls}
                list="employee-list"
              />
              <datalist id="employee-list">
                {fines.map((fine) => (
                  <option key={fine.userId._id} value={fine.userId._id}>
                    {fine.userId.name} ({fine.userId.odId})
                  </option>
                ))}
              </datalist>
            </div>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div>
                <label htmlFor="manual-fine-reason" className="mb-1 block text-sm font-medium text-slate-700">
                  Reason <span className="text-rose-600">*</span>
                </label>
                <input
                  id="manual-fine-reason"
                  type="text"
                  placeholder="Enter reason for fine"
                  value={manualFineReason}
                  onChange={(e) => setManualFineReason(e.target.value)}
                  className={inputCls}
                />
              </div>
              <div>
                <label htmlFor="manual-fine-amount" className="mb-1 block text-sm font-medium text-slate-700">
                  Fine amount (₹) <span className="text-rose-600">*</span>
                </label>
                <input
                  id="manual-fine-amount"
                  type="number"
                  placeholder="Enter amount"
                  value={manualFineAmount}
                  onChange={(e) => setManualFineAmount(e.target.value)}
                  className={inputCls}
                />
              </div>
            </div>
            <div>
              <label htmlFor="manual-fine-remark" className="mb-1 block text-sm font-medium text-slate-700">
                Remark (optional)
              </label>
              <textarea
                id="manual-fine-remark"
                placeholder="Additional remarks"
                value={manualFineRemark}
                onChange={(e) => setManualFineRemark(e.target.value)}
                className={inputCls}
                rows={2}
              />
            </div>
            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setShowManualFineForm(false)}
                className="rounded-lg border border-blue-200/65 bg-panel px-4 py-2 text-sm font-medium text-slate-800 shadow-sm transition-colors hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={imposeManualFine}
                disabled={imposingFine}
                className="rounded-lg bg-rose-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-rose-700 focus:outline-none focus:ring-2 focus:ring-rose-500/30 disabled:opacity-50"
              >
                {imposingFine ? 'Imposing…' : 'Impose fine'}
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="rounded-xl border border-blue-100 bg-blue-50/80 p-4 shadow-sm">
        <div className="flex items-start gap-3">
          <Info className="mt-0.5 h-5 w-5 shrink-0 text-blue-600" aria-hidden />
          <div className="text-sm text-slate-800">
            <h3 className="mb-2 font-semibold text-slate-900">Fine rules (late attendance)</h3>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div>
                <span className="font-medium text-slate-900">Employee</span>
                <ul className="ml-2 mt-1 list-inside list-disc space-y-0.5 text-slate-700">
                  <li>2 late in a month: Warning</li>
                  <li>3–7 late in a month: ₹50 fine</li>
                  <li>8 or more late in a month: ₹100 fine</li>
                </ul>
              </div>
              <div>
                <span className="font-medium text-slate-900">Article</span>
                <ul className="ml-2 mt-1 list-inside list-disc space-y-0.5 text-slate-700">
                  <li>2 late in a month: Warning</li>
                  <li>3–7 late in a month: ₹25 fine</li>
                  <li>8 or more late in a month: ₹50 fine</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 shadow-sm">
          <div className="mb-2 flex items-center gap-2 text-amber-700">
            <AlertTriangle className="h-5 w-5" aria-hidden />
            <span className="text-sm font-medium text-slate-800">Total warnings</span>
          </div>
          <div className="text-2xl font-bold text-slate-900">{totals.totalWarnings}</div>
          <div className="text-xs text-slate-600">{totals.employeesWithWarnings} employees</div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 shadow-sm">
          <div className="mb-2 flex items-center gap-2 text-rose-700">
            <IndianRupee className="h-5 w-5" aria-hidden />
            <span className="text-sm font-medium text-slate-800">Total fines</span>
          </div>
          <div className="text-2xl font-bold text-slate-900">₹{totals.totalFines}</div>
          <div className="text-xs text-slate-600">{totals.employeesWithFines} employees</div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 shadow-sm">
          <div className="mb-2 flex items-center gap-2 text-blue-700">
            <Users className="h-5 w-5" aria-hidden />
            <span className="text-sm font-medium text-slate-800">Staff fines</span>
          </div>
          <div className="text-2xl font-bold text-slate-900">
            ₹{fines.filter((f) => f.category === 'Staff').reduce((s, f) => s + f.totalFine, 0)}
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 shadow-sm">
          <div className="mb-2 flex items-center gap-2 text-violet-700">
            <Users className="h-5 w-5" aria-hidden />
            <span className="text-sm font-medium text-slate-800">Article fines</span>
          </div>
          <div className="text-2xl font-bold text-slate-900">
            ₹{fines.filter((f) => f.category === 'Article').reduce((s, f) => s + f.totalFine, 0)}
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-3 rounded-xl border border-blue-200/65 bg-panel p-3 shadow-sm sm:flex-row sm:flex-wrap sm:items-center">
        <div className="relative min-w-[12rem] flex-1 sm:max-w-xs">
          <label htmlFor="fine-search" className="sr-only">
            Search by name or ID
          </label>
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden />
          <input
            id="fine-search"
            type="text"
            placeholder="Search by name or ID…"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className={`${inputCls} pl-9`}
          />
        </div>
        <label htmlFor="fine-category-filter" className="sr-only">
          Category
        </label>
        <select
          id="fine-category-filter"
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value as 'all' | 'Staff' | 'Article')}
          className={`${selectCls} min-w-[10rem]`}
        >
          <option value="all">All categories</option>
          <option value="Staff">Staff</option>
          <option value="Article">Article</option>
        </select>
        <label htmlFor="fine-team-filter" className="sr-only">
          Team
        </label>
        <select
          id="fine-team-filter"
          value={teamFilter}
          onChange={(e) => setTeamFilter(e.target.value)}
          className={`${selectCls} min-w-[10rem]`}
        >
          <option value="all">All teams</option>
          {Array.from(
            new Set(
              fines
                .map((f) =>
                  f.userId
                    ? getWorkingUnderPartnerForDate(
                        f.userId,
                        lastDayOfMonthYear(f.monthYear || monthYear)
                      )
                    : ''
                )
                .filter(Boolean)
            )
          ).map((team) => (
              <option key={team} value={team}>
                {team}
              </option>
            ))}
        </select>
        <label htmlFor="fine-status-filter" className="sr-only">
          Status
        </label>
        <select
          id="fine-status-filter"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as 'all' | 'pending' | 'paid' | 'waived')}
          className={`${selectCls} min-w-[10rem]`}
        >
          <option value="all">All status</option>
          <option value="pending">Pending</option>
          <option value="paid">Paid</option>
          <option value="waived">Waived</option>
        </select>
      </div>

      {error && (
        <div
          role="alert"
          className="flex items-center gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-red-900 shadow-sm"
        >
          <AlertCircle className="h-5 w-5 shrink-0 text-red-600" aria-hidden />
          <span>{error}</span>
        </div>
      )}
      {emailNotice && (
        <div
          role="status"
          className="flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-900 shadow-sm"
        >
          <Mail className="h-5 w-5 shrink-0 text-emerald-700" aria-hidden />
          <span>{emailNotice}</span>
        </div>
      )}

      {loading && (
        <div className="flex items-center justify-center py-12" aria-live="polite">
          <RefreshCw className="h-8 w-8 animate-spin text-blue-600" aria-hidden />
          <span className="sr-only">Loading fines</span>
        </div>
      )}

      {!loading && (
        <div className="overflow-hidden rounded-xl border border-blue-200/65 bg-panel shadow-sm">
          <table className="w-full">
            <thead className="border-b border-slate-200 bg-slate-50">
              <tr>
                <th className={`${thBase} w-10 text-center`} scope="col">
                  <input
                    type="checkbox"
                    checked={allFilteredSelected}
                    onChange={toggleSelectAllFiltered}
                    disabled={filteredUserIds.length === 0 || emailBusy}
                    aria-label="Select all filtered employees"
                    className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500/30"
                  />
                </th>
                <th className={`${thBase} w-8 text-left`} scope="col">
                  <span className="sr-only">Expand</span>
                </th>
                <th className={`${thBase} text-left`} scope="col">
                  Employee
                </th>
                <th className={`${thBase} text-left`} scope="col">
                  Category
                </th>
                <th className={`${thBase} text-left`} scope="col">
                  Team
                </th>
                <th className={`${thBase} text-center`} scope="col">
                  Warnings
                </th>
                <th className={`${thBase} text-center`} scope="col">
                  Fine records
                </th>
                <th className={`${thBase} text-right`} scope="col">
                  Total fine
                </th>
                <th className={`${thBase} text-center`} scope="col">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredFines.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-10 text-center text-sm text-slate-600">
                    {fines.length === 0
                      ? 'No fine records found. Click “Calculate fines” to generate.'
                      : 'No matching records found.'}
                  </td>
                </tr>
              ) : (
                filteredFines.map((fine) => {
                  const userId = getFineUserId(fine);
                  const pendingCount = fine.fineRecords.filter((r) => r.status === 'pending').length;
                  const rowEmailing = emailBusy && emailingUserId === userId;
                  return (
                  <React.Fragment key={fine._id}>
                    <tr
                      className={`cursor-pointer transition-colors hover:bg-slate-50 ${
                        expandedRows.has(fine._id) ? 'bg-slate-50/80' : ''
                      }`}
                      onClick={() => toggleRow(fine._id)}
                    >
                      <td className="px-4 py-3 text-center" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={userId ? selectedUserIds.has(userId) : false}
                          onChange={() => toggleSelectUser(userId)}
                          disabled={!userId || emailBusy}
                          aria-label={`Select ${fine.userId?.name || 'employee'}`}
                          className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500/30"
                        />
                      </td>
                      <td className="px-4 py-3">
                        {expandedRows.has(fine._id) ? (
                          <ChevronUp className="h-4 w-4 text-slate-500" aria-hidden />
                        ) : (
                          <ChevronDown className="h-4 w-4 text-slate-500" aria-hidden />
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-medium text-slate-900">{fine.userId?.name}</div>
                        <div className="text-xs text-slate-600">{fine.userId?.odId}</div>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                            fine.category === 'Staff'
                              ? 'border border-blue-200 bg-blue-50 text-blue-900'
                              : 'border border-violet-200 bg-violet-50 text-violet-900'
                          }`}
                        >
                          {fine.category}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-600">
                        {fine.userId
                          ? getWorkingUnderPartnerForDate(
                              fine.userId,
                              lastDayOfMonthYear(fine.monthYear || monthYear)
                            ) || '—'
                          : '—'}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {fine.totalWarnings > 0 && (
                          <span className="font-medium text-amber-700">{fine.totalWarnings}</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center text-slate-600">
                        {fine.fineRecords.filter((r) => !r.isWarning).length}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {fine.totalFine > 0 ? (
                          <span className="font-bold text-rose-700">₹{fine.totalFine}</span>
                        ) : (
                          <span className="text-slate-500">₹0</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center" onClick={(e) => e.stopPropagation()}>
                        <div className="inline-flex flex-wrap items-center justify-center gap-1">
                          <button
                            type="button"
                            onClick={() => void emailFineNotices([userId], fine.userId?.name || 'employee')}
                            disabled={!userId || emailBusy || pendingCount === 0}
                            className="inline-flex items-center gap-1 rounded-lg border border-rose-200 bg-rose-50 px-2 py-1 text-xs font-medium text-rose-900 transition-colors hover:bg-rose-100 focus:outline-none focus:ring-2 focus:ring-rose-500/25 disabled:opacity-50"
                            title={
                              pendingCount === 0
                                ? 'No pending fines/warnings to email'
                                : 'Email pending fine notice to this employee'
                            }
                          >
                            <Mail className={`h-3 w-3 ${rowEmailing ? 'animate-pulse' : ''}`} aria-hidden />
                            {rowEmailing ? 'Sending…' : 'Email'}
                          </button>
                          {fine.fineRecords.filter((r) => !r.isWarning).length > 0 && (
                            <button
                              type="button"
                              onClick={() => generateAllPenaltySlips(fine)}
                              className="inline-flex items-center gap-1 rounded-lg border border-violet-200 bg-violet-50 px-2 py-1 text-xs font-medium text-violet-900 transition-colors hover:bg-violet-100 focus:outline-none focus:ring-2 focus:ring-violet-500/25"
                              title="Generate all penalty slips"
                            >
                              <FileText className="h-3 w-3" aria-hidden />
                              Slips
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>

                    {expandedRows.has(fine._id) && (
                      <tr className="bg-slate-50">
                        <td colSpan={9} className="border-t border-slate-100 px-4 py-4">
                          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
                            {fine.fineRecords.map((record, idx) => (
                              <div
                                key={idx}
                                className={`rounded-lg border p-3 shadow-sm ${
                                  record.isWarning
                                    ? 'border-amber-200 bg-amber-50/80'
                                    : 'border-rose-200 bg-rose-50/60'
                                }`}
                              >
                                <div className="mb-2 flex items-start justify-between">
                                  <div>
                                    <div className="mb-1 font-mono text-xs text-emerald-700">{record.serialNo}</div>
                                    <div className="font-medium text-slate-900">
                                      {new Date(record.date).toLocaleDateString('en-IN', {
                                        weekday: 'short',
                                        day: 'numeric',
                                        month: 'short',
                                      })}
                                    </div>
                                    <div className="text-xs text-slate-600">Consecutive day: {record.consecutiveDay}</div>
                                  </div>
                                  <div className="text-right">
                                    {record.isWarning ? (
                                      <span className="flex items-center gap-1 font-medium text-amber-800">
                                        <AlertTriangle className="h-4 w-4" aria-hidden /> Warning
                                      </span>
                                    ) : (
                                      <span className="font-bold text-rose-700">₹{record.fineAmount}</span>
                                    )}
                                  </div>
                                </div>

                                <div className="mt-2 space-y-1 text-xs text-slate-700">
                                  {record.reason && (
                                    <div>
                                      <span className="font-medium text-slate-600">Reason:</span> {record.reason}
                                    </div>
                                  )}
                                  {record.vertical && (
                                    <div>
                                      <span className="font-medium text-slate-600">Vertical:</span> {record.vertical}
                                    </div>
                                  )}
                                  {record.penaltyImposedBy && (
                                    <div>
                                      <span className="font-medium text-slate-600">Imposed by:</span>{' '}
                                      {record.penaltyImposedBy}
                                    </div>
                                  )}
                                  {record.remark && (
                                    <div>
                                      <span className="font-medium text-slate-600">Remark:</span> {record.remark}
                                    </div>
                                  )}
                                  {record.paymentDate && (
                                    <div>
                                      <span className="font-medium text-slate-600">Payment:</span> {record.paymentDate}{' '}
                                      ({record.paymentMode || 'N/A'})
                                    </div>
                                  )}
                                </div>

                                <div className="mt-2 flex items-center justify-between">
                                  <span
                                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                                      record.status === 'pending'
                                        ? 'border border-blue-200/65 bg-panel text-slate-800'
                                        : record.status === 'paid'
                                          ? 'border border-emerald-200 bg-emerald-50 text-emerald-900'
                                          : 'border border-blue-200 bg-blue-50 text-blue-900'
                                    }`}
                                  >
                                    {record.status.charAt(0).toUpperCase() + record.status.slice(1)}
                                  </span>

                                  <div className="flex gap-1">
                                    {!record.isWarning && (
                                      <button
                                        type="button"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          generatePenaltySlip(fine, record);
                                        }}
                                        className="rounded-md border border-violet-200 bg-panel p-1 text-violet-800 transition-colors hover:bg-violet-50 focus:outline-none focus:ring-2 focus:ring-violet-500/25"
                                        title="Generate penalty slip"
                                      >
                                        <FileText className="h-3 w-3" aria-hidden />
                                      </button>
                                    )}

                                    {!record.isWarning && record.status === 'pending' && (
                                      <>
                                        <button
                                          type="button"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            updateFineStatus(fine._id, record.date, 'paid');
                                          }}
                                          className="rounded-md border border-emerald-200 bg-panel p-1 text-emerald-800 transition-colors hover:bg-emerald-50 focus:outline-none focus:ring-2 focus:ring-emerald-500/25"
                                          title="Mark as paid"
                                        >
                                          <Check className="h-3 w-3" aria-hidden />
                                        </button>
                                        <button
                                          type="button"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            updateFineStatus(fine._id, record.date, 'waived');
                                          }}
                                          className="rounded-md border border-blue-200 bg-panel p-1 text-blue-800 transition-colors hover:bg-blue-50 focus:outline-none focus:ring-2 focus:ring-blue-500/25"
                                          title="Waive fine"
                                        >
                                          <X className="h-3 w-3" aria-hidden />
                                        </button>
                                      </>
                                    )}
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
};

export default FineManagementSection;
