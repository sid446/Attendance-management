import { FileSpreadsheet, Upload, CheckCircle, Clock, Users, Calendar, Database, TrendingUp, IndianRupee, AlertTriangle, MapPin, ShieldCheck, Lock, ClipboardList, Settings } from 'lucide-react';
import type { NavCategory } from './types';

/** Sidebar groups preserve the original flat nav order. */
export const NAV_CATEGORIES: NavCategory[] = [
  {
    key: 'employees',
    label: 'Employees',
    items: [
      { id: 'employees', label: 'Employees', icon: Users },
      { id: 'employeeMasterUpload', label: 'Employee Master Upload', icon: FileSpreadsheet },
      { id: 'teamAccess', label: 'Team Access', icon: ShieldCheck },
    ],
  },
  {
    key: 'attendance',
    label: 'Attendance',
    items: [
      { id: 'summary', label: 'Attendance Summary', icon: CheckCircle },
      { id: 'employee', label: 'Employee Month View', icon: Clock },
      { id: 'daywiseCompare', label: 'Daywise Compare', icon: FileSpreadsheet },
      { id: 'requests', label: 'Requests', icon: Clock },
      { id: 'invalid', label: 'Invalid Attendance', icon: AlertTriangle },
      { id: 'misExceptions', label: 'MIS Exceptions', icon: ClipboardList },
    ],
  },
  {
    key: 'leave-payroll',
    label: 'Leave & payroll',
    items: [
      { id: 'leave', label: 'Leave Management', icon: TrendingUp },
      { id: 'salaryPayroll', label: 'Salary', icon: IndianRupee },
      { id: 'articleCredits', label: 'Article Credits', icon: FileSpreadsheet },
      { id: 'fines', label: 'Fine Management', icon: IndianRupee },
      { id: 'holidays', label: 'Holiday Management', icon: Calendar },
    ],
  },
  {
    key: 'settings-data',
    label: 'Settings & data',
    items: [
      { id: 'settings', label: 'Settings', icon: Settings },
      { id: 'clientPlaces', label: 'Client Places', icon: MapPin },
      { id: 'accessControl', label: 'Access control', icon: Lock },
      { id: 'upload', label: 'Attendance Upload', icon: Upload },
      { id: 'backup', label: 'Database Backup', icon: Database },
    ],
  },
];
