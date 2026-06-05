# Employee Dashboard — User Guide

**Asija and Associates LLP · Attendance App**

This guide explains how to use the **Employee Portal** after you log in. It covers everyday tasks for **all employees**, plus extra tools for **Partners** (managers who review team attendance).

---

## Who sees what?

| Feature | All employees | Partners (with team) |
|--------|:-------------:|:--------------------:|
| Dashboard (summary & charts) | ✓ | ✓ |
| Your Attendance & Request | ✓ | ✓ |
| Client punch | ✓ (if assigned) | ✓ |
| Review requests | ✓ (if anyone reports to you) | ✓ |
| Team attendance | — | ✓ (if team is linked) |
| Manage approvers | — | ✓ (if you are a Work Partner) |
| Allowed excess hours | — | ✓ (if you are a Work Partner) |

> **Partner** here means someone whose team members have you set as their **Work Partner** in the system. You do not need a special login — you use the same employee login; extra menu items appear automatically when your profile has team access.

---

## Part 1 — Getting in

### Step 1: Open the app

1. Open **Chrome**, **Edge**, or **Firefox** on your phone or computer.
2. Go to the attendance app URL shared by your company.
3. Choose **Employee Login**, or go directly to:  
   **`/employee/login`**

### Step 2: Sign in with OTP

Login uses your official **`@asija.in`** email and a one-time password (OTP).

1. Enter your **company email** (must end with `@asija.in`).
2. Tap **Send OTP**.
3. Check your inbox (and spam folder). The OTP is valid for **5 minutes**.
4. Enter the **6-digit OTP** and tap **Verify OTP**.
5. You are taken to the **Employee Dashboard**.

**Tips**

- If the OTP expires, wait for the cooldown (about 60 seconds) and tap **Resend OTP**.
- Use **Change email** if you typed the wrong address.
- If you are already logged in, the app sends you straight to the dashboard.

### Common login problems

| Message | What it means | What to do |
|--------|---------------|------------|
| Please enter your @asija.in email | Wrong email domain | Use your official `@asija.in` address |
| User not found | Email not in the system | Contact HR / admin |
| User account is inactive | Account disabled | Contact HR / admin |
| OTP expired | Code timed out | Resend OTP |
| OTP verification failed | Wrong code | Re-enter carefully or resend |

### Sign out

Tap the **logout icon** (top-right of the header) when you are done.

---

## Part 2 — Finding your way around

After login you see:

- **Header** — page title, your name, **Holidays** list, **Review requests** (with a red badge if anything is pending), and **Sign out**.
- **Left sidebar** (or **menu icon** on mobile) — main sections.

### Sidebar menu (everyone)

| Menu item | Purpose |
|-----------|---------|
| **Dashboard** | Monthly summary, charts, pending requests |
| **Your Attendance & Request** | Calendar to view days and submit requests |
| **Client punch** | GPS check-in/out at client sites (if assigned) |
| **Review requests** | Approve or reject team members’ requests |

### Extra menu (partners only)

These appear only when the system links team members to you:

| Menu item | Purpose |
|-----------|---------|
| **Team attendance** | View team calendars, fines, export |
| **Excess hours** | Set monthly allowed excess hours for your team |
| **Manage approvers** | Choose who receives attendance requests for each team member |

On desktop you can **collapse** the sidebar to icons only (button next to the logo).

---

## Part 3 — Dashboard (all employees)

The **Dashboard** is your home screen for the selected month.

### Your profile card

Shows your name, designation, team, email, employee code, and joining date.

**Partners:** If you have a team, a **Team** list appears here. Tap a member to jump to their calendar in **Team attendance**.

### Month picker

Use the month control to switch months. All summary numbers and charts update for that month.

### Attendance summary tiles

Tap a tile to see **which dates** count toward that metric:

| Tile | Meaning |
|------|---------|
| **Total days** | Days with attendance records |
| **Holidays** | Sundays + company holidays |
| **Working days** | Days excluding sun / holiday / week-off |
| **Present** | Full present days |
| **Half days** | Half-day attendance |
| **Absent** | Marked absent |
| **Late** | Late arrivals |
| **Leave** | Full leave days |
| **Scheduled** | Expected working hours |
| **Work hours** | Actual hours on scheduled days |
| **Excess / short** | Worked minus scheduled (overtime or deficit) |

### Pending requests

If you have requests waiting for approval, a **Requests pending** tile shows the count. **Tap it** to see date, type, reason, and status (`Pending` or `Pending HR`).

### Charts

A daily hours chart shows how your worked hours trend through the month.

### Holiday list

Tap **Holidays** in the header to open the company holiday list for the year (read-only).

---

## Part 4 — Your Attendance & Request

Open **Your Attendance & Request** in the sidebar to see your **monthly calendar**.

Each day shows your attendance status (present, absent, leave, WFH, etc.). Approved requests may also appear on the calendar.

### Request window (important)

At the top you may see a blue box:

> **Request window (IST)** — You can raise requests for dates from **[earliest]** through **[latest]**.

You **cannot** click dates outside this window. If you try, the app explains why (for example, previous month is closed after a cutoff day).

Plan corrections early — late submissions may be blocked.

---

### A. Future requests (leave, WFH, etc.)

Use this **before** the day happens.

#### How to select dates on the calendar

1. Open **Your Attendance & Request**.
2. **Click a future date** — this sets the **start date** (highlighted).
3. Then either:
   - **Click the same date again** → single-day request form opens, **or**
   - **Click a later date** → date range is set and the form opens.
4. A green bar at the top lets you **Continue request** or **Clear** the selection.

#### Fill the Future Request form

1. **Request type** — choose from the list (see table below).
2. **Reason** — required; write a short, clear explanation.
3. **Times** — required only for some types (see table).
4. If type is **Other**, type your custom request name.
5. Tap **Send Request**.

You get a success message showing how many day-requests were created. **Sundays are skipped** automatically for multi-day leave.

#### Future request types

| Type | Date range | Times needed? |
|------|------------|---------------|
| On leave | Single or multiple days | No |
| Half Day | Single day only | Yes — start & end time |
| WFH | Single day only | Yes |
| Present - outstation | Single day only | No (system uses your schedule) |
| Present - client place | Single day only | Yes |
| Weekoff - special allowance | Single or multiple days | No |
| Other | As selected | Depends on what you enter |

**Rules**

- End date must be on or after start date.
- For Half Day, WFH, and client place: **only one day** per request; start time must be **before** end time.
- Every request goes to your **Partner** for approval with status **Pending**.

---

### B. Correction requests (past dates)

Use this when attendance is **wrong** or a **punch is missing**.

#### When you can request a correction

Click a **past date** (within the request window) if that day is:

- **Absent**
- **Present** (you want to change status or times)
- **Half day**
- **Holiday / week off**
- **Missing in-time or out-time** (only one punch recorded)

You **cannot** open a new correction if a request for that date is already **Pending** or **Pending HR**.

#### Steps

1. Click the past date on the calendar.
2. The **Request Correction** form opens.
3. Choose **correct status** (options depend on the day — e.g. missed punch days offer fewer choices).
4. Enter **start time** and **end time** if the status requires them (in office, half day, WFH, outstation, client place).
5. Enter **reason** (required).
6. Tap **Send Request to Partner**.

#### Correction status options (typical)

**Normal working day**

- Present - in office  
- Half Day  
- WFH  
- Present - outstation  
- Present - client place  
- On leave  
- Holiday  
- Absent  
- Weekoff - special allowance  
- Other  

**Holiday / week off day**

- Weekoff - special allowance  
- Present - in office  
- Half Day  
- WFH  
- Present - outstation  
- Present - client place  

**Missed entry only** (one punch missing)

- Present - in office  
- Half Day  

---

## Part 5 — Client punch (all employees with assigned sites)

If you visit client locations, use **Client punch** in the sidebar.

### Before you start

- **Location / GPS must be ON** in your browser and phone settings.
- You must be assigned to at least one client place by admin. If none appear, contact admin.

### How to punch in / out

1. Open **Client punch**.
2. You see a list of **assigned client locations** and today’s punch status.
3. **Tap a location** you are at (within about **500 m** of the site — exact radius may vary).
4. The app reads your GPS position.
5. Tap **Mark In** or **Mark Out** as shown.
6. Success message confirms the punch. **In** and **Out** times appear on the card.

**Status colours**

- **Green** — punch recorded inside the allowed radius  
- **Amber** — punch recorded but you were outside the radius  

You must punch **In** before **Out**. After both are done, that location shows as complete for the day.

Use the **refresh** button if you need to reload today’s records.

---

## Part 6 — Partner guide: Review requests

If team members report to you, their attendance requests appear in your queue.

### Open the review page

- Tap **Review requests** in the header or sidebar, **or**
- Use the red **badge number** — it shows how many requests are waiting.

You land on the **Partner Review Portal**.

### Review each request

For each request you see:

- Employee name  
- Requested status (leave, WFH, correction, etc.)  
- Date or date range  
- Reason  
- Requested times vs original punch times (for corrections)  

**Approve**

1. Pick a **remark** (e.g. Done, Approved, Client Visit) or type your own.
2. Set **value** if shown (day credit — e.g. 1 for full day, 0.5 for half day, 0.75 for WFH). Leave types may not need a value.
3. Tap **Approve**.

**Reject**

1. Pick a remark (e.g. Insufficient Hours, Proof Required) or type your own.
2. Tap **Reject**.

You can switch between **Cards** and **Table** view, filter by person or request type, select multiple requests, and **bulk approve/reject**.

**Export:** Download an Excel file to review offline, then process in the app.

After action, the list refreshes. Employees see updated status on their dashboard calendar.

---

## Part 7 — Partner guide: Team attendance

Available when **Team attendance** appears in the sidebar.

### Team overview

At the top, a summary table shows each team member’s monthly metrics (present, absent, late, hours, etc.). **Click a row** to open that person’s calendar below.

### Attendance vs Fines tabs

| Tab | What you see |
|-----|----------------|
| **Attendance** | Team overview, employee picker, monthly calendar per person |
| **Fines** | Late-arrival fines and warnings for the team |

### Pick an employee

1. Use **Find employee** to search by name or OD ID.  
2. Or choose from the **dropdown**.  
3. Their **profile card** and **monthly calendar** load below (read-only — partners do not edit punch data here).

### Export team

Tap **Export team** to open a summary modal with all team members for the month. Click a name to jump to their calendar.

### From Dashboard

On the Dashboard profile card, tap any name under **Team** to open the same view.

---

## Part 8 — Partner guide: Manage approvers

Shown only if you are the **Work Partner** for employees in the system.

This controls **which email / person receives attendance requests** when a team member submits leave or corrections.

1. Open **Manage approvers** in the sidebar.
2. Search for a team member.
3. For each person, pick the **attendance approver** from the dropdown (usually a partner’s login email).
4. Tap **Save** next to that row.

Use this when someone’s requests should go to a different partner (covering manager, acting partner, etc.).

---

## Part 9 — Partner guide: Allowed excess hours

Shown only for Work Partners.

Some months, team members may work **more than scheduled hours**. You can set how much **excess hour** is allowed before it counts against them.

1. Open **Excess hours** in the sidebar.
2. Select the **month**.
3. For each team member, see **raw excess** (actual) and enter **allowed excess hours** (cap).
4. Tap **Save** — or **Clear** to remove a cap for that month.

This affects how **Excess / short** appears in team summaries.

---

## Part 10 — Request approval flow (everyone)

```
Employee submits request
        ↓
   Status: Pending
        ↓
   Partner reviews → Approve or Reject
        ↓
   (Some cases) Pending HR
        ↓
   Approved → calendar / attendance updates
   Rejected → employee can submit again if allowed
```

**Requirements for your request to succeed**

- Your profile must have a **Partner** assigned.  
- **Attendance email** must be configured on your profile.  
- Date must be inside the **request window**.  
- No duplicate pending request for the same date.

---

## Part 11 — Quick checklists

### Before sending any request

- [ ] Correct date(s) selected  
- [ ] Correct request / correction type  
- [ ] Reason filled in (clear and honest)  
- [ ] Start & end time filled in if required  
- [ ] Date is inside the request window  

### Daily routine (employee)

- [ ] Check Dashboard for absent / late days  
- [ ] Submit corrections within the allowed window  
- [ ] Apply for future leave early  
- [ ] Client visit? Use **Client punch** at the site  

### Weekly routine (partner)

- [ ] Clear **Review requests** badge (process pending items)  
- [ ] Spot-check **Team attendance** for issues  
- [ ] Follow up on rejected or unclear requests  

---

## Part 12 — Tips & best practices

**For all employees**

- Submit **future leave** as early as possible.  
- For corrections, give a **specific reason** (e.g. “Biometric missed — was in office 9:15–6:30”).  
- Track **Requests pending** on the Dashboard.  
- Keep GPS enabled before **Client punch**.  

**For partners**

- Review requests **within 1–2 business days** so payroll and records stay accurate.  
- Use consistent **remarks** when rejecting (helps employees fix and resubmit).  
- Use **Team attendance** before month-end to catch patterns (late, absent).  
- Set **excess hour** caps at the start of the month if your team policy requires it.  

---

## Part 13 — Who to contact

| Issue | Contact |
|-------|---------|
| Cannot log in / email not found | HR / Admin |
| Wrong partner or approver | HR / Admin |
| No client place assigned | Admin |
| Request window / date blocked | HR (policy question) |
| Punch / biometric hardware | Office admin / IT |
| Wrong attendance after approval | HR with request reference |

---

## Quick reference — URLs

| Page | Path |
|------|------|
| Employee login | `/employee/login` |
| Employee dashboard | `/employee/dashboard` |
| Partner review (from dashboard) | Open via **Review requests** button |

---

*Last updated for the Employee Dashboard as implemented in the attendance app. Features visible in the menu depend on your role and team linkage in HR records.*
