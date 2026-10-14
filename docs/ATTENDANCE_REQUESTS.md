# Attendance requests

`/request.html` is a public employee form. It intentionally does not require login. It obtains the current full employee list from EP.DB through `/attendance-api/employees`, returning only selection IDs and names (no EIDs, phone numbers, email addresses, or Discord IDs). This is self-reported attendance; choosing a name does not verify the submitter's identity.

## Storage and deployment

- Frontend: `public/public/request.html`, `request.css`, and `request.js`, served by the existing Firebase Hosting configuration and Express routes.
- Backend: `/attendance-api/requests`, mounted with the existing employee store in `index.js`.
- Destination: [attendance spreadsheet](https://docs.google.com/spreadsheets/d/12tZLWvQin1bhbWvALdnlAxkR0iD_6ScUVWEnL6IziDY/edit?gid=580541604#gid=580541604), worksheet ID `580541604`. The worksheet title is resolved by ID rather than hard-coded.
- Google authentication: existing `GOOGLE_CLIENT_EMAIL` and `GOOGLE_PRIVATE_KEY`; grant this service account editor access to the destination spreadsheet. Credentials remain on the backend.
- Discord: channel `1365021189998903418`, overridable with `ATTENDANCE_DISCORD_CHANNEL_ID`. The existing bot needs View Channel, Send Messages, and Attach Files permissions.
- Install dependencies with the updated lockfile; `sharp` renders the three PNG cards on the backend. Deploy both frontend and backend for the new workflow to operate.
- The unbranded Employee Services page and Discord cards share the two generated transparent illustrations in `public/public/assets/attendance/`; the generation prompts are recorded in `ATTENDANCE_ARTWORK.md`.

An empty worksheet receives Google Form-compatible headers plus request reference, employee ID, request date, scheduled start, and note. Existing columns stay in order; missing supported columns are appended. `RAW` writes preserve user text without interpreting formulas. No live Google Form submission is performed.

Sheets is the attendance source of truth. Only successful saves show a receipt. A stable per-request UUID prevents duplicate rows on retries within the backend's serialized write queue; an ambiguous save can be retried from the same open page. The queue assumes one active backend writer. Multiple replicas need a shared lock or storage with atomic unique-key insertion before enabling this endpoint across replicas.

The browser stops waiting after 30 seconds and keeps the submitted data and reference for an unchanged retry. A timeout does not cancel a save already running on the backend. A confirmed validation rejection (HTTP 400) restores editing so the employee can correct the request. Ambiguous failures keep the submitted snapshot locked until its save status is confirmed.

Discord receives request, monthly summary, and policy reminder PNGs in one message. Delivery jobs persist in the existing PBB SQLite database and retry every minute after failures. Discord nonces reduce duplicate notifications during ambiguous delivery retries. Monthly history uses the new employee ID and request date columns; older Google Form rows without these fields are not attributed automatically. No attendance threshold, disciplinary decision, or handbook rule beyond the supplied reminder is inferred.

Image rendering is loaded only during Discord delivery. A missing or incompatible image dependency leaves a pending notification job rather than preventing the API and employee list from starting. For an HTML gateway error (502/503/504), the page reports temporary service unavailability and offers Retry loading employees. The displayed employee name is the same `name` field labeled Full Name in `admin.html`.

Dates default to America/Los_Angeles. Arrival is local time on the selected date. Scheduled start is not requested. The legacy Scheduled Start storage column is preserved, with new requests leaving it blank. Both types require a nonblank reason; Coming Late labels this field “Why?”. Additional review notes remain optional.

## Verification

`node --test test/attendanceRequests.test.js test/employeeContacts.test.js test/employeeDatabase.test.js test/pbb.test.js`

`node scripts/verify-attendance-request.cjs` runs the browser checks when Playwright and a compatible browser are available. Set `PLAYWRIGHT_MODULE` to the bundled Playwright package path if it is not on Node's module search path. On Windows this uses installed Edge. Screenshots are saved under `output/attendance-ui` or `ATTENDANCE_QA_DIR`.

The focused tests cover current employee validation, private-field minimization, target worksheet selection, original-column preservation, RAW writes, duplicate retries, month boundaries, failed saves, pending Discord delivery, and PNG generation. Local UI checks use sanitized employees and simulated services; they do not establish live Sheets or Discord delivery.
