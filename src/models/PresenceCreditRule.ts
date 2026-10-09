import mongoose, { Schema, Document, Model } from 'mongoose';
import type { PresenceCreditKind, PresenceCreditScope } from '@/lib/presenceCredit';

export interface IPresenceCreditRule extends Document {
  kind: PresenceCreditKind;
  scope: PresenceCreditScope;
  credit: number;
  effectiveFrom: string;
  team?: string;
  userIds?: string[];
  updatedBy?: string;
  createdAt: Date;
  updatedAt: Date;
}

const PresenceCreditRuleSchema = new Schema(
  {
    kind: { type: String, enum: ['wfh', 'osp'], required: true },
    scope: {
      type: String,
      enum: ['everyone', 'articles', 'staff', 'team', 'people'],
      required: true,
    },
    credit: { type: Number, required: true, min: 0, max: 1.2 },
    effectiveFrom: { type: String, required: true, trim: true },
    team: { type: String, trim: true, default: '' },
    userIds: { type: [String], default: [] },
    updatedBy: { type: String, lowercase: true, trim: true },
  },
  { timestamps: true }
);

PresenceCreditRuleSchema.index({ kind: 1, effectiveFrom: 1 });

const PresenceCreditRule: Model<IPresenceCreditRule> =
  mongoose.models.PresenceCreditRule ||
  mongoose.model<IPresenceCreditRule>('PresenceCreditRule', PresenceCreditRuleSchema);

export default PresenceCreditRule;
