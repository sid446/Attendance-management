import AttendanceCalcPolicyModel, { type IAttendanceCalcPolicy } from '@/models/AttendanceCalcPolicy';
import {
  policyValues,
  setRuntimeAttendanceCalcPolicies,
  type AttendanceCalcPolicy,
  type AttendanceCalcPolicyVersion,
} from '@/lib/attendanceCalcPolicy';

export function attendanceCalcPolicyToVersion(
  doc: IAttendanceCalcPolicy | Record<string, unknown>
): AttendanceCalcPolicyVersion {
  const row = doc as AttendanceCalcPolicy & {
    _id?: unknown;
    effectiveFrom?: string;
    updatedBy?: string;
    createdAt?: Date | string;
  };
  const created =
    row.createdAt instanceof Date
      ? row.createdAt.toISOString()
      : row.createdAt
        ? String(row.createdAt)
        : undefined;
  return {
    ...policyValues(row as AttendanceCalcPolicy),
    _id: row._id != null ? String(row._id) : undefined,
    effectiveFrom: String(row.effectiveFrom || ''),
    updatedBy: row.updatedBy ? String(row.updatedBy) : undefined,
    createdAt: created,
  };
}

export async function loadAttendanceCalcPolicies(): Promise<AttendanceCalcPolicyVersion[]> {
  const docs = await AttendanceCalcPolicyModel.find({}).sort({ effectiveFrom: -1, createdAt: -1 }).lean();
  const versions = docs.map((doc) => attendanceCalcPolicyToVersion(doc as IAttendanceCalcPolicy));
  setRuntimeAttendanceCalcPolicies(versions);
  return versions;
}

export async function createAttendanceCalcPolicy(
  policy: AttendanceCalcPolicy,
  effectiveFrom: string,
  updatedBy?: string
): Promise<AttendanceCalcPolicyVersion> {
  const doc = await AttendanceCalcPolicyModel.create({
    ...policy,
    effectiveFrom,
    updatedBy: updatedBy || undefined,
  });
  return attendanceCalcPolicyToVersion(doc);
}

export async function deleteAttendanceCalcPolicy(id: string): Promise<boolean> {
  if (!id) return false;
  const result = await AttendanceCalcPolicyModel.findByIdAndDelete(id);
  return !!result;
}
