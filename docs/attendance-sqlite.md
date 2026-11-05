# Attendance SQLite storage

Coming Late and Call Off / Sick use the server's existing PBB SQLite connection
(`PBB_DB_PATH`, normally `data/pbb.db`). Neither submission nor history reads
Google Sheets.

Attendance submission and the employee identity endpoint require sign-in and a linked
employee profile. The identity endpoint returns only that profile. Submissions are
bound to the authenticated profile; a different employee ID is rejected with 403.
The browser displays the employee nickname as read-only text.

`attendance_requests` stores the validated request, indexed by employee and date.
The request UUID is unique: unchanged retries return the original receipt;
changed details with the same UUID return 409. Request insertion, Call Off / Sick
schedule updates, and `attendance_delivery` insertion share a transaction.
Discord sends happen after commit and retain the existing durable retry queue.

On startup, records already present in `attendance_delivery` are copied into the
request table without changing delivery status. This recovers previously accepted
website submissions, including sent notifications. Records that exist only in an
old Google Sheet are not imported. Back up this SQLite database with its existing
server backup process.

The Report page offers **Clear form** for Terrific Ten, Expense, Incident
Investigation, COS, PAF, and Record of Discussion. Confirmation clears the current
account's saved fields (and the selected month for Excel forms), including dates
and checkbox selections. Blank fields remain blank on reload. Template text,
formulas, and added row layouts are retained. Existing role checks and revision
checks prevent unauthorized clears and stale editors from clearing newer edits.

Validation:

```powershell
node --test test/attendanceRequests.test.js test/hasReportForms.test.js test/hasWordReports.test.js test/hasReportsCollaboration.test.js test/hasReportsLive.test.js test/hasReports.test.js
node test/reportClear.browser.cjs
```

The browser check uses local SQLite, test authentication, and no external sends.
