import mongoose from 'mongoose';
import BackupModel, { IBackupDocument } from '@/models/Backup';

export interface BackupOptions {
  includeCollections?: string[];
  excludeCollections?: string[];
  compress?: boolean;
}

export interface BackupResult {
  success: boolean;
  backupId?: string;
  fileName?: string;
  collections: string[];
  timestamp: Date;
  fileSize?: number;
  error?: string;
}

export interface RestoreResult {
  success: boolean;
  collections: string[];
  documents: number;
  error?: string;
}

/**
 * Create a backup of MongoDB collections and store in database
 */
export async function createDatabaseBackup(options: BackupOptions = {}): Promise<BackupResult> {
  try {
    const {
      includeCollections = [],
      excludeCollections = [],
      compress = true
    } = options;

    // Get all collections
    const db = mongoose.connection.db;
    if (!db) {
      throw new Error('Database connection not available');
    }

    const collections = await db.listCollections().toArray();
    const collectionNames = collections.map(col => col.name);

    // Filter collections based on options
    let collectionsToBackup = collectionNames;

    if (includeCollections.length > 0) {
      collectionsToBackup = collectionNames.filter(name => includeCollections.includes(name));
    } else if (excludeCollections.length > 0) {
      collectionsToBackup = collectionNames.filter(name => !excludeCollections.includes(name));
    }

    const timestamp = new Date();
    const fileName = `backup_${timestamp.toISOString().replace(/[:.]/g, '-')}.json`;

    const backupData: any = {
      metadata: {
        timestamp: timestamp.toISOString(),
        collections: collectionsToBackup,
        mongooseVersion: mongoose.version,
        nodeVersion: process.version
      },
      data: {}
    };

    // Backup each collection
    for (const collectionName of collectionsToBackup) {
      const collection = db.collection(collectionName);
      const documents = await collection.find({}).toArray();
      backupData.data[collectionName] = documents;
    }

    // Calculate approximate file size (JSON string length)
    const jsonData = JSON.stringify(backupData);
    const fileSize = Buffer.byteLength(jsonData, 'utf8');

    // Store backup in MongoDB
    const backupDocument: Partial<IBackupDocument> = {
      fileName,
      data: backupData,
      metadata: {
        timestamp,
        collections: collectionsToBackup,
        mongooseVersion: mongoose.version,
        nodeVersion: process.version,
        fileSize
      }
    };

    const savedBackup = await BackupModel.create(backupDocument);

    return {
      success: true,
      backupId: savedBackup._id.toString(),
      fileName,
      collections: collectionsToBackup,
      timestamp,
      fileSize
    };

  } catch (error) {
    return {
      success: false,
      collections: [],
      timestamp: new Date(),
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

/**
 * Restore database from backup stored in MongoDB
 */
export async function restoreDatabaseFromBackup(backupId: string): Promise<RestoreResult> {
  try {
    // Find backup in database
    const backup = await BackupModel.findById(backupId);
    if (!backup) {
      throw new Error('Backup not found');
    }

    const backupData = backup.data;
    const db = mongoose.connection.db;
    if (!db) {
      throw new Error('Database connection not available');
    }

    let totalDocuments = 0;
    const restoredCollections: string[] = [];

    // Restore each collection
    for (const [collectionName, documents] of Object.entries(backupData.data || {})) {
      const collection = db.collection(collectionName);

      // Clear existing data
      await collection.deleteMany({});

      // Insert backup data
      if (Array.isArray(documents) && documents.length > 0) {
        await collection.insertMany(documents);
        totalDocuments += documents.length;
      }

      restoredCollections.push(collectionName);
    }

    return {
      success: true,
      collections: restoredCollections,
      documents: totalDocuments
    };

  } catch (error) {
    return {
      success: false,
      collections: [],
      documents: 0,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

/**
 * List available backup files from MongoDB
 */
export async function listBackupFiles(): Promise<Array<{
  _id: string;
  fileName: string;
  size: number;
  created: Date;
  collections: string[];
}>> {
  try {
    const backups = await BackupModel.find({})
      .select('_id fileName metadata createdAt')
      .sort({ createdAt: -1 })
      .lean();

    return backups.map(backup => ({
      _id: backup._id.toString(),
      fileName: backup.fileName,
      size: backup.metadata.fileSize,
      created: backup.createdAt,
      collections: backup.metadata.collections
    }));
  } catch (error) {
    console.error('Error listing backup files:', error);
    return [];
  }
}

/**
 * Delete old backup files (keep only the most recent N backups)
 */
export async function cleanupOldBackups(keepCount: number = 10): Promise<number> {
  try {
    const backups = await BackupModel.find({})
      .select('_id createdAt')
      .sort({ createdAt: -1 })
      .lean();

    if (backups.length <= keepCount) {
      return 0;
    }

    const backupsToDelete = backups.slice(keepCount);
    const deleteIds = backupsToDelete.map(backup => backup._id);

    const result = await BackupModel.deleteMany({ _id: { $in: deleteIds } });

    return result.deletedCount || 0;
  } catch (error) {
    console.error('Error cleaning up old backups:', error);
    return 0;
  }
}

/**
 * Get backup statistics from MongoDB
 */
export async function getBackupStats() {
  try {
    const backups = await BackupModel.find({}).select('metadata createdAt').lean();

    if (backups.length === 0) {
      return {
        totalBackups: 0,
        totalSize: 0,
        oldestBackup: null,
        newestBackup: null,
        collections: []
      };
    }

    const sortedBackups = backups.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    return {
      totalBackups: backups.length,
      totalSize: backups.reduce((sum, backup) => sum + (backup.metadata.fileSize || 0), 0),
      oldestBackup: sortedBackups[sortedBackups.length - 1].createdAt,
      newestBackup: sortedBackups[0].createdAt,
      collections: [...new Set(backups.flatMap(b => b.metadata.collections || []))]
    };
  } catch (error) {
    console.error('Error getting backup stats:', error);
    return {
      totalBackups: 0,
      totalSize: 0,
      oldestBackup: null,
      newestBackup: null,
      collections: []
    };
  }
}