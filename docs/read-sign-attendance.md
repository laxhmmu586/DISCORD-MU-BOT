# Read & Sign, Profile and attendance

Read & Sign is available at `/read-sign.html`. The Profile module links to all memos, personal signing history, and Uniform Requests. Attendance is available at `/attendance.html` and in Profile. Desktop module columns share aligned bottom edges while Info stays immediately below Read & Sign. All history APIs require a Firebase sign-in token and a linked employee account.

## Publishing and signing

- Only employees whose current server-side position is Supervisor or Manager may publish. Admin email membership alone does not grant publishing rights.
- A publication contains a subject, optional memo number, message, mandatory future deadline, and up to five attachments totaling 10 MB. Supported files: PDF, PNG, JPEG, WebP, TXT, DOCX and XLSX. Attachment downloads require an authenticated Supervisor or Manager.
- Publication atomically snapshots all named employees and queues a reminder for each. Employee names, published content and the required roster remain fixed for the record. Employees added later can read but are not assigned to earlier memos.
- Employees must check the acknowledgement and draw a handwritten signature. The server validates normalized strokes and constructs the stored signature image. A unique memo/employee key prevents duplicate signatures. Retries retain the first acknowledgement timestamp. Late signatures are accepted and explicitly marked.
- Only Supervisors and Managers can inspect the roster, signatures and acknowledgement dates. Other employees can inspect only their own signing status and date. Filters distinguish all memos, items to sign, and the employee's signed history. Print / Save PDF produces a Hallmark register with Employee Name, Signature / Initials and Date of Ack columns.

## Email and deployment

`readSign.js` uses the existing `getNextDayInfoGmailClient()` credentials and Gmail sender. Each recipient receives a separate message. It prefers Company Email, then the employee's contact Email; Original Login ID is not used as a delivery address. The email includes message text, deadline and a `/read-sign.html?memo=…` link. Attachments are available after sign-in on the page. The existing login/link flow preserves that destination using an allowlisted `next` path.

The SQLite `read_sign_mail` table persists queued, failed, missing-email and sent states. Delivery retries at startup and every minute, in batches of 40, rotating failed jobs by last attempt. Correcting a missing address in Admin lets the next retry deliver it. Publisher-role viewers see per-person delivery status. A Gmail acknowledgement marks a message sent; a crash after Gmail accepts but before SQLite updates may result in a duplicate reminder. Signed acknowledgements remain safe from duplicate submissions.

Deploy both the backend and Firebase Hosting assets together. New tables are created in the employee SQLite database; preserve the existing employee database volume and its backups. The Firebase config includes cache prevention for new assets. `PUBLIC_APP_URL` defaults to `https://www.mufcapp.net`.

## Uniform OA tracking

The Request page first asks for a request type; Request Uniform expands the form. Beneath Submit request, a progress section previews eligible reviewers before submission and tracks the latest submitted request, its current stage, named next reviewers and all approval notes after submission. Refresh status reloads that same saved request; the records list remains available below. The existing workflow remains versioned and starts with Supervisor then Manager by default. The request displays its submission, each stage, named eligible next approvers, timestamps, approval or rejection, and decision notes. Rejection requires a reason. Future workflow edits still apply only to new requests. Requesters may approve their own request when their current stored position matches the current approval stage. Repeated participation across stages and stale-revision decisions remain blocked. An empty approver list is shown explicitly so an administrator can correct staffing rather than silently skipping a stage. Existing final Manager PDF and email behavior is preserved.

## Attendance records

The authenticated `/attendance-api/history` endpoint reads the existing attendance worksheet (spreadsheet and tab constants in `attendanceRequests.js`). It selects only rows whose Employee ID equals the linked employee's internal record ID; query parameters cannot select another person. History reads do not initialize or alter worksheet headers. Older rows without this identity field cannot safely be assigned by name and are omitted. On desktop the Attendance page places its annual Monthly Overview chart to the left of compact records; narrower screens stack them. Profile and Attendance share a stacked monthly chart with year navigation. Pink indicates Call Off / Sick and blue indicates Coming Late. Selecting a Profile month opens Attendance with that month selected. Existing date deep links plus day, type and month filtering remain supported. Full reason, expected arrival, note and formatted submission time are available on expansion. Reference remains stored for auditing but is hidden in this UI. Counts represent submissions, not scheduled workdays or leave hours. These submissions have no approval status.

Email reminders include both a plain-text fallback and a styled HTML version with the HMMU header, subject, publisher, deadline, message, attachment names and an Open Read & Sign button. Both versions use the same authenticated destination. Published text is escaped before rendering in HTML. Preview images are generated from the actual outgoing HTML template without sending mail.

## Validation

`node --test test/readSign.test.js test/uniformRequests.test.js test/attendanceRequests.test.js test/employeeProfiles.test.js`

`PLAYWRIGHT_MODULE=<path to playwright> node test/readSign.browser.cjs`

Browser validation uses an isolated in-memory database, sanitized example employees, a test authentication adapter and stubbed external delivery. It covers publisher permissions, publication review and attachment upload, real pointer handwriting, reload persistence, attachment download, print layout, named approval routing and rejection reasons, Profile modules, attendance filters, and widths 1680 / 390 / 320. Screenshots are generated under `.verification/people/`. No production mail, Google Sheets edits or deployment is performed by these tests.

The pre-existing Uniform test fixture used `@mu.com` accounts that the current production profile policy classifies as external. All seven tests failed against unchanged `origin/main` for this reason. The fixture now uses employee login addresses under `@login.example.com`, retaining the production access policy.


## Read & Sign privacy and compact layouts

Only the current stored Supervisor or Manager role can view the full acknowledgement register, aggregate signing counts, signatures and delivery statuses, print/save the register, or download attachments. Other positions receive only their own acknowledgement state and date, alongside the memo content and attachment filenames. Roster and aggregate counts are omitted from list, detail and sign responses; direct attachment requests return 403. Changing a stored role takes effect on the next request. Employees can still sign and review their personal history.

Profile attendance uses a compact chart card without stretching to match neighboring columns. Attendance details place a bounded monthly chart next to a readable-width record panel with compact expandable rows; smaller screens stack these panels. Info resource cards and the CTO table have a bounded width, with existing CTO data preserved.


## Monthly Overview chart

The Profile Attendance card and Attendance details now use a shared annual stacked bar chart in place of the calendar. Pink represents Call Off / Sick; blue represents Coming Late. Each bar aggregates the authenticated employee's actual valid records for that month and displays its total. Zero months have no fabricated bar, and the vertical scale adjusts to the largest monthly total. Month buttons have accessible count labels and filter/navigate to the corresponding month; year controls change the displayed year. Existing date deep links, type/month filters and expandable record details remain supported. The night-airport background reuses the existing aircraft asset, while axes, labels and bars remain live DOM elements. The record panel is capped at 550px and places reason/arrival beside the date/type rather than pushing arrival to the far edge.
