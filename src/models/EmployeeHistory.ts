import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IEmployeeHistory extends Document {
  employeeId: mongoose.Types.ObjectId;
  fieldName: 'workingUnderPartner' | 'designation' | 'paidFrom' | 'category' | 'qualificationLevel' | 'registeredUnderPartner';
  oldValue?: string;
  newValue?: string;
  changedBy?: string; // User ID or name of who made the change
  changedAt: Date;
  changeReason?: string;
}

const EmployeeHistorySchema: Schema = new Schema(
  {
    employeeId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },
    fieldName: {
      type: String,
      required: true,
      enum: ['workingUnderPartner', 'designation', 'paidFrom', 'category', 'qualificationLevel', 'registeredUnderPartner']
    },
    oldValue: {
      type: String,
      default: ''
    },
    newValue: {
      type: String,
      default: ''
    },
    changedBy: {
      type: String,
      default: 'System'
    },
    changedAt: {
      type: Date,
      default: Date.now,
      index: true
    },
    changeReason: {
      type: String,
      default: ''
    }
  },
  {
    timestamps: true,
    collection: 'employee_histories'
  }
);

// Index for efficient queries
EmployeeHistorySchema.index({ employeeId: 1, changedAt: -1 });
EmployeeHistorySchema.index({ fieldName: 1, changedAt: -1 });

const EmployeeHistory: Model<IEmployeeHistory> = mongoose.models.EmployeeHistory || mongoose.model<IEmployeeHistory>('EmployeeHistory', EmployeeHistorySchema);

export default EmployeeHistory;