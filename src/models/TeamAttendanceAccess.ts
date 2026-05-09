import mongoose, { Schema, Document, Model } from 'mongoose';

export interface ITeamAttendanceAccess extends Document {
  viewerUserId: mongoose.Types.ObjectId;
  includeOwnTeam: boolean;
  extraUserIds: mongoose.Types.ObjectId[];
  extraPartnerNames: string[];
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

export default TeamAttendanceAccess;
