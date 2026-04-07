import mongoose from 'mongoose';

const LeaveTransactionSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  date: { type: String, required: true }, // ISO date string or month depending on type
  monthYear: { type: String },
  type: { type: String, enum: ['earned', 'used', 'adjust'], required: true },
  amount: { type: Number, required: true },
  source: { type: String }, // e.g. 'monthly-increment','approval','outstation-delta','migration'
  reference: { type: String }, // optional reference id (attendance id, request id)
  createdAt: { type: Date, default: () => new Date() }
});

export interface ILeaveTransaction extends mongoose.Document {
  userId: mongoose.Types.ObjectId;
  date: string;
  monthYear?: string;
  type: 'earned' | 'used' | 'adjust';
  amount: number;
  source?: string;
  reference?: string;
  createdAt: Date;
}

const LeaveTransaction = mongoose.models.LeaveTransaction || mongoose.model<ILeaveTransaction>('LeaveTransaction', LeaveTransactionSchema);
export default LeaveTransaction;
