'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { RefreshCw, AlertTriangle, IndianRupee, Download, Check, X, ChevronDown, ChevronUp, Info, Users, AlertCircle, Edit2, FileText } from 'lucide-react';

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
        const teamVal = fine.userId?.team || fine.userId?.workingUnderPartner || '';
        if (teamVal !== teamFilter) return false;
      }
      // Status filter - check if any record matches
      if (statusFilter !== 'all') {
        const hasMatchingStatus = fine.fineRecords.some(r => r.status === statusFilter);
        if (!hasMatchingStatus) return false;
      }
      return true;
    });
  }, [fines, searchTerm, categoryFilter, statusFilter, teamFilter]);

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
          vertical: record.vertical || fine.userId?.team || fine.userId?.workingUnderPartner || '',
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
    doc.text(record.reason || '-', margin + col1Width + 2, row4Y + 6);

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
            reasonParts.push(`In Time-${record.reason.replace(/^In Time-/, '')}`);
          }
          reasonText = reasonParts.join(' ');
          if (!reasonText && record.remark) {
            reasonText = record.remark;
          } else if (!reasonText) {
            reasonText = '-';
          }
        }
        doc.text(reasonText.substring(0, 40), xPos + 2, rowY + 5.5);
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

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-100">Fine Management</h2>
          <p className="text-sm text-slate-400 mt-1">Manage late arrival fines and warnings</p>
        </div>
        
        <div className="flex items-center gap-3">
          {/* Month/Year selector */}
          <select
            value={month}
            onChange={(e) => setMonth(Number(e.target.value))}
            className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200"
          >
            {Array.from({ length: 12 }, (_, i) => (
              <option key={i + 1} value={i + 1}>
                {new Date(2000, i, 1).toLocaleString('default', { month: 'long' })}
              </option>
            ))}
          </select>
          <select
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
            className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200"
          >
            {Array.from({ length: 5 }, (_, i) => (
              <option key={2024 + i} value={2024 + i}>{2024 + i}</option>
            ))}
          </select>
          
          <button
            onClick={calculateFines}
            disabled={calculating}
            className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${calculating ? 'animate-spin' : ''}`} />
            {calculating ? 'Calculating...' : 'Calculate Fines'}
          </button>
          
          <button
            onClick={exportToExcel}
            disabled={filteredFines.length === 0}
            className="flex items-center gap-2 px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition-colors disabled:opacity-50"
          >
            <Download className="w-4 h-4" />
            Export Excel
          </button>
        </div>
      </div>

      {/* Manual Fine Form */}
      <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-4">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-medium text-slate-200">Impose Manual Fine</h3>
          <button
            onClick={() => setShowManualFineForm(!showManualFineForm)}
            className="text-slate-400 hover:text-slate-200"
          >
            {showManualFineForm ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
          </button>
        </div>
        {showManualFineForm && (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">Search Employee</label>
              <input
                type="text"
                placeholder="Search by name or ID..."
                value={manualFineEmployee}
                onChange={(e) => setManualFineEmployee(e.target.value)}
                className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-200"
                list="employee-list"
              />
              <datalist id="employee-list">
                {fines.map(fine => (
                  <option key={fine.userId._id} value={fine.userId._id}>
                    {fine.userId.name} ({fine.userId.odId})
                  </option>
                ))}
              </datalist>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">Reason *</label>
                <input
                  type="text"
                  placeholder="Enter reason for fine"
                  value={manualFineReason}
                  onChange={(e) => setManualFineReason(e.target.value)}
                  className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-200"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">Fine Amount (₹) *</label>
                <input
                  type="number"
                  placeholder="Enter amount"
                  value={manualFineAmount}
                  onChange={(e) => setManualFineAmount(e.target.value)}
                  className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-200"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">Remark (Optional)</label>
              <textarea
                placeholder="Additional remarks"
                value={manualFineRemark}
                onChange={(e) => setManualFineRemark(e.target.value)}
                className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-200"
                rows={2}
              />
            </div>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setShowManualFineForm(false)}
                className="px-4 py-2 bg-slate-600 hover:bg-slate-700 text-white rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={imposeManualFine}
                disabled={imposingFine}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-lg transition-colors disabled:opacity-50"
              >
                {imposingFine ? 'Imposing...' : 'Impose Fine'}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Rules Info Card */}
      <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-4">
        <div className="flex items-start gap-3">
          <Info className="w-5 h-5 text-blue-400 mt-0.5 flex-shrink-0" />
          <div className="text-sm">
            <h3 className="font-medium text-slate-200 mb-2">Fine Rules</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-slate-400">
              <div>
                <span className="font-medium text-slate-300">Staff:</span>
                <ul className="list-disc list-inside ml-2 space-y-0.5">
                  <li>1-2 consecutive late days → Warning</li>
                  <li>3rd-7th consecutive late day → ₹50 each</li>
                  <li>8th+ consecutive late day → ₹100 each</li>
                </ul>
              </div>
              <div>
                <span className="font-medium text-slate-300">Article/Trainee:</span>
                <ul className="list-disc list-inside ml-2 space-y-0.5">
                  <li>1-2 consecutive late days → Warning</li>
                  <li>3rd+ consecutive late day → ₹25 each</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-slate-800 border border-slate-700 rounded-lg p-4">
          <div className="flex items-center gap-2 text-amber-400 mb-2">
            <AlertTriangle className="w-5 h-5" />
            <span className="text-sm font-medium">Total Warnings</span>
          </div>
          <div className="text-2xl font-bold text-slate-100">{totals.totalWarnings}</div>
          <div className="text-xs text-slate-500">{totals.employeesWithWarnings} employees</div>
        </div>
        
        <div className="bg-slate-800 border border-slate-700 rounded-lg p-4">
          <div className="flex items-center gap-2 text-rose-400 mb-2">
            <IndianRupee className="w-5 h-5" />
            <span className="text-sm font-medium">Total Fines</span>
          </div>
          <div className="text-2xl font-bold text-slate-100">₹{totals.totalFines}</div>
          <div className="text-xs text-slate-500">{totals.employeesWithFines} employees</div>
        </div>
        
        <div className="bg-slate-800 border border-slate-700 rounded-lg p-4">
          <div className="flex items-center gap-2 text-blue-400 mb-2">
            <Users className="w-5 h-5" />
            <span className="text-sm font-medium">Staff Fines</span>
          </div>
          <div className="text-2xl font-bold text-slate-100">
            ₹{fines.filter(f => f.category === 'Staff').reduce((s, f) => s + f.totalFine, 0)}
          </div>
        </div>
        
        <div className="bg-slate-800 border border-slate-700 rounded-lg p-4">
          <div className="flex items-center gap-2 text-purple-400 mb-2">
            <Users className="w-5 h-5" />
            <span className="text-sm font-medium">Article Fines</span>
          </div>
          <div className="text-2xl font-bold text-slate-100">
            ₹{fines.filter(f => f.category === 'Article').reduce((s, f) => s + f.totalFine, 0)}
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <input
          type="text"
          placeholder="Search by name or ID..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 w-64"
        />
        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value as 'all' | 'Staff' | 'Article')}
          className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200"
        >
          <option value="all">All Categories</option>
          <option value="Staff">Staff</option>
          <option value="Article">Article</option>
        </select>
        <select
          value={teamFilter}
          onChange={e => setTeamFilter(e.target.value)}
          className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200"
        >
          <option value="all">All Teams</option>
          {Array.from(new Set(fines.map(f => f.userId?.team || f.userId?.workingUnderPartner).filter(Boolean))).map(team => (
            <option key={team} value={team}>{team}</option>
          ))}
        </select>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as 'all' | 'pending' | 'paid' | 'waived')}
          className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200"
        >
          <option value="all">All Status</option>
          <option value="pending">Pending</option>
          <option value="paid">Paid</option>
          <option value="waived">Waived</option>
        </select>
      </div>

      {/* Error message */}
      {error && (
        <div className="bg-rose-500/10 border border-rose-500/30 rounded-lg p-4 flex items-center gap-3">
          <AlertCircle className="w-5 h-5 text-rose-400" />
          <span className="text-rose-300">{error}</span>
        </div>
      )}

      {/* Loading state */}
      {loading && (
        <div className="flex items-center justify-center py-12">
          <RefreshCw className="w-8 h-8 text-slate-500 animate-spin" />
        </div>
      )}

      {/* Fines Table */}
      {!loading && (
        <div className="bg-slate-800 border border-slate-700 rounded-lg overflow-hidden">
          <table className="w-full">
            <thead className="bg-slate-900">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider w-8"></th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">Employee</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">Category</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">Team</th>
                <th className="px-4 py-3 text-center text-xs font-medium text-slate-400 uppercase tracking-wider">Warnings</th>
                <th className="px-4 py-3 text-center text-xs font-medium text-slate-400 uppercase tracking-wider">Fine Records</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-slate-400 uppercase tracking-wider">Total Fine</th>
                <th className="px-4 py-3 text-center text-xs font-medium text-slate-400 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700">
              {filteredFines.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-slate-500">
                    {fines.length === 0 
                      ? 'No fine records found. Click "Calculate Fines" to generate.'
                      : 'No matching records found.'
                    }
                  </td>
                </tr>
              ) : (
                filteredFines.map(fine => (
                  <React.Fragment key={fine._id}>
                    <tr 
                      className={`hover:bg-slate-700/50 cursor-pointer transition-colors ${expandedRows.has(fine._id) ? 'bg-slate-700/30' : ''}`}
                      onClick={() => toggleRow(fine._id)}
                    >
                      <td className="px-4 py-3">
                        {expandedRows.has(fine._id) ? (
                          <ChevronUp className="w-4 h-4 text-slate-400" />
                        ) : (
                          <ChevronDown className="w-4 h-4 text-slate-400" />
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-medium text-slate-200">{fine.userId?.name}</div>
                        <div className="text-xs text-slate-500">{fine.userId?.odId}</div>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                          fine.category === 'Staff' 
                            ? 'bg-blue-500/20 text-blue-300' 
                            : 'bg-purple-500/20 text-purple-300'
                        }`}>
                          {fine.category}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-400 text-sm">{fine.userId?.team || fine.userId?.workingUnderPartner || '-'}</td>
                      <td className="px-4 py-3 text-center">
                        {fine.totalWarnings > 0 && (
                          <span className="text-amber-400 font-medium">{fine.totalWarnings}</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center text-slate-400">
                        {fine.fineRecords.filter(r => !r.isWarning).length}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {fine.totalFine > 0 ? (
                          <span className="text-rose-400 font-bold">₹{fine.totalFine}</span>
                        ) : (
                          <span className="text-slate-500">₹0</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {fine.fineRecords.filter(r => !r.isWarning).length > 0 && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              generateAllPenaltySlips(fine);
                            }}
                            className="flex items-center gap-1 px-2 py-1 bg-purple-600 hover:bg-purple-700 text-white text-xs rounded transition-colors mx-auto"
                            title="Generate All Penalty Slips"
                          >
                            <FileText className="w-3 h-3" />
                            Generate Slips
                          </button>
                        )}
                      </td>
                    </tr>
                    
                    {/* Expanded row details */}
                    {expandedRows.has(fine._id) && (
                      <tr className="bg-slate-900/50">
                        <td colSpan={8} className="px-4 py-4">
                          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                            {fine.fineRecords.map((record, idx) => (
                              <div 
                                key={idx}
                                className={`p-3 rounded-lg border ${
                                  record.isWarning 
                                    ? 'bg-amber-500/10 border-amber-500/30' 
                                    : 'bg-rose-500/10 border-rose-500/30'
                                }`}
                              >
                              <div className="flex justify-between items-start mb-2">
                                  <div>
                                    <div className="text-xs font-mono text-emerald-400 mb-1">
                                      {record.serialNo}
                                    </div>
                                    <div className="font-medium text-slate-200">
                                      {new Date(record.date).toLocaleDateString('en-IN', { 
                                        weekday: 'short', 
                                        day: 'numeric', 
                                        month: 'short' 
                                      })}
                                    </div>
                                    <div className="text-xs text-slate-500">
                                      Consecutive day: {record.consecutiveDay}
                                    </div>
                                  </div>
                                  <div className="text-right">
                                    {record.isWarning ? (
                                      <span className="text-amber-400 font-medium flex items-center gap-1">
                                        <AlertTriangle className="w-4 h-4" /> Warning
                                      </span>
                                    ) : (
                                      <span className="text-rose-400 font-bold">₹{record.fineAmount}</span>
                                    )}
                                  </div>
                                </div>
                                
                                {/* Additional Details */}
                                <div className="mt-2 space-y-1 text-xs">
                                  {record.reason && (
                                    <div className="text-slate-400">
                                      <span className="text-slate-500">Reason:</span> {record.reason}
                                    </div>
                                  )}
                                  {record.vertical && (
                                    <div className="text-slate-400">
                                      <span className="text-slate-500">Vertical:</span> {record.vertical}
                                    </div>
                                  )}
                                  {record.penaltyImposedBy && (
                                    <div className="text-slate-400">
                                      <span className="text-slate-500">Imposed by:</span> {record.penaltyImposedBy}
                                    </div>
                                  )}
                                  {record.remark && (
                                    <div className="text-slate-400">
                                      <span className="text-slate-500">Remark:</span> {record.remark}
                                    </div>
                                  )}
                                  {record.paymentDate && (
                                    <div className="text-slate-400">
                                      <span className="text-slate-500">Payment:</span> {record.paymentDate} ({record.paymentMode || 'N/A'})
                                    </div>
                                  )}
                                </div>
                                
                                <div className="flex items-center justify-between mt-2">
                                  <span className={`text-xs px-2 py-0.5 rounded ${
                                    record.status === 'pending' ? 'bg-slate-700 text-slate-300' :
                                    record.status === 'paid' ? 'bg-emerald-500/20 text-emerald-300' :
                                    'bg-blue-500/20 text-blue-300'
                                  }`}>
                                    {record.status.charAt(0).toUpperCase() + record.status.slice(1)}
                                  </span>
                                  
                                  <div className="flex gap-1">
                                    {/* Generate Slip Button - for fines only */}
                                    {!record.isWarning && (
                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          generatePenaltySlip(fine, record);
                                        }}
                                        className="p-1 bg-purple-600 hover:bg-purple-700 rounded text-white"
                                        title="Generate Penalty Slip"
                                      >
                                        <FileText className="w-3 h-3" />
                                      </button>
                                    )}
                                    
                                    {!record.isWarning && record.status === 'pending' && (
                                      <>
                                        <button
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            updateFineStatus(fine._id, record.date, 'paid');
                                          }}
                                          className="p-1 bg-emerald-600 hover:bg-emerald-700 rounded text-white"
                                          title="Mark as Paid"
                                        >
                                          <Check className="w-3 h-3" />
                                        </button>
                                        <button
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            updateFineStatus(fine._id, record.date, 'waived');
                                          }}
                                          className="p-1 bg-blue-600 hover:bg-blue-700 rounded text-white"
                                          title="Waive Fine"
                                        >
                                          <X className="w-3 h-3" />
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
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default FineManagementSection;
