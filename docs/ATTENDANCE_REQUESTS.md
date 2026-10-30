# Attendance requests

`/attendance-request.html` is a public employee form. It intentionally does not require login. It obtains the current full employee list from EP.DB through `/attendance-api/employees`, returning only selection IDs and names (no EIDs, phone numbers, email addresses, or Discord IDs). This is self-reported attendance; choosing a name does not verify the submitter's identity.

## Storage and deployment

- Frontend: `has/public/attendance-request.html`, `request.css`, and `request.js`, served by the existing Firebase Hosting configuration and Express routes.
- Backend: `/attendance-api/requests`, mounted with the existing employee store in `index.js`.
- Destination: [attendance spreadsheet](https://docs.google.com/spreadsheets/d/12tZLWvQin1bhbWvALdnlAxkR0iD_6ScUVWEnL6IziDY/edit?gid=580541604#gid=580541604), worksheet ID `580541604`. The worksheet title is resolved by ID rather than hard-coded.
- Google authentication: existing `GOOGLE_CLIENT_EMAIL` and `GOOGLE_PRIVATE_KEY`; grant this service account editor access to the destination spreadsheet. Credentials remain on the backend.
- Discord: channel `1365021189998903418`, overridable with `ATTENDANCE_DISCORD_CHANNEL_ID`. The existing bot needs View Channel, Send Messages, Attach Files for PNGs, and Embed Links for native fallback cards.
- Deploy the tracked `vendor/resvg-wasm/`, `vendor/fonts/`, and illustration assets with the backend. PNG generation uses the bundled WebAssembly renderer and Noto Sans font; no native image package or system fonts are needed. Provenance and licenses are documented in `vendor/ATTENDANCE_RENDERING.md`.
- The unbranded Employee Services page and Discord cards share the two generated transparent illustrations in `has/public/assets/attendance/`; the generation prompts are recorded in `ATTENDANCE_ARTWORK.md`.
- Discord cards additionally use the generated `late-luminous-v1.png` / `sick-luminous-v1.png` scene plates for reflective light trails and richer materials. Include both assets with the backend. Their prompts are recorded in `ATTENDANCE_PREMIUM_ARTWORK.md`; applicant data remains rendered from saved records. A gold or coral light trail aligns with the rounded card edge, and the submitted time is aligned to the bottom right.

An empty worksheet receives Google Form-compatible headers plus request reference, employee ID, request date, scheduled start, and note. Existing columns stay in order; missing supported columns are appended. `RAW` writes preserve user text without interpreting formulas. No live Google Form submission is performed.

Sheets is the attendance source of truth. Only successful saves show a receipt. A stable per-request UUID prevents duplicate rows on retries within the backend's serialized write queue; an ambiguous save can be retried from the same open page. The queue assumes one active backend writer. Multiple replicas need a shared lock or storage with atomic unique-key insertion before enabling this endpoint across replicas.

The browser stops waiting after 30 seconds and keeps the submitted data and reference for an unchanged retry. A timeout does not cancel a save already running on the backend. A confirmed validation rejection (HTTP 400) restores editing so the employee can correct the request. Ambiguous failures keep the submitted snapshot locked until its save status is confirmed.

Discord sends one main request PNG as a plain image attachment, with no Monthly Report or Attendance Policy Reminder embeds. There is no message heading. At delivery time the backend looks up the current employee Discord ID from the shared admin store and includes only that user mention, with an explicit users allowlist and automatic mention parsing disabled. Missing or malformed IDs produce no message content. Discord IDs are not returned by the public employee endpoint or accepted from the browser. The reference remains in storage and the website receipt, but is omitted from the main image. Delivery jobs persist in SQLite and retry after failures; successful deliveries are not resent.
