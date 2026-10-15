import { AsyncLocalStorage } from 'async_hooks';
import { cookies, headers } from 'next/headers';
import mongoose from 'mongoose';
import HrAuthSession from '@/models/HrAuthSession';
import { HR_AUTH_COOKIE_NAME } from '@/lib/hrAuthCookieConstants';
import { loadHrConsolePermissionDoc } from '@/lib/hrConsolePermissionDb';
import { assertHrSection, effectiveFromDoc } from '@/lib/hrConsolePermissionUtils';
import { CATALOG_DB } from '@/lib/backup';
import { BACKUP_PREVIEW_HEADER, PREVIEW_DB_NAME } from '@/lib/backupPreviewHeader';

/** Auth and access stay on the live database so a copy cannot change who is signed in. */
const LIVE_ONLY_MODELS = new Set([
  'HrAuthSession',
  'EmployeeAuthSession',
  'HrOtpPending',
  'EmployeeOtpPending',
  'HrPasswordChangePending',
  'HrConsolePermission',
  'HrAllowedAdminEmail',
  'HrConsoleSettings',
]);

const READ_OPS = new Set([
  'find',
  'findOne',
  'count',
  'countDocuments',
  'estimatedDocumentCount',
  'distinct',
]);

const authCheck = new AsyncLocalStorage<boolean>();
const decisionCache = new Map<string, { ok: boolean; reason: string; expires: number }>();

let patched = false;

function previewModel(dbName: string, model: mongoose.Model<unknown>) {
  const conn = mongoose.connection.useDb(dbName, { useCache: true });
  const existing = conn.models[model.modelName];
  if (existing) return existing;
  return conn.model(model.modelName, model.schema, model.collection.collectionName);
}

async function authorizedPreviewDb(): Promise<string | null> {
  if (authCheck.getStore()) return null;
  let requested = '';
  try {
    requested = (await headers()).get(BACKUP_PREVIEW_HEADER)?.trim() || '';
  } catch {
    return null;
  }
  if (!requested) return null;
  if (!PREVIEW_DB_NAME.test(requested)) {
    throw new Error('Unknown backup');
  }

  const headerStore = await headers();
  const cookieStore = await cookies();
  const bearer = headerStore.get('authorization') || headerStore.get('Authorization') || '';
  const token = bearer.toLowerCase().startsWith('bearer ')
    ? bearer.slice(7).trim()
    : cookieStore.get(HR_AUTH_COOKIE_NAME)?.value?.trim() || '';
  if (!token) throw new Error('Sign in to view a backup');

  const cacheKey = `${token}|${requested}`;
  const cached = decisionCache.get(cacheKey);
  if (cached && cached.expires > Date.now()) {
    if (!cached.ok) throw new Error(cached.reason);
    return requested;
  }

  let ok = false;
  let reason = 'Not allowed to view backups';
  await authCheck.run(true, async () => {
    const session = await HrAuthSession.findOne({ token, expiresAt: { $gt: new Date() } }).select('email').lean();
    const email = session?.email ? String(session.email).trim().toLowerCase() : '';
    if (!email) {
      reason = 'Sign in to view a backup';
      return;
    }
    const permDoc = await loadHrConsolePermissionDoc(email);
    const effective = effectiveFromDoc(email, permDoc);
    if (assertHrSection(effective, 'backup', 'view')) return;
    const snapshot = await mongoose.connection.getClient().db(CATALOG_DB).collection('snapshots').findOne({ dbName: requested });
    if (!snapshot || snapshot.status !== 'verified') {
      reason = 'That backup is not verified';
      return;
    }
    ok = true;
  });

  decisionCache.set(cacheKey, { ok, reason, expires: Date.now() + 30_000 });
  if (!ok) throw new Error(reason);
  return requested;
}

function installBackupPreviewPatch() {
  if (patched) return;
  patched = true;

  const queryProto = mongoose.Query.prototype as unknown as {
    exec: (...args: unknown[]) => Promise<unknown>;
    op?: string;
    model?: mongoose.Model<unknown>;
    mongooseCollection?: unknown;
  };
  const originalExec = queryProto.exec;
  queryProto.exec = async function exec(this: typeof queryProto, ...args: unknown[]) {
    if (this.model && !LIVE_ONLY_MODELS.has(this.model.modelName)) {
      const dbName = await authorizedPreviewDb();
      if (dbName) {
        if (this.op && !READ_OPS.has(this.op)) throw new Error('Backup preview is read-only');
        if (this.op && READ_OPS.has(this.op)) {
          this.mongooseCollection = previewModel(dbName, this.model).collection;
        }
      }
    }
    return originalExec.apply(this, args);
  };

  const aggregateProto = mongoose.Aggregate.prototype as unknown as {
    exec: (...args: unknown[]) => Promise<unknown>;
    _model?: mongoose.Model<unknown>;
    _pipeline?: Array<Record<string, unknown>>;
  };
  const originalAggregateExec = aggregateProto.exec;
  aggregateProto.exec = async function exec(this: typeof aggregateProto, ...args: unknown[]) {
    if (this._model && !LIVE_ONLY_MODELS.has(this._model.modelName)) {
      const dbName = await authorizedPreviewDb();
      if (dbName) {
        const pipeline = this._pipeline || [];
        if (pipeline.some((stage) => stage.$out || stage.$merge)) {
          throw new Error('Backup preview is read-only');
        }
        this._model = previewModel(dbName, this._model);
      }
    }
    return originalAggregateExec.apply(this, args);
  };

  const modelProto = mongoose.Model.prototype as unknown as {
    save: (...args: unknown[]) => Promise<unknown>;
  };
  const originalSave = modelProto.save;
  modelProto.save = async function save(this: { constructor: { modelName?: string } }, ...args: unknown[]) {
    if (!LIVE_ONLY_MODELS.has(this.constructor?.modelName || '')) {
      const dbName = await authorizedPreviewDb();
      if (dbName) return this;
    }
    return originalSave.apply(this, args);
  };
}

installBackupPreviewPatch();
