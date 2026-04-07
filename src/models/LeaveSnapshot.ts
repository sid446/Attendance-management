import mongoose from 'mongoose';

const LeaveSnapshotSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  monthYear: { type: String, required: true }, // YYYY-MM
  // Per-month fields
  earnedThisMonth: { type: Number, default: 0 },
  usedThisMonth: { type: Number, default: 0 },
  adjustmentsThisMonth: { type: Number, default: 0 },
  // Cumulative fields up to this month
  cumulativeEarned: { type: Number, default: 0 },
  cumulativeUsed: { type: Number, default: 0 },
  cumulativeAdjust: { type: Number, default: 0 },
  // Balance at month start (carry forward) and at month end
  balanceAsOfMonth: { type: Number, default: 0 }, // balance at start of this month
  remainingAfter: { type: Number, default: 0 }, // balance at end of this month
  createdAt: { type: Date, default: () => new Date() }
});

export interface ILeaveSnapshot extends mongoose.Document {
  userId: mongoose.Types.ObjectId;
  monthYear: string;
  earnedThisMonth: number;
  usedThisMonth: number;
  adjustmentsThisMonth: number;
  cumulativeEarned: number;
  cumulativeUsed: number;
  cumulativeAdjust: number;
  balanceAsOfMonth: number;
  remainingAfter: number;
  createdAt: Date;
}

const LeaveSnapshot = mongoose.models.LeaveSnapshot || mongoose.model<ILeaveSnapshot>('LeaveSnapshot', LeaveSnapshotSchema);
export default LeaveSnapshot;
