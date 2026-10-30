import { type PayrollGroup } from '@/lib/salaryCalculation';

export const GROUP_LABEL: Record<PayrollGroup, string> = {
  fixed: 'Fixed salary',
  partner: 'Partners',
  staff: 'Staff',
  admin: 'Admin',
  article: 'Articles / interns',
};

export const GROUPS: PayrollGroup[] = ['fixed', 'partner', 'staff', 'admin', 'article'];

export const WORKFLOW = ['Pick month & generate', 'Review or override', 'Export / email payslips'] as const;
