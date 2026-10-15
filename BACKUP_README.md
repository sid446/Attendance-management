# Database copies

Live attendance data stays in the database the app already uses. A backup reads that data and writes an exact copy into a separate database on the same cluster. It does not pack the database into one document, and it does not change live records.

The newest 7 verified copies are kept. Missing a day does not delete them. The oldest copy is removed only when an 8th verified copy succeeds. Login sessions and one-time codes are left out. A copy can be restored only when every collection’s documents match the source.

## Admin screen

Open Database Backup in the HR console.

1. **Copy today's data** writes `asija_copy_YYYYMMDD` (India date). Running it again the same day refreshes that copy.
2. **Compare** shows live record counts next to the copy, and can open one employee or one attendance month on both sides.
3. **Restore** asks you to type the copy’s label. Before live data is replaced, the current data is saved as `asija_prerestore_...`. Only a verified copy can be restored.

Creating and restoring require edit access on the backup section. Viewing the list requires view access.

## Command line

```bash
npm run backup
```

## Daily schedule

Call this once a day, ideally at 02:00 IST, the same way as the request digests:

```text
POST /api/cron/daily-backup
Authorization: Bearer <CRON_SECRET>
```

`CRON_SECRET` or `PENDING_REQUEST_DIGEST_SECRET` must be set. The route does not modify live data.

## What is not copied

- `hrauthsessions`, `employeeauthsessions`
- `hrotppendings`, `employeeotppendings`, `hrpasswordchangependings`
- the old `backups` collection

Those sessions and codes are created again the next time someone logs in.
