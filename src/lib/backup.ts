import mongoose from 'mongoose';
import fs from 'fs';
import path from 'path';
import { promisify } from 'util';

export interface BackupOptions {
  includeCollections?: string[];
  excludeCollections?: string[];
  outputPath?: string;
  compress?: boolean;
}

export interface BackupResult {
  success: boolean;
  filePath?: string;
  fileSize?: number;
  collections: string[];
  timestamp: Date;
  error?: string;
}

export interface RestoreResult {
  success: boolean;
  collections: string[];
  documents: number;
  error?: string;
}

/**
 * Create a backup of MongoDB collections
 */
export async function createDatabaseBackup(options: BackupOptions = {}): Promise<BackupResult> {
  try {
    const {
      includeCollections = [],
      excludeCollections = [],
      outputPath = './backups',
      compress = true
    } = options;

    // Ensure backup directory exists
    if (!fs.existsSync(outputPath)) {
      fs.mkdirSync(outputPath, { recursive: true });
    }

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
    const filePath = path.join(outputPath, fileName);

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

    // Write backup file
    const jsonData = JSON.stringify(backupData, null, 2);
    fs.writeFileSync(filePath, jsonData);

    const stats = fs.statSync(filePath);

    return {
      success: true,
      filePath,
      fileSize: stats.size,
      collections: collectionsToBackup,
      timestamp
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
 * Restore database from backup file
 */
export async function restoreDatabaseFromBackup(filePath: string): Promise<RestoreResult> {
  try {
    if (!fs.existsSync(filePath)) {
      throw new Error('Backup file not found');
    }

    const backupData = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
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
 * List available backup files
 */
export function listBackupFiles(backupPath: string = './backups'): Array<{
  fileName: string;
  filePath: string;
  size: number;
  created: Date;
  collections?: string[];
}> {
  try {
    if (!fs.existsSync(backupPath)) {
      return [];
    }

    const files = fs.readdirSync(backupPath)
      .filter(file => file.startsWith('backup_') && file.endsWith('.json'))
      .map(file => {
        const filePath = path.join(backupPath, file);
        const stats = fs.statSync(filePath);

        let collections: string[] = [];
        try {
          const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
          collections = data.metadata?.collections || [];
        } catch (e) {
          // Ignore parsing errors
        }

        return {
          fileName: file,
          filePath,
          size: stats.size,
          created: stats.mtime,
          collections
        };
      })
      .sort((a, b) => b.created.getTime() - a.created.getTime()); // Most recent first

    return files;
  } catch (error) {
    console.error('Error listing backup files:', error);
    return [];
  }
}

/**
 * Delete old backup files (keep only the most recent N backups)
 */
export function cleanupOldBackups(backupPath: string = './backups', keepCount: number = 10): number {
  try {
    const files = listBackupFiles(backupPath);

    if (files.length <= keepCount) {
      return 0;
    }

    const filesToDelete = files.slice(keepCount);
    let deletedCount = 0;

    for (const file of filesToDelete) {
      fs.unlinkSync(file.filePath);
      deletedCount++;
    }

    return deletedCount;
  } catch (error) {
    console.error('Error cleaning up old backups:', error);
    return 0;
  }
}

/**
 * Get backup statistics
 */
export function getBackupStats(backupPath: string = './backups') {
  const files = listBackupFiles(backupPath);

  return {
    totalBackups: files.length,
    totalSize: files.reduce((sum, file) => sum + file.size, 0),
    oldestBackup: files.length > 0 ? files[files.length - 1].created : null,
    newestBackup: files.length > 0 ? files[0].created : null,
    collections: [...new Set(files.flatMap(f => f.collections || []))]
  };
}