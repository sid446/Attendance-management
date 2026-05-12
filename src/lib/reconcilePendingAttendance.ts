import dbConnect from '@/lib/mongodb';
import User from '@/models/User';
import PendingAttendance from '@/models/PendingAttendance';
import { normalizeForMatch } from '@/lib/attendanceNameMatch';
import type { IPendingAttendance, IPendingDayEntry } from '@/models/PendingAttendance';
import type { Types } from 'mongoose';

function getInternalBaseUrl(): string {
  const env = process.env.NEXT_PUBLIC_APP_URL || process.env.INTERNAL_API_BASE_URL;
  if (env) return env.replace(/\/$/, '');
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return 'http://127.0.0.1:3000';
}

export function entriesFromRecords(
  records: Map<string, IPendingDayEntry> | Record<string, IPendingDayEntry> | undefined
): [string, IPendingDayEntry][] {
  if (!records) return [];
  if (records instanceof Map) {
    return [...records.entries()];
  }
  return Object.entries(records as Record<string, IPendingDayEntry>);
}

export function countPendingDays(
  records: Map<string, IPendingDayEntry> | Record<string, IPendingDayEntry> | undefined
): number {
  return entriesFromRecords(records).length;
}

/** Replay all days in one pending monthly doc against bulk attendance API using the chosen employee name. */
export async function replayPendingDocumentWithUser(
  doc: IPendingAttendance,
  user: { _id: Types.ObjectId; name: string }
): Promise<{ merged: number; failed: number; errors: string[] }> {
  const base = getInternalBaseUrl();
  let merged = 0;
  let failed = 0;
  const errors: string[] = [];

  const pairs = entriesFromRecords(doc.records);
  const remaining = new Map<string, IPendingDayEntry>(pairs);

  for (const [isoDate, entry] of pairs) {
    const raw = (entry.rawRecord || {}) as Record<string, unknown>;
    const rec = {
      ...raw,
      name: user.name,
      employeeName: user.name,
    };

    try {
      const res = await fetch(`${base}/api/attendance`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ records: [rec] }),
      });
      const json = (await res.json()) as {
        success?: boolean;
        data?: { processed?: unknown[]; errors?: { odId: string; reason: string }[] };
        error?: string;
      };

      const procLen = json.data?.processed?.length ?? 0;
      const errLen = json.data?.errors?.length ?? 0;
      const ok = res.ok && json.success && procLen > 0 && errLen === 0;

      if (ok) {
        remaining.delete(isoDate);
        merged++;
      } else {
        failed++;
        const reason =
          json.data?.errors?.[0]?.reason ||
          json.error ||
          `Replay failed for ${isoDate} (processed=${procLen}, errors=${errLen})`;
        errors.push(reason);
      }
    } catch (e: unknown) {
      failed++;
      errors.push(e instanceof Error ? e.message : String(e));
    }
  }

  if (remaining.size === 0) {
    await PendingAttendance.updateOne(
      { _id: doc._id },
      {
        $set: {
          status: 'merged',
          mergedUserId: user._id,
          mergedAt: new Date(),
          records: new Map(),
        },
      }
    );
  } else {
    doc.records = remaining as unknown as typeof doc.records;
    doc.markModified('records');
    await doc.save();
  }

  return { merged, failed, errors };
}

/**
 * HR / admin: assign a pending monthly bucket to a specific user (similarity approval).
 */
export async function assignPendingAttendanceToUser(
  pendingDocId: string,
  userId: string
): Promise<{ merged: number; failed: number; errors: string[]; error?: string }> {
  await dbConnect();
  const user = await User.findById(userId).select('name');
  if (!user?.name) {
    return { merged: 0, failed: 0, errors: [], error: 'User not found' };
  }

  const doc = await PendingAttendance.findById(pendingDocId);
  if (!doc) {
    return { merged: 0, failed: 0, errors: [], error: 'Pending attendance not found' };
  }
  if (doc.status !== 'pending') {
    return { merged: 0, failed: 0, errors: [], error: 'Not pending (already merged or discarded)' };
  }

  return replayPendingDocumentWithUser(doc, user);
}

/**
 * Replays pending day rows whose normalized name matches the user's name through the bulk attendance API,
 * then marks them merged. Call after creating an employee so machine-export names that match normalize to the same key are applied.
 */
export async function reconcilePendingAttendanceForUser(userId: string): Promise<{
  merged: number;
  failed: number;
  errors: string[];
}> {
  await dbConnect();
  const user = await User.findById(userId).select('name');
  if (!user?.name) {
    return { merged: 0, failed: 0, errors: ['User not found'] };
  }

  const targetNorm = normalizeForMatch(user.name);
  const pendingDocs = await PendingAttendance.find({
    status: 'pending',
    nameNormalized: targetNorm,
  });

  if (pendingDocs.length === 0) {
    return { merged: 0, failed: 0, errors: [] };
  }

  let merged = 0;
  let failed = 0;
  const errors: string[] = [];

  for (const doc of pendingDocs) {
    const r = await replayPendingDocumentWithUser(doc, user);
    merged += r.merged;
    failed += r.failed;
    errors.push(...r.errors);
  }

  return { merged, failed, errors };
}
