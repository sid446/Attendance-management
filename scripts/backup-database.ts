#!/usr/bin/env tsx

import { createDatabaseBackup, cleanupOldBackups } from '../src/lib/backup';
import path from 'path';

async function runAutomatedBackup() {
  console.log('🚀 Starting automated database backup...');

  try {
    // Create backup
    const result = await createDatabaseBackup({
      compress: true
    });

    if (result.success) {
      console.log('✅ Backup created successfully!');
      console.log(`📁 File: ${result.filePath}`);
      console.log(`📊 Size: ${result.fileSize} bytes`);
      console.log(`🗂️ Collections: ${result.collections.join(', ')}`);
      console.log(`🕒 Timestamp: ${result.timestamp.toISOString()}`);

      // Cleanup old backups (keep only last 10)
      const deletedCount = cleanupOldBackups('./backups', 10);
      if (deletedCount > 0) {
        console.log(`🧹 Cleaned up ${deletedCount} old backup(s)`);
      }

      console.log('🎉 Automated backup completed successfully!');
    } else {
      console.error('❌ Backup failed:', result.error);
      process.exit(1);
    }

  } catch (error) {
    console.error('❌ Automated backup error:', error);
    process.exit(1);
  }
}

// Run the backup if this script is executed directly
if (require.main === module) {
  runAutomatedBackup();
}

export { runAutomatedBackup };