import mongoose, { Schema, Document, Model } from 'mongoose';
import type { AttendanceCalcPolicy } from '@/lib/attendanceCalcPolicy';

export interface IAttendanceCalcPolicy extends Document, AttendanceCalcPolicy {
  effectiveFrom: string;
  updatedBy?: string;
  createdAt: Date;
  updatedAt: Date;
}

const AttendanceCalcPolicySchema = new Schema(
  {
    effectiveFrom: { type: String, required: true, trim: true, unique: true },
    articleEarlyInCounts: { type: Boolean, required: true },
    articleExcessStyle: { type: String, enum: ['duration', 'edges'], default: 'edges' },
    articleEarlyInStyle: { type: String, enum: ['none', 'all', 'all-if-over', 'only-beyond'], default: 'all' },
    articleEarlyInGraceMinutes: { type: Number, min: 0, max: 720, default: 0 },
    articleLateOutStyle: { type: String, enum: ['none', 'all', 'all-if-over', 'only-beyond'], default: 'all-if-over' },
    articleLateOutGraceMinutes: { type: Number, required: true, min: 0, max: 720 },
    articleShortfallStyle: { type: String, enum: ['full', 'only-beyond', 'none'], default: 'full' },
    articleShortfallGraceMinutes: { type: Number, min: 0, max: 720, default: 0 },
    articleDurationGraceMinutes: { type: Number, min: 0, max: 720, default: 0 },
    articleDurationGraceStyle: { type: String, enum: ['full-if-over', 'only-beyond'], default: 'full-if-over' },
    staffGraceMinutes: { type: Number, required: true, min: 0, max: 720 },
    staffExcessStyle: { type: String, enum: ['duration', 'edges'], default: 'duration' },
    staffGraceStyle: { type: String, enum: ['full-if-over', 'only-beyond'], default: 'full-if-over' },
    staffEarlyInStyle: { type: String, enum: ['none', 'all', 'all-if-over', 'only-beyond'], default: 'all' },
    staffEarlyInGraceMinutes: { type: Number, min: 0, max: 720, default: 0 },
    staffLateOutStyle: { type: String, enum: ['none', 'all', 'all-if-over', 'only-beyond'], default: 'all' },
    staffLateOutGraceMinutes: { type: Number, min: 0, max: 720, default: 0 },
    staffShortfallStyle: { type: String, enum: ['full', 'only-beyond', 'none'], default: 'full' },
    staffShortfallGraceMinutes: { type: Number, min: 0, max: 720, default: 0 },
    halfDayUsesHalfSchedule: { type: Boolean, required: true },
    halfDayScheduledShare: { type: Number, min: 0, max: 1, default: 0.5 },
    zeroPunchExcessOnOffDays: { type: Boolean, required: true },
    zeroExcessOnLeave: { type: Boolean, default: true },
    zeroExcessOnAbsent: { type: Boolean, default: true },
    zeroExcessOnSunday: { type: Boolean, default: true },
    zeroExcessOnHoliday: { type: Boolean, default: true },
    zeroExcessOnWeekoff: { type: Boolean, default: true },
    countApprovedExtraOnOffDays: { type: Boolean, default: true },
    zeroExcessOnWfhOsp: { type: Boolean, required: true },
    zeroExcessOnWfh: { type: Boolean, default: true },
    zeroExcessOnOsp: { type: Boolean, default: true },
    lateCheckinHalfDayStart: { type: String, required: true, trim: true },
    lateCheckinAbsentFrom: { type: String, required: true, trim: true },
    lateHalfDayEnabled: { type: Boolean, default: true },
    lateAbsentEnabled: { type: Boolean, default: true },
    lateRulesForHalftime: { type: Boolean, default: false },
    separateArticleLateWindow: { type: Boolean, default: false },
    articleLateCheckinHalfDayStart: { type: String, trim: true, default: '13:00' },
    articleLateCheckinAbsentFrom: { type: String, trim: true, default: '15:00' },
    fulltimeAutoHalfDayHours: { type: Number, required: true, min: 0, max: 24 },
    fulltimeAutoHalfDayEnabled: { type: Boolean, default: true },
    fulltimeCapAtSchedule: { type: Boolean, default: true },
    fulltimeAlsoAfterCheckin: { type: Boolean, default: false },
    fulltimeAutoHalfDayFrom: { type: String, trim: true, default: '13:00' },
    articleAutoHalfDayFrom: { type: String, required: true, trim: true },
    articleAutoHalfDayByTime: { type: Boolean, default: true },
    articleAutoHalfDayBelowHours: { type: Number, required: true, min: 0, max: 24 },
    articleAutoHalfDayByHours: { type: Boolean, default: true },
    singlePunchIsHalfDay: { type: Boolean, default: true },
    internUsesArticleRules: { type: Boolean, default: false },
    skipScheduledHalfDay: { type: Boolean, required: true },
    updatedBy: { type: String, lowercase: true, trim: true },
  },
  { timestamps: true }
);

if (mongoose.models.AttendanceCalcPolicy && !mongoose.models.AttendanceCalcPolicy.schema.path('articleExcessStyle')) {
  mongoose.deleteModel('AttendanceCalcPolicy');
}

const AttendanceCalcPolicyModel: Model<IAttendanceCalcPolicy> =
  mongoose.models.AttendanceCalcPolicy ||
  mongoose.model<IAttendanceCalcPolicy>('AttendanceCalcPolicy', AttendanceCalcPolicySchema);

export default AttendanceCalcPolicyModel;
