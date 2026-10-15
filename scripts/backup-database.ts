#!/usr/bin/env tsx

import mongoose from 'mongoose';
import dbConnect from '../src/lib/mongodb';
import { cleanupExpiredCopies, createSnapshot } from '../src/lib/backup';

async function runAutomatedBackup() {
  console.log('Starting database copy...');

  try {
    await dbConnect();
    const result = await createSnapshot({ kind: 'daily', actor: 'script' });

    if (!result.success || !result.snapshot) {
      console.error('Backup failed:', result.error);
      process.exitCode = 1;
      return;
    }

    console.log('Backup verified.');
    console.log(`Database: ${result.snapshot.dbName}`);
    console.log(`Label: ${result.snapshot.label}`);
    console.log(`Documents: ${result.snapshot.totalDocuments}`);
    console.log(`Collections: ${result.snapshot.collections.length}`);
    if ((result.removed || 0) > 0) {
      console.log(`Removed ${result.removed} copy database(s) beyond the last 7`);
    }

    const removed = await cleanupExpiredCopies();
    if (removed > 0 && removed !== result.removed) {
      console.log(`Removed ${removed} expired copy database(s)`);
    }
  } catch (error) {
    console.error('Automated backup error:', error);
    process.exitCode = 1;
  } finally {
    await mongoose.connection.close().catch(() => undefined);
  }
}

if (require.main === module) {
  runAutomatedBackup();
}

export { runAutomatedBackup };
