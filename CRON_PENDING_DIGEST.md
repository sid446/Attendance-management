# Saturday pending attendance-request digest

Every Saturday morning (recommended **08:00 IST**), call this secured endpoint so partners and attendance approvers get a reminder of **Pending** requests only (not `PendingHr`).

## Endpoint

- `GET` or `POST` `/api/cron/pending-request-digest`
- Auth (required):
  - Header `Authorization: Bearer <CRON_SECRET>`, or
  - Header `x-cron-secret: <CRON_SECRET>`
- Optional query: `dryRun=1` — list recipients without sending mail

## Env

Set one of:

```env
CRON_SECRET=long-random-string
# or
PENDING_REQUEST_DIGEST_SECRET=long-random-string
```

Also ensure `NEXT_PUBLIC_BASE_URL` points at the live site (for Review all links).

## Who gets mail

For each pending request:

1. Partner inbox (same routing as new-request emails — partner login email)
2. Employee’s `attendanceEmail`, when it differs (attendance approvers)

Self-approvers are skipped. Email includes pending count, employee/date list, overdue (3+ days) marks, and a Review all link.

## External cron example

Schedule weekly Saturday 08:00 Asia/Kolkata:

```bash
curl -X POST "https://attendance.asija.in/api/cron/pending-request-digest" \
  -H "Authorization: Bearer YOUR_CRON_SECRET"
```

Dry run:

```bash
curl "https://attendance.asija.in/api/cron/pending-request-digest?dryRun=1" \
  -H "Authorization: Bearer YOUR_CRON_SECRET"
```
