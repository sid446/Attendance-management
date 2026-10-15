import { createHash } from 'crypto';
import { EJSON } from 'bson';
import mongoose from 'mongoose';
import type { Db, Document, IndexDescriptionInfo } from 'mongodb';

/** Catalog of copies. Never restored over, and never used as the live database. */
export const CATALOG_DB = 'asija_backup_catalog';
/** Newest verified daily copies to keep. Age does not delete them. */
const KEEP_DAILY_COPIES = 7;
/** Newest safety copies taken just before a restore. */
const KEEP_PRERESTORE_COPIES = 2;
const LOCK_STALE_MS = 20 * 60 * 1000;
const DAILY_DB_NAME = /^asija_copy_\d{8}$/;
const PRERESTORE_DB_NAME = /^asija_prerestore_\d{8}T\d{6}$/;

/** Login sessions and one-time codes are recreated on next login. The old JSON blob collection is not business data. */
const EXCLUDED_COLLECTIONS = new Set([
  'backups',
  'hrauthsessions',
  'employeeauthsessions',
  'hrotppendings',
  'employeeotppendings',
  'hrpasswordchangependings',
]);

export type SnapshotKind = 'daily' | 'prerestore';
export type SnapshotStatus = 'copying' | 'verified' | 'failed';

export interface CollectionCopyResult {
  name: string;
  sourceCount: number;
  targetCount: number;
  match: boolean;
  error?: string;
}

export interface SnapshotRecord {
  dbName: string;
  kind: SnapshotKind;
  label: string;
  status: SnapshotStatus;
  createdAt: string;
  finishedAt?: string;
  sizeBytes: number;
  totalDocuments: number;
  collections: CollectionCopyResult[];
  error?: string;
  actor?: string;
  mainDbName: string;
}

export interface SnapshotResult {
  success: boolean;
  snapshot?: SnapshotRecord;
  removed?: number;
  error?: string;
}

interface SnapshotStored {
  _id: string;
  dbName: string;
  kind: SnapshotKind;
  label: string;
  status: SnapshotStatus;
  createdAt: Date;
  finishedAt?: Date;
  sizeBytes: number;
  totalDocuments: number;
  collections: CollectionCopyResult[];
  error?: string;
  actor?: string;
  mainDbName: string;
}

function mongoClient() {
  const client = mongoose.connection.getClient();
  if (!client) throw new Error('Database connection not available');
  return client;
}

function liveDb(): Db {
  const db = mongoose.connection.db;
  if (!db) throw new Error('Database connection not available');
  return db;
}

function catalogCollection() {
  return mongoClient().db(CATALOG_DB).collection<SnapshotStored>('snapshots');
}

function istParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value || '';
  return {
    year: get('year'),
    month: get('month'),
    day: get('day'),
    hour: get('hour'),
    minute: get('minute'),
    second: get('second'),
  };
}

export function dailyLabel(date = new Date()): string {
  const parts = istParts(date);
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function dailyDbName(date = new Date()): string {
  const parts = istParts(date);
  return `asija_copy_${parts.year}${parts.month}${parts.day}`;
}

function prerestoreIdentity(date = new Date()): { dbName: string; label: string } {
  const parts = istParts(date);
  const dbName = `asija_prerestore_${parts.year}${parts.month}${parts.day}T${parts.hour}${parts.minute}${parts.second}`;
  const label = `pre-restore ${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}:${parts.second}`;
  return { dbName, label };
}

function assertLiveDbIsNotACopy(mainName: string) {
  if (mainName === CATALOG_DB || DAILY_DB_NAME.test(mainName) || PRERESTORE_DB_NAME.test(mainName)) {
    throw new Error(`Refusing to use "${mainName}" as the live database`);
  }
}

function assertDroppableCopy(name: string, mainName: string) {
  if (!name || name === mainName || name === CATALOG_DB) {
    throw new Error(`Refusing to drop database "${name}"`);
  }
  if (!DAILY_DB_NAME.test(name) && !PRERESTORE_DB_NAME.test(name)) {
    throw new Error(`Refusing to drop database "${name}"`);
  }
}

function isScratchCollection(name: string): boolean {
  return name.includes('__incoming') || name.includes('__previous') || name.includes('__failed_incoming');
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === 'object') {
    const source = value as Record<string, unknown>;
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(source).sort()) {
      sorted[key] = sortKeys(source[key]);
    }
    return sorted;
  }
  return value;
}

/** Same bytes even if field order differs. BSON types stay distinct from strings. */
function stableDoc(value: unknown): string {
  const plain = EJSON.parse(EJSON.stringify(value, { relaxed: false }));
  return JSON.stringify(sortKeys(plain));
}

async function collectionDigest(db: Db, name: string): Promise<string> {
  const hash = createHash('sha256');
  const cursor = db.collection(name).find({}).sort({ _id: 1 });
  for await (const doc of cursor) {
    hash.update(stableDoc(doc));
    hash.update('\n');
  }
  return hash.digest('hex');
}

async function collectionExists(db: Db, name: string): Promise<boolean> {
  const found = await db.listCollections({ name }, { nameOnly: true }).toArray();
  return found.length > 0;
}

async function dropIfExists(db: Db, name: string) {
  if (await collectionExists(db, name)) {
    await db.collection(name).drop();
  }
}

async function listBusinessCollections(db: Db): Promise<string[]> {
  const listed = await db.listCollections().toArray();
  return listed
    .filter((entry) => entry.type !== 'view')
    .map((entry) => entry.name)
    .filter((name) => !name.startsWith('system.'))
    .filter((name) => !EXCLUDED_COLLECTIONS.has(name))
    .filter((name) => !isScratchCollection(name))
    .sort();
}

function indexOptions(index: IndexDescriptionInfo): Document {
  const options: Document = { name: index.name };
  const fields = [
    'unique',
    'sparse',
    'expireAfterSeconds',
    'partialFilterExpression',
    'collation',
    'weights',
    'default_language',
    'language_override',
    'hidden',
    'wildcardProjection',
  ] as const;
  for (const field of fields) {
    const value = index[field as keyof IndexDescriptionInfo];
    if (value !== undefined) options[field] = value;
  }
  return options;
}

async function copyIndexes(sourceDb: Db, sourceName: string, targetDb: Db, targetName: string) {
  const indexes = await sourceDb.collection(sourceName).indexes();
  for (const index of indexes) {
    if (!index.name || index.name === '_id_' || !index.key) continue;
    await targetDb.collection(targetName).createIndex(index.key, indexOptions(index));
  }
}

async function copyByBatches(sourceDb: Db, sourceName: string, targetDb: Db, targetName: string) {
  await dropIfExists(targetDb, targetName);
  await targetDb.createCollection(targetName);
  const batch: Document[] = [];
  const cursor = sourceDb.collection(sourceName).find({});
  for await (const doc of cursor) {
    batch.push(doc);
    if (batch.length >= 100) {
      await targetDb.collection(targetName).insertMany(batch, { ordered: true });
      batch.length = 0;
    }
  }
  if (batch.length > 0) {
    await targetDb.collection(targetName).insertMany(batch, { ordered: true });
  }
}

/**
 * Copy one collection without changing the source.
 * Documents are inserted as-is, one record at a time in batches, so a backup
 * cannot hit MongoDB's 16MB single-document limit and field types stay intact.
 */
async function copyCollection(
  sourceDb: Db,
  sourceName: string,
  targetDb: Db,
  targetName: string
): Promise<CollectionCopyResult> {
  const sourceCount = await sourceDb.collection(sourceName).countDocuments();
  try {
    await copyByBatches(sourceDb, sourceName, targetDb, targetName);
    await copyIndexes(sourceDb, sourceName, targetDb, targetName);
    const targetCount = await targetDb.collection(targetName).countDocuments();
    if (sourceCount !== targetCount) {
      return {
        name: sourceName,
        sourceCount,
        targetCount,
        match: false,
        error: `${sourceName} count ${sourceCount} on live, ${targetCount} on copy`,
      };
    }

    const sourceDigest = await collectionDigest(sourceDb, sourceName);
    const targetDigest = await collectionDigest(targetDb, targetName);
    if (sourceDigest !== targetDigest) {
      return {
        name: sourceName,
        sourceCount,
        targetCount,
        match: false,
        error: `${sourceName} documents do not match after copy`,
      };
    }

    return { name: sourceName, sourceCount, targetCount, match: true };
  } catch (error) {
    const targetCount = (await collectionExists(targetDb, targetName))
      ? await targetDb.collection(targetName).countDocuments()
      : 0;
    return {
      name: sourceName,
      sourceCount,
      targetCount,
      match: false,
      error: error instanceof Error ? error.message : 'Copy failed',
    };
  }
}

async function databaseSize(db: Db): Promise<number> {
  try {
    const stats = await db.command({ dbStats: 1, scale: 1 });
    return Number(stats.dataSize || stats.storageSize || 0);
  } catch {
    return 0;
  }
}

function toRecord(doc: SnapshotStored): SnapshotRecord {
  return {
    dbName: doc.dbName,
    kind: doc.kind,
    label: doc.label,
    status: doc.status,
    createdAt: new Date(doc.createdAt).toISOString(),
    finishedAt: doc.finishedAt ? new Date(doc.finishedAt).toISOString() : undefined,
    sizeBytes: doc.sizeBytes || 0,
    totalDocuments: doc.totalDocuments || 0,
    collections: doc.collections || [],
    error: doc.error,
    actor: doc.actor,
    mainDbName: doc.mainDbName,
  };
}

async function lockCollection() {
  const locks = mongoClient().db(CATALOG_DB).collection<{ name: string; held: boolean; startedAt: Date }>('locks');
  await locks.createIndex({ name: 1 }, { unique: true });
  return locks;
}

async function acquireCopyLock(): Promise<boolean> {
  const locks = await lockCollection();
  try {
    await locks.insertOne({ name: 'copy', held: true, startedAt: new Date() });
    return true;
  } catch (error) {
    const code = (error as { code?: number }).code;
    if (code !== 11000) throw error;
    const existing = await locks.findOne({ name: 'copy' });
    const startedAt = existing?.startedAt ? new Date(existing.startedAt).getTime() : 0;
    if (!startedAt || Date.now() - startedAt < LOCK_STALE_MS) return false;
    await locks.updateOne({ name: 'copy' }, { $set: { held: true, startedAt: new Date() } });
    return true;
  }
}

async function releaseCopyLock() {
  const locks = mongoClient().db(CATALOG_DB).collection<{ name: string }>('locks');
  await locks.deleteOne({ name: 'copy' });
}

async function writeSnapshot(doc: SnapshotStored) {
  await catalogCollection().replaceOne({ _id: doc._id }, doc, { upsert: true });
}

/**
 * Read the live database and write an exact copy into its own database.
 * The live database is not modified.
 */
export async function createSnapshot(options: {
  kind: SnapshotKind;
  actor?: string;
  skipLock?: boolean;
  at?: Date;
}): Promise<SnapshotResult> {
  const heldLock = options.skipLock ? false : await acquireCopyLock();
  if (!options.skipLock && !heldLock) {
    return { success: false, error: 'A backup is already running. Wait for it to finish.' };
  }

  const started = options.at || new Date();
  const main = liveDb();
  const mainDbName = main.databaseName;
  assertLiveDbIsNotACopy(mainDbName);

  const identity =
    options.kind === 'daily'
      ? { dbName: dailyDbName(started), label: dailyLabel(started) }
      : prerestoreIdentity(started);
  const targetDb = mongoClient().db(identity.dbName);

  const base: SnapshotStored = {
    _id: identity.dbName,
    dbName: identity.dbName,
    kind: options.kind,
    label: identity.label,
    status: 'copying',
    createdAt: started,
    sizeBytes: 0,
    totalDocuments: 0,
    collections: [],
    actor: options.actor,
    mainDbName,
  };

  try {
    await writeSnapshot(base);
    const names = await listBusinessCollections(main);
    const results: CollectionCopyResult[] = [];

    for (const name of names) {
      console.log(`Backup copy ${identity.dbName}: ${name}`);
      results.push(await copyCollection(main, name, targetDb, name));
    }

    const existingOnCopy = await listBusinessCollections(targetDb);
    for (const extra of existingOnCopy) {
      if (!names.includes(extra)) {
        await dropIfExists(targetDb, extra);
      }
    }

    const mismatched = results.filter((row) => !row.match);
    const finished: SnapshotStored = {
      ...base,
      status: mismatched.length === 0 ? 'verified' : 'failed',
      finishedAt: new Date(),
      sizeBytes: await databaseSize(targetDb),
      totalDocuments: results.reduce((sum, row) => sum + row.targetCount, 0),
      collections: results,
      error: mismatched.length
        ? mismatched.map((row) => row.error || row.name).join('; ')
        : undefined,
    };
    await writeSnapshot(finished);

    let removed = 0;
    if (finished.status === 'verified' && options.kind === 'daily') {
      removed = await cleanupExpiredCopies();
    }

    if (finished.status !== 'verified') {
      return { success: false, snapshot: toRecord(finished), removed, error: finished.error };
    }
    return { success: true, snapshot: toRecord(finished), removed };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Backup failed';
    await writeSnapshot({
      ...base,
      status: 'failed',
      finishedAt: new Date(),
      error: message,
    });
    return { success: false, error: message };
  } finally {
    if (heldLock) await releaseCopyLock();
  }
}

export async function listSnapshots(): Promise<SnapshotRecord[]> {
  const docs = await catalogCollection().find({}).sort({ createdAt: -1 }).toArray();
  return docs.map((doc) => toRecord(doc as SnapshotStored));
}

export async function getBackupStats() {
  const snapshots = await listSnapshots();
  const verified = snapshots.filter((snapshot) => snapshot.status === 'verified');
  const newest = snapshots[0];
  const oldestVerified = verified[verified.length - 1];
  return {
    totalBackups: snapshots.length,
    verifiedBackups: verified.length,
    totalSize: snapshots.reduce((sum, snapshot) => sum + (snapshot.sizeBytes || 0), 0),
    oldestBackup: oldestVerified?.createdAt || null,
    newestBackup: newest?.createdAt || null,
    keepCopies: KEEP_DAILY_COPIES,
    collections: newest?.collections.map((row) => row.name) || [],
  };
}

function snapshotName(doc: { dbName?: string; _id?: string }): string {
  return String(doc.dbName || doc._id || '');
}

/**
 * Keep the newest verified copies by count.
 * If nobody makes a new backup, the existing ones stay.
 * A successful new copy removes the oldest only after the limit is passed.
 */
export async function cleanupExpiredCopies(): Promise<number> {
  const mainName = liveDb().databaseName;
  assertLiveDbIsNotACopy(mainName);
  const docs = await catalogCollection().find({}).sort({ createdAt: -1 }).toArray();

  const keep = new Set<string>();
  for (const doc of docs.filter((row) => row.kind === 'daily' && row.status === 'verified').slice(0, KEEP_DAILY_COPIES)) {
    keep.add(snapshotName(doc));
  }
  for (const doc of docs.filter((row) => row.kind === 'prerestore' && row.status === 'verified').slice(0, KEEP_PRERESTORE_COPIES)) {
    keep.add(snapshotName(doc));
  }
  const newestUnverified = snapshotName(docs.find((row) => row.status !== 'verified') || {});

  let removed = 0;
  for (const doc of docs) {
    const name = snapshotName(doc);
    if (!name || keep.has(name) || name === mainName || name === CATALOG_DB) continue;
    if (!DAILY_DB_NAME.test(name) && !PRERESTORE_DB_NAME.test(name)) continue;
    await mongoClient().db(name).dropDatabase();
    if (name === newestUnverified) continue;
    await catalogCollection().deleteOne({ _id: name });
    removed += 1;
  }

  return removed;
}

export async function compareSnapshot(dbName: string) {
  const stored = await catalogCollection().findOne({ _id: dbName });
  if (!stored) throw new Error('Backup not found');
  const main = liveDb();
  const copyDb = mongoClient().db(dbName);
  const mainNames = await listBusinessCollections(main);
  const copyNames = await listBusinessCollections(copyDb);
  const names = [...new Set([...mainNames, ...copyNames])].sort();

  const rows = [];
  for (const name of names) {
    const mainCount = mainNames.includes(name) ? await main.collection(name).countDocuments() : 0;
    const copyCount = copyNames.includes(name) ? await copyDb.collection(name).countDocuments() : 0;
    let state: 'match' | 'mismatch' | 'added-after-copy' | 'missing-on-live' = 'match';
    if (!copyNames.includes(name)) state = 'added-after-copy';
    else if (!mainNames.includes(name)) state = 'missing-on-live';
    else if (mainCount !== copyCount) state = 'mismatch';
    rows.push({ name, mainCount, copyCount, state });
  }

  return {
    dbName,
    label: stored.label,
    status: stored.status,
    kind: stored.kind,
    rows,
    excluded: [...EXCLUDED_COLLECTIONS],
  };
}

const REDACT_KEY = /password|passwd|secret|^otp$|token|hash/i;

function toPlain(value: unknown): unknown {
  if (value == null) return value;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'object' && value && (value as { _bsontype?: string })._bsontype === 'ObjectId') {
    return String(value);
  }
  if (typeof value === 'object' && value && (value as { _bsontype?: string })._bsontype) {
    return EJSON.parse(EJSON.stringify(value, { relaxed: true }));
  }
  if (Array.isArray(value)) return value.map(toPlain);
  if (typeof value === 'object') {
    const source = value as Record<string, unknown>;
    const plain: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(source)) {
      if (key === '__v') continue;
      plain[key] = REDACT_KEY.test(key) ? '[redacted]' : toPlain(child);
    }
    return plain;
  }
  return value;
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export async function inspectSnapshot(options: {
  dbName: string;
  collection: string;
  query: string;
  monthYear?: string;
}) {
  const stored = await catalogCollection().findOne({ _id: options.dbName });
  if (!stored) throw new Error('Backup not found');
  const collectionName = options.collection.trim();
  if (!collectionName || EXCLUDED_COLLECTIONS.has(collectionName) || isScratchCollection(collectionName)) {
    throw new Error('That collection cannot be inspected');
  }

  const query = options.query.trim();
  if (!query) throw new Error('Enter an employee email, code, or id');

  const main = liveDb();
  const copyDb = mongoClient().db(options.dbName);
  const monthYear = (options.monthYear || '').trim();

  if (collectionName === 'users') {
    const or: Document[] = [
      { email: new RegExp(`^${escapeRegex(query)}$`, 'i') },
      { odId: query },
      { employeeCode: query },
      { name: new RegExp(escapeRegex(query), 'i') },
    ];
    if (mongoose.Types.ObjectId.isValid(query)) {
      or.push({ _id: new mongoose.Types.ObjectId(query) });
    }
    const found = await main
      .collection('users')
      .find({ $or: or })
      .limit(8)
      .project({ name: 1, email: 1, odId: 1, employeeCode: 1 })
      .toArray();
    if (found.length === 0) {
      return { found: false, matches: [], equal: null, main: null, copy: null };
    }
    if (found.length > 1) {
      return {
        found: true,
        matches: found.map((user) => ({
          _id: String(user._id),
          label: [user.name, user.email, user.odId || user.employeeCode].filter(Boolean).join(' · '),
        })),
        equal: null,
        main: null,
        copy: null,
      };
    }
    const id = found[0]._id;
    const liveDoc = await main.collection('users').findOne({ _id: id });
    const copyDoc = await copyDb.collection('users').findOne({ _id: id });
    return {
      found: true,
      matches: [],
      equal: Boolean(liveDoc && copyDoc) && stableDoc(liveDoc) === stableDoc(copyDoc),
      main: liveDoc ? toPlain(liveDoc) : null,
      copy: copyDoc ? toPlain(copyDoc) : null,
    };
  }

  let filter: Document;
  if (collectionName === 'attendances') {
    if (!/^\d{4}-\d{2}$/.test(monthYear)) throw new Error('Enter the month as YYYY-MM for attendance');
    if (!mongoose.Types.ObjectId.isValid(query)) throw new Error('Enter the employee id for attendance');
    filter = { userId: new mongoose.Types.ObjectId(query), monthYear };
  } else if (mongoose.Types.ObjectId.isValid(query)) {
    filter = { _id: new mongoose.Types.ObjectId(query) };
  } else {
    throw new Error('Enter the document id');
  }

  const liveDoc = await main.collection(collectionName).findOne(filter);
  const copyDoc = await copyDb.collection(collectionName).findOne(filter);
  if (!liveDoc && !copyDoc) {
    return { found: false, matches: [], equal: null, main: null, copy: null };
  }
  return {
    found: true,
    matches: [],
    equal: Boolean(liveDoc && copyDoc) && stableDoc(liveDoc) === stableDoc(copyDoc),
    main: liveDoc ? toPlain(liveDoc) : null,
    copy: copyDoc ? toPlain(copyDoc) : null,
  };
}

async function swapIn(db: Db, name: string) {
  await dropIfExists(db, `${name}__previous`);
  const hadLive = await collectionExists(db, name);
  if (hadLive) {
    await db.collection(name).rename(`${name}__previous`);
  }
  try {
    await db.collection(`${name}__incoming`).rename(name);
  } catch (error) {
    if (hadLive && (await collectionExists(db, `${name}__previous`)) && !(await collectionExists(db, name))) {
      await db.collection(`${name}__previous`).rename(name);
    }
    throw error;
  }
}

async function swapBack(db: Db, name: string) {
  if (!(await collectionExists(db, `${name}__previous`))) return;
  if (await collectionExists(db, name)) {
    await dropIfExists(db, `${name}__failed_incoming`);
    await db.collection(name).rename(`${name}__failed_incoming`);
  }
  await db.collection(`${name}__previous`).rename(name);
}

export async function restoreSnapshot(options: {
  dbName: string;
  confirmText: string;
  actor?: string;
}): Promise<{ success: boolean; safetyDbName?: string; collections?: string[]; error?: string }> {
  const dbName = options.dbName.trim();
  const main = liveDb();
  const mainDbName = main.databaseName;
  assertLiveDbIsNotACopy(mainDbName);
  assertDroppableCopy(dbName, mainDbName);

  const stored = await catalogCollection().findOne({ _id: dbName });
  if (!stored) return { success: false, error: 'Backup not found' };
  if (stored.status !== 'verified') return { success: false, error: 'Only a verified backup can be restored' };
  if (options.confirmText.trim() !== stored.label) {
    return { success: false, error: `Type ${stored.label} to confirm` };
  }

  const locked = await acquireCopyLock();
  if (!locked) return { success: false, error: 'A backup is already running. Wait for it to finish.' };

  const swapped: string[] = [];
  let names: string[] = [];
  try {
    const safety = await createSnapshot({
      kind: 'prerestore',
      actor: options.actor,
      skipLock: true,
    });
    if (!safety.success || !safety.snapshot) {
      return { success: false, error: safety.error || 'Could not save a safety copy of the current data' };
    }

    const copyDb = mongoClient().db(dbName);
    names = (stored.collections || []).map((row) => row.name).filter((name) => !isScratchCollection(name));

    for (const name of names) {
      if (!(await collectionExists(copyDb, name))) {
        throw new Error(`Backup is missing ${name}`);
      }
      const copied = await copyCollection(copyDb, name, main, `${name}__incoming`);
      if (!copied.match) throw new Error(copied.error || `Could not stage ${name}`);
    }

    for (const name of names) {
      await swapIn(main, name);
      swapped.push(name);
      const liveCount = await main.collection(name).countDocuments();
      const copyCount = await copyDb.collection(name).countDocuments();
      if (liveCount !== copyCount) {
        throw new Error(`${name} count after restore was ${liveCount}, backup has ${copyCount}`);
      }
    }

    for (const name of names) {
      await dropIfExists(main, `${name}__previous`);
      await dropIfExists(main, `${name}__failed_incoming`);
    }

    return { success: true, safetyDbName: safety.snapshot.dbName, collections: names };
  } catch (error) {
    for (const name of [...swapped].reverse()) {
      try {
        await swapBack(main, name);
      } catch (rollbackError) {
        console.error(`Rollback failed for ${name}`, rollbackError);
      }
    }
    for (const name of names) {
      await dropIfExists(main, `${name}__incoming`).catch(() => undefined);
      await dropIfExists(main, `${name}__failed_incoming`).catch(() => undefined);
    }
    return { success: false, error: error instanceof Error ? error.message : 'Restore failed' };
  } finally {
    await releaseCopyLock();
  }
}
