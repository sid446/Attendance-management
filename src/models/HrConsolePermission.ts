import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IHrConsolePermission extends Document {
  operatorEmail: string;
  sections: Map<string, string>;
  employeeTabs: Map<string, string>;
  createdAt: Date;
  updatedAt: Date;
}

const HrConsolePermissionSchema = new Schema(
  {
    operatorEmail: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    sections: {
      type: Map,
      of: String,
      default: undefined,
    },
    employeeTabs: {
      type: Map,
      of: String,
      default: undefined,
    },
  },
  { timestamps: true }
);

const HrConsolePermission: Model<IHrConsolePermission> =
  mongoose.models.HrConsolePermission ||
  mongoose.model<IHrConsolePermission>('HrConsolePermission', HrConsolePermissionSchema);

export default HrConsolePermission;
