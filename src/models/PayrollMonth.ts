import mongoose, { Schema, Document, Model, Types } from 'mongoose';
import type { PayrollGroup, PayrollOverrides, ArticleshipYear, PayrollExtraKind } from '@/lib/salaryCalculation';

export interface IPayrollLine {
  userId: Types.ObjectId;
  odId: string;
  employeeCode: string;
  name: string;
  email: string;
  attendanceEmail: string;
  category: string;
  designation: string;
  team: string;
  paidFrom: string;
  tallyName: string;
  verticalHead: string;
  employmentType: string;
  joiningDate?: Date | null;
  articleshipStartDate?: Date | null;
  bankName: string;
  branchName: string;
  accountNumber: string;
  ifscCode: string;
  accountHolderName: string;
  mobileNumber: string;
  esiNumber: string;
  otherAllowance: number;
  group: PayrollGroup;
  isNewJoin: boolean;
  isArticle: boolean;
  articleshipYear: ArticleshipYear;
  pio: number;
  woPio: number;
  osP: number;
  absent: number;
  hd: number;
  weekoffHd: number;
  weekoffs: number;
  sun: number;
  ohd: number;
  wfhWeekoff: number;
  wfhWeekday: number;
  wfhMaxAllowed: number;
  absentWfh: number;
  presentWfhActual: number;
  absentWfhMaxActual: number;
  weekdaysWorking: number;
  leavesTaken: number;
  leavesBf: number;
  leavesEarned: number;
  leavesConsumed: number;
  leavesCf: number;
  weekoffWorking: number;
  overtimeSuggested: number;
  overtimeDays: number;
  excessHours: number;
  weekdayHours: number;
  netWorkingDays: number;
  officeWorkingDays: number;
  checking: number;
  basic: number;
  laptop: number;
  payableBasic: number;
  payableLaptop: number;
  payableMonth: number;
  dueInTally: number;
  additionInOffDue: number;
  cashOffDue: number;
  otherExtra: number;
  esiEmployer: number;
  esiEmployee: number;
  tds: number;
  advances: number;
  off: number;
  taReimbursement: number;
  lcReimbursement: number;
  laptopAdjustment: number;
  customEarnings: number;
  customDeductions: number;
  bankPayment: number;
  cashOff: number;
  diff: number;
  netSalary: number;
  overrides: PayrollOverrides;
  payslipSentAt?: Date | null;
  payslipSentTo?: string;
}

export interface IPayrollMonth extends Document {
  monthYear: string;
  status: 'draft' | 'finalized';
  calendar: { totalDays: number; sundays: number; ohd: number };
  lines: IPayrollLine[];
  extraFields: Array<{ extraId: string; label: string; kind: PayrollExtraKind }>;
  generatedAt: Date;
  generatedBy?: string;
  finalizedAt?: Date | null;
  finalizedBy?: string;
  createdAt: Date;
  updatedAt: Date;
}

const OverridesSchema = new Schema(
  {
    overtimeDays: { type: Number, default: null },
    netWorkingDays: { type: Number, default: null },
    officeWorkingDays: { type: Number, default: null },
    dueInTally: { type: Number, default: null },
    additionInOffDue: { type: Number, default: null },
    otherExtra: { type: Number, default: null },
    esiEmployer: { type: Number, default: null },
    esiEmployee: { type: Number, default: null },
    tds: { type: Number, default: null },
    advances: { type: Number, default: null },
    off: { type: Number, default: null },
    taReimbursement: { type: Number, default: null },
    lcReimbursement: { type: Number, default: null },
    laptopAdjustment: { type: Number, default: null },
    remarks: { type: String, default: '' },
    group: { type: String, default: null },
    customAmounts: { type: Schema.Types.Mixed, default: () => ({}) },
  },
  { _id: false }
);

const ExtraFieldSchema = new Schema(
  {
    extraId: { type: String, required: true },
    label: { type: String, default: '' },
    kind: { type: String, enum: ['earning', 'deduction'], default: 'earning' },
  },
  { _id: false, id: false }
);

const PayrollLineSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    odId: { type: String, default: '' },
    employeeCode: { type: String, default: '' },
    name: { type: String, default: '' },
    email: { type: String, default: '' },
    attendanceEmail: { type: String, default: '' },
    category: { type: String, default: '' },
    designation: { type: String, default: '' },
    team: { type: String, default: '' },
    paidFrom: { type: String, default: '' },
    tallyName: { type: String, default: '' },
    verticalHead: { type: String, default: '' },
    employmentType: { type: String, default: '' },
    joiningDate: { type: Date, default: null },
    articleshipStartDate: { type: Date, default: null },
    bankName: { type: String, default: '' },
    branchName: { type: String, default: '' },
    accountNumber: { type: String, default: '' },
    ifscCode: { type: String, default: '' },
    accountHolderName: { type: String, default: '' },
    mobileNumber: { type: String, default: '' },
    esiNumber: { type: String, default: '' },
    otherAllowance: { type: Number, default: 0 },
    group: { type: String, default: 'staff' },
    isNewJoin: { type: Boolean, default: false },
    isArticle: { type: Boolean, default: false },
    articleshipYear: { type: String, default: '' },
    pio: { type: Number, default: 0 },
    woPio: { type: Number, default: 0 },
    osP: { type: Number, default: 0 },
    absent: { type: Number, default: 0 },
    hd: { type: Number, default: 0 },
    weekoffHd: { type: Number, default: 0 },
    weekoffs: { type: Number, default: 0 },
    sun: { type: Number, default: 0 },
    ohd: { type: Number, default: 0 },
    wfhWeekoff: { type: Number, default: 0 },
    wfhWeekday: { type: Number, default: 0 },
    wfhMaxAllowed: { type: Number, default: 0 },
    absentWfh: { type: Number, default: 0 },
    presentWfhActual: { type: Number, default: 0 },
    absentWfhMaxActual: { type: Number, default: 0 },
    weekdaysWorking: { type: Number, default: 0 },
    leavesTaken: { type: Number, default: 0 },
    leavesBf: { type: Number, default: 0 },
    leavesEarned: { type: Number, default: 0 },
    leavesConsumed: { type: Number, default: 0 },
    leavesCf: { type: Number, default: 0 },
    weekoffWorking: { type: Number, default: 0 },
    overtimeSuggested: { type: Number, default: 0 },
    overtimeDays: { type: Number, default: 0 },
    excessHours: { type: Number, default: 0 },
    weekdayHours: { type: Number, default: 8 },
    netWorkingDays: { type: Number, default: 0 },
    officeWorkingDays: { type: Number, default: 0 },
    checking: { type: Number, default: 0 },
    basic: { type: Number, default: 0 },
    laptop: { type: Number, default: 0 },
    payableBasic: { type: Number, default: 0 },
    payableLaptop: { type: Number, default: 0 },
    payableMonth: { type: Number, default: 0 },
    dueInTally: { type: Number, default: 0 },
    additionInOffDue: { type: Number, default: 0 },
    cashOffDue: { type: Number, default: 0 },
    otherExtra: { type: Number, default: 0 },
    esiEmployer: { type: Number, default: 0 },
    esiEmployee: { type: Number, default: 0 },
    tds: { type: Number, default: 0 },
    advances: { type: Number, default: 0 },
    off: { type: Number, default: 0 },
    taReimbursement: { type: Number, default: 0 },
    lcReimbursement: { type: Number, default: 0 },
    laptopAdjustment: { type: Number, default: 0 },
    customEarnings: { type: Number, default: 0 },
    customDeductions: { type: Number, default: 0 },
    bankPayment: { type: Number, default: 0 },
    cashOff: { type: Number, default: 0 },
    diff: { type: Number, default: 0 },
    netSalary: { type: Number, default: 0 },
    overrides: { type: OverridesSchema, default: () => ({}) },
    payslipSentAt: { type: Date, default: null },
    payslipSentTo: { type: String, default: '' },
  },
  { _id: false }
);

const PayrollMonthSchema = new Schema<IPayrollMonth>(
  {
    monthYear: { type: String, required: true, unique: true, index: true },
    status: { type: String, enum: ['draft', 'finalized'], default: 'draft' },
    calendar: {
      totalDays: { type: Number, default: 0 },
      sundays: { type: Number, default: 0 },
      ohd: { type: Number, default: 0 },
    },
    lines: { type: [PayrollLineSchema], default: [] },
    extraFields: { type: [ExtraFieldSchema], default: [] },
    generatedAt: { type: Date, default: Date.now },
    generatedBy: { type: String, default: '' },
    finalizedAt: { type: Date, default: null },
    finalizedBy: { type: String, default: '' },
  },
  { timestamps: true }
);

if (mongoose.models.PayrollMonth) {
  delete mongoose.models.PayrollMonth;
}

const PayrollMonth: Model<IPayrollMonth> = mongoose.model<IPayrollMonth>('PayrollMonth', PayrollMonthSchema);

export default PayrollMonth;
