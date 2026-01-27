# Database Backup & Restore Guide

This guide explains how to backup and restore your attendance application data using the built-in backup system.

## Overview

The backup system provides:
- **Full database backups** of all MongoDB collections
- **Manual backup creation** via UI or API
- **Automated backup scripts** for scheduled backups
- **Restore functionality** to recover data from backups
- **Backup management** with cleanup of old files

## Data Collections Backed Up

The following collections are included in backups:
- `users` - Employee/user data
- `attendances` - Attendance records
- `attendancerequests` - Attendance requests
- `employeehistories` - Employee change history
- `holidays` - Holiday configurations
- `machineformats` - Machine format settings
- `predefinedvalues` - Predefined dropdown values

## Manual Backup (via UI)

1. **Access Backup Management**:
   - Navigate to the admin section of your application
   - Look for the "Database Backup & Restore" section

2. **Create Backup**:
   - Click "Create New Backup" button
   - Wait for the backup process to complete
   - The backup file will be saved to `./backups/` directory

3. **View Available Backups**:
   - See all available backup files with creation dates and sizes
   - View which collections are included in each backup

## Manual Backup (via Command Line)

```bash
# Create a backup
npm run backup

# Or directly
npx tsx scripts/backup-database.ts
```

## Restore from Backup

⚠️ **WARNING**: Restoring from a backup will **overwrite** all current data!

### Via UI:
1. Go to Backup Management section
2. Find the backup file you want to restore from
3. Click "Restore" button
4. Confirm the restoration when prompted

### Via API:
```bash
curl -X POST http://localhost:3000/api/backup/restore \
  -H "Content-Type: application/json" \
  -d '{"fileName": "backup_2024-01-27T10-30-00-000Z.json"}'
```

## Automated Backups

### Using Cron (Linux/Mac):
```bash
# Add to crontab for daily backups at 2 AM
0 2 * * * cd /path/to/your/app && npm run backup
```

### Using Task Scheduler (Windows):
1. Open Task Scheduler
2. Create new task
3. Set trigger to daily at desired time
4. Set action to run: `cmd.exe`
5. Arguments: `/c cd /d "C:\path\to\your\app" && npm run backup`

## Backup File Structure

Backup files are stored as JSON in the `./backups/` directory with naming:
```
backup_2024-01-27T10-30-00-000Z.json
```

Each backup contains:
```json
{
  "metadata": {
    "timestamp": "2024-01-27T10:30:00.000Z",
    "collections": ["users", "attendances", ...],
    "mongooseVersion": "9.1.2",
    "nodeVersion": "v20.x.x"
  },
  "data": {
    "users": [...],
    "attendances": [...],
    ...
  }
}
```

## Backup Storage Recommendations

### Local Storage:
- Store backups on a separate disk/partition
- Use external drives for additional safety
- Consider cloud storage for offsite backups

### Cloud Storage Options:
- **AWS S3**: Reliable, scalable storage
- **Google Cloud Storage**: Good integration options
- **Azure Blob Storage**: If using Azure infrastructure
- **Dropbox/Google Drive**: Simple personal backups

### Backup Rotation:
- Keep daily backups for 7 days
- Keep weekly backups for 4 weeks
- Keep monthly backups for 12 months
- Keep yearly backups indefinitely

## Emergency Recovery

If you need to recover from a complete data loss:

1. **Stop the application** to prevent new data writes
2. **Identify the backup** you want to restore from
3. **Restore the backup** using the UI or API
4. **Verify data integrity** after restoration
5. **Restart the application**

## API Endpoints

### List Backups
```
GET /api/backup?action=list
```

### Get Backup Statistics
```
GET /api/backup?action=stats
```

### Create Backup
```
POST /api/backup
Content-Type: application/json

{
  "includeCollections": ["users", "attendances"], // optional
  "excludeCollections": [], // optional
  "compress": true // optional
}
```

### Restore Backup
```
POST /api/backup/restore
Content-Type: application/json

{
  "fileName": "backup_2024-01-27T10-30-00-000Z.json"
}
```

## Security Considerations

- **Access Control**: Limit backup/restore operations to admin users only
- **Encryption**: Consider encrypting backup files for sensitive data
- **Network Security**: Use HTTPS for backup operations in production
- **File Permissions**: Restrict access to backup files on the server

## Troubleshooting

### Backup Creation Fails:
- Check database connectivity
- Ensure write permissions to `./backups/` directory
- Check available disk space

### Restore Fails:
- Verify backup file exists and is valid JSON
- Check database write permissions
- Ensure application has database connection

### Large Backups:
- Consider excluding non-critical collections
- Use compression options
- Split large backups into smaller chunks

## Monitoring

Monitor your backups by:
- Checking backup creation logs
- Verifying backup file sizes are reasonable
- Testing restore operations periodically
- Setting up alerts for backup failures

## Support

If you encounter issues with the backup system:
1. Check the application logs for error messages
2. Verify database connectivity
3. Ensure proper file permissions
4. Test with a small subset of data first