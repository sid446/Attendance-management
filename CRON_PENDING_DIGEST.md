# Attendance-request digest emails

Partners are **not** emailed when an employee submits a request. Two scheduled jobs send batched mail instead. Schedule both in cron-job.org / Task Scheduler after deploy — the app does not run cron by itself.

Shared env:

```env
CRON_SECRET=long-random-string
# or
PENDING_REQUEST_DIGEST_SECRET=long-random-string
```

Also set `NEXT_PUBLIC_BASE_URL` to the live site (for Review all links).

Auth on both endpoints (required):

- Header `Authorization: Bearer <CRON_SECRET>`, or
- Header `x-cron-secret: <CRON_SECRET>`

---

## Daily digest — yesterday’s new requests

Every morning (recommended **08:00 IST**), one email per partner listing **Pending** requests **created the previous Asia/Kolkata calendar day**. Already approved/rejected items and partners with zero leftover pending from yesterday are skipped.

- `GET` or `POST` `/api/cron/daily-request-digest`
- Optional: `dryRun=1`, `sampleTo=email@example.com`

```bash
# Daily 08:00 Asia/Kolkata
curl -X POST "https://attendance.asija.in/api/cron/daily-request-digest" \
  -H "Authorization: Bearer YOUR_CRON_SECRET"
```

Dry run:

```bash
curl "https://attendance.asija.in/api/cron/daily-request-digest?dryRun=1" \
  -H "Authorization: Bearer YOUR_CRON_SECRET"
```

---

## Saturday digest — all still-pending (overdue reminder)

Every Saturday morning (recommended **08:00 IST**), reminder of **all Pending** requests (not `PendingHr`), including older overdue items.

- `GET` or `POST` `/api/cron/pending-request-digest`
- Optional: `dryRun=1`, `sampleTo=email@example.com`

```bash
# Weekly Saturday 08:00 Asia/Kolkata
curl -X POST "https://attendance.asija.in/api/cron/pending-request-digest" \
  -H "Authorization: Bearer YOUR_CRON_SECRET"
```

---

## Who gets mail

For each pending request in the job:

1. Partner inbox (partner login email)
2. Employee’s `attendanceEmail`, when it differs

Self-approvers are skipped. Each email includes a Review all link and per-request Review buttons.
