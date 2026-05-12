import dbConnect from '@/lib/mongodb';
import HrAllowedAdminEmail from '@/models/HrAllowedAdminEmail';
import {
  mergeBuiltinAndEnvEmails,
  normalizeHrEmail,
  isAsijaHrEmail,
} from '@/lib/hrAdminAllowlistCore';

export async function isAllowedHrAdminEmail(email: string): Promise<boolean> {
  const e = normalizeHrEmail(email);
  if (!e) return false;
  if (mergeBuiltinAndEnvEmails().includes(e)) return true;
  await dbConnect();
  const doc = await HrAllowedAdminEmail.findOne({ email: e }).lean();
  return !!doc;
}

export async function listHrAdminAllowlistDetail(): Promise<{ all: string[]; dbOnly: string[] }> {
  await dbConnect();
  const staticList = mergeBuiltinAndEnvEmails();
  const dbRows = await HrAllowedAdminEmail.find({}).sort({ email: 1 }).lean();
  const dbOnly = dbRows.map((r) => String(r.email || '').toLowerCase());
  const all = Array.from(new Set([...staticList, ...dbOnly])).sort();
  return { all, dbOnly };
}

export async function addHrAllowedAdminEmail(
  email: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const e = normalizeHrEmail(email);
  if (!e) return { ok: false, error: 'Email is required' };
  if (!isAsijaHrEmail(e)) {
    return { ok: false, error: 'Only @asija.in addresses can be added as HR operators' };
  }
  if (mergeBuiltinAndEnvEmails().includes(e)) {
    return { ok: false, error: 'This email is already on the built-in or environment allowlist' };
  }
  await dbConnect();
  try {
    await HrAllowedAdminEmail.create({ email: e });
    return { ok: true };
  } catch (err: unknown) {
    const code = err && typeof err === 'object' && 'code' in err ? (err as { code?: number }).code : undefined;
    if (code === 11000) return { ok: false, error: 'This email is already allowed' };
    throw err;
  }
}

export async function removeHrAllowedAdminEmail(
  email: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const e = normalizeHrEmail(email);
  if (!e) return { ok: false, error: 'Email is required' };
  if (mergeBuiltinAndEnvEmails().includes(e)) {
    return { ok: false, error: 'Cannot remove built-in or environment-listed addresses' };
  }
  await dbConnect();
  const res = await HrAllowedAdminEmail.deleteOne({ email: e });
  if (res.deletedCount === 0) return { ok: false, error: 'Email was not in the database allowlist' };
  return { ok: true };
}
