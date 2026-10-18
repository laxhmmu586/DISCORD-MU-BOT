# Read & Sign, Profile and attendance

Read & Sign is available at `/read-sign.html`. The Profile module links to all memos, personal signing history, and Uniform Requests. Attendance is available at `/attendance.html` and in Profile. A disabled Training / Coming soon button sits below Attendance. Desktop module columns share aligned bottom edges while Info stays immediately below Read & Sign. All history APIs require a Firebase sign-in token and a linked employee account.

## Publishing and signing

- Only employees whose current server-side position is Supervisor or Manager may publish. Admin email membership alone does not grant publishing rights.
- A publication contains a subject, optional memo number, message, mandatory future deadline, and up to five attachments totaling 10 MB. Supported files: PDF, PNG, JPEG, WebP, TXT, DOCX and XLSX. Attachments download through an authenticated API.
- Publication atomically snapshots all named employees and queues a reminder for each. Employee names, published content and the required roster remain fixed for the record. Employees added later can read but are not assigned to earlier memos.
- Employees must check the acknowledgement and draw a handwritten signature. The server validates normalized strokes and constructs the stored signature image. A unique memo/employee key prevents duplicate signatures. Retries retain the first acknowledgement timestamp. Late signatures are accepted and explicitly marked.
- Every linked employee can inspect the roster, signatures and acknowledgement dates. Filters distinguish all memos, items to sign, and the employee's signed history. Print / Save PDF produces a Hallmark register with Employee Name, Signature / Initials and Date of Ack columns.

## Email and deployment

`readSign.js` uses the existing `getNextDayInfoGmailClient()` credentials and Gmail sender. Each recipient receives a separate message. It prefers Company Email, then the employee's contact Email; Original Login ID is not used as a delivery address. The email includes message text, deadline and a `/read-sign.html?memo=…` link. Attachments are available after sign-in on the page. The existing login/link flow preserves that destination using an allowlisted `next` path.

The SQLite `read_sign_mail` table persists queued, failed, missing-email and sent states. Delivery retries at startup and every minute, in batches of 40, rotating failed jobs by last attempt. Correcting a missing address in Admin lets the next retry deliver it. Publisher-role viewers see per-person delivery status. A Gmail acknowledgement marks a message sent; a crash after Gmail accepts but before SQLite updates may result in a duplicate reminder. Signed acknowledgements remain safe from duplicate submissions.

Deploy both the backend and Firebase Hosting assets together. New tables are created in the employee SQLite database; preserve the existing employee database volume and its backups. The Firebase config includes cache prevention for new assets. `PUBLIC_APP_URL` defaults to `https://www.mufcapp.net`.

## Uniform OA tracking

The existing workflow remains versioned and starts with Supervisor then Manager by default. The request displays its submission, each stage, named eligible next approvers, timestamps, approval or rejection, and decision notes. Rejection requires a reason. Future workflow edits still apply only to new requests. Self-approval, repeated participation and stale-revision decisions remain blocked. An empty approver list is shown explicitly so an administrator can correct staffing rather than silently skipping a stage. Existing final Manager PDF and email behavior is preserved.

## Attendance records

The authenticated `/attendance-api/history` endpoint reads the existing attendance worksheet (spreadsheet and tab constants in `attendanceRequests.js`). It selects only rows whose Employee ID equals the linked employee's internal record ID; query parameters cannot select another person. History reads do not initialize or alter worksheet headers. Older rows without this identity field cannot safely be assigned by name and are omitted. Profile and Attendance use a shared monthly calendar with previous/next month controls and Today. Blue marks indicate Call Off / Sick; gold marks indicate Coming Late; both marks appear when both types occur on a day. Selecting a Profile date opens Attendance with that exact day selected. Attendance supports day, type and month filtering and compact expandable records. Full reason, expected arrival, note and formatted submission time are available on expansion. Reference remains stored for auditing but is hidden in this UI. Calendar dates use UTC arithmetic to avoid DST shifts; today's highlight uses America/Los_Angeles. Counts represent submissions, not scheduled workdays or leave hours. These submissions have no approval status.

Email reminders include both a plain-text fallback and a styled HTML version with the HMMU header, subject, publisher, deadline, message, attachment names and an Open Read & Sign button. Both versions use the same authenticated destination. Published text is escaped before rendering in HTML. Preview images are generated from the actual outgoing HTML template without sending mail.

## Validation

`node --test test/readSign.test.js test/uniformRequests.test.js test/attendanceRequests.test.js test/employeeProfiles.test.js`

`PLAYWRIGHT_MODULE=<path to playwright> node test/readSign.browser.cjs`

Browser validation uses an isolated in-memory database, sanitized example employees, a test authentication adapter and stubbed external delivery. It covers publisher permissions, publication review and attachment upload, real pointer handwriting, reload persistence, attachment download, print layout, named approval routing and rejection reasons, Profile modules, attendance filters, and widths 1680 / 390 / 320. Screenshots are generated under `.verification/people/`. No production mail, Google Sheets edits or deployment is performed by these tests.

The pre-existing Uniform test fixture used `@mu.com` accounts that the current production profile policy classifies as external. All seven tests failed against unchanged `origin/main` for this reason. The fixture now uses employee login addresses under `@login.example.com`, retaining the production access policy.
