import mongoose, { Schema, Document, Model, Types } from 'mongoose';

export interface IFineRecord {
  serialNo: string;       // Format: "NK/001" - initials + sequence
  date: string;           // Format: "YYYY-MM-DD"
  consecutiveDay: number; // Which consecutive late day this is
  fineAmount: number;     // Fine amount in rupees
  isWarning: boolean;     // True if this is a warning, not a fine
  status: 'pending' | 'paid' | 'waived';
  penaltyImposedBy?: string;  // Who imposed the penalty
  reason?: string;            // e.g., "In Time-10:49"
  remark?: string;            // Additional remarks
  paymentDate?: string;       // Date of payment
  paymentMode?: 'cash' | 'upi' | 'bank_transfer' | 'salary_deduction' | '';
  vertical?: string;          // Same as team/workingUnderPartner
}

export interface IFine extends Document {
  userId: Types.ObjectId;
  monthYear: string;      // Format: "YYYY-MM"
  category: 'Staff' | 'Article'; // Employee category for fine rules
  fineRecords: IFineRecord[];
  totalFine: number;      // Total fine amount for the month
  totalWarnings: number;  // Total warnings for the month
  createdAt: Date;
  updatedAt: Date;
}

const FineRecordSchema: Schema = new Schema({
  serialNo: {
    type: String,
    default: '',
  },
  date: {
    type: String,
    required: true,
  },
  consecutiveDay: {
    type: Number,
    required: true,
  },
  fineAmount: {
    type: Number,
    default: 0,
  },
  isWarning: {
    type: Boolean,
    default: false,
  },
  status: {
    type: String,
    enum: ['pending', 'paid', 'waived'],
    default: 'pending',
  },
  penaltyImposedBy: {
    type: String,
    default: '',
  },
  reason: {
    type: String,
    default: '',
  },
  remark: {
    type: String,
    default: '',
  },
  paymentDate: {
    type: String,
    default: '',
  },
  paymentMode: {
    type: String,
    enum: ['cash', 'upi', 'bank_transfer', 'salary_deduction', ''],
    default: '',
  },
  vertical: {
    type: String,
    default: '',
  },
}, { _id: false });

const FineSchema: Schema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    monthYear: {
      type: String,
      required: true,
    },
    category: {
      type: String,
      enum: ['Staff', 'Article'],
      required: true,
    },
    fineRecords: {
      type: [FineRecordSchema],
      default: [],
    },
    totalFine: {
      type: Number,
      default: 0,
    },
    totalWarnings: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true,
  }
);

// Compound index for unique user+month combinations
FineSchema.index({ userId: 1, monthYear: 1 }, { unique: true });

const Fine: Model<IFine> = mongoose.models.Fine || mongoose.model<IFine>('Fine', FineSchema);

export default Fine;
