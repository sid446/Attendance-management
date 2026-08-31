import mongoose, { Schema, Document, Model } from 'mongoose';

export interface ITeamAttendanceAccess extends Document {
  viewerUserId: mongoose.Types.ObjectId;
  includeOwnTeam: boolean;
  extraUserIds: mongoose.Types.ObjectId[];
  extraPartnerNames: string[];
  /** When true, viewer may approve attendance requests for people they can see. */
  canApproveRequests: boolean;
  /** When true, viewer may approve their own attendance. Independent of include-self viewing. */
  canApproveSelf: boolean;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const TeamAttendanceAccessSchema = new Schema(
  {
    viewerUserId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true,
      index: true,
    },
    includeOwnTeam: {
      type: Boolean,
      default: true,
    },
    extraUserIds: [
      {
        type: Schema.Types.ObjectId,
        ref: 'User',
      },
    ],
    extraPartnerNames: [
      {
        type: String,
        trim: true,
      },
    ],
    canApproveRequests: {
      type: Boolean,
      default: true,
    },
    canApproveSelf: {
      type: Boolean,
      default: false,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

const TeamAttendanceAccess: Model<ITeamAttendanceAccess> =
  mongoose.models.TeamAttendanceAccess ||
  mongoose.model<ITeamAttendanceAccess>('TeamAttendanceAccess', TeamAttendanceAccessSchema);

if (!TeamAttendanceAccess.schema.path('canApproveRequests')) {
  TeamAttendanceAccess.schema.add({
    canApproveRequests: { type: Boolean, default: true },
  });
}

if (!TeamAttendanceAccess.schema.path('canApproveSelf')) {
  TeamAttendanceAccess.schema.add({
    canApproveSelf: { type: Boolean, default: false },
  });
}

export default TeamAttendanceAccess;
