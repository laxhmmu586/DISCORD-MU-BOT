# Public passenger feedback

Page: `/feedback.html` (no login). Chinese and English are displayed separately. Switching languages retains entered values. Praise and Complaint enter simultaneously from opposite sides; reduced-motion users see static controls.

## Staff nicknames

Employee administration adds **昵称 / NICKNAME**. Save nicknames there to publish them in the public selection list. Blank nicknames remain hidden. Full names, contact information, EIDs and qualification flags are never returned by `/feedback-api/employees`. Nicknames do not change names used on PBB PDFs. Existing records require no destructive migration.

## Delivery

- To: `Lake.Xia@hallmark-aviation.com`
- Cc: `Chuyang.Tan@hallmark-aviation.com`
- Subject: `A new case has been assigned to your department!`
- Existing Gmail OAuth configuration is reused; no browser credentials.
- No Google Sheets writes. SQLite stores request hashes/status/timestamps for duplicate suppression. An undelivered Discord queue temporarily stores the message and is removed after delivery.
- Success requires Gmail's send acknowledgement. It does not establish recipient inbox placement. An ambiguous Gmail failure is not automatically retried, because Gmail send has no idempotency guarantee. The page instructs the passenger to confirm with the service team.
- Discord channel: `1371154197155807232`. Legacy content/title/color/field-list/footer style is retained. Discord retries independently every minute, using deterministic nonces. Long feedback is split across messages without truncation.
- A request ID survives reload in session storage. No passenger text is stored in browser storage. Identical retries return the original success without resending mail. Changes using the same delivered ID are rejected.
- Server validates date, seat, 20-character minimum and current nickname selection. Five new requests per client per hour; nginx's overwritten X-Real-IP is trusted only on loopback connections. The API accepts at most 24KB JSON.

## Assets

`public/public/assets/feedback/aircraft.png` is the supplied aircraft PNG, copied without redrawing, mirroring or changing its livery/lettering. It is displayed at its original aspect ratio in the background; CSS does not stretch it. The welcoming and success attendant cutouts were generated using the built-in imagegen tool from the approved concept. Prompts requested the same adult Chinese attendant identity, navy skirt suit, red belt and red-blue silk scarf, natural adult proportions, realistic fabric, transparent background, no text/UI. Welcome uses full-body open hands with shoes visible; success uses a waist-up smiling thumbs-up pose. The simple sky/apron background and champagne check/confetti are native CSS.

## Validation

`node --test test/feedback.test.js test/employeeContacts.test.js test/employeeDatabase.test.js`

`node scripts/verify-feedback.cjs` (set PLAYWRIGHT_MODULE when Playwright is provided outside node_modules).

Browser verification uses sanitized employee data and simulated mail delivery at 320, 390, 768 and 1440px. It checks separate languages, value retention, current nickname selection, validation and acknowledged success. These tests send no real email or Discord messages.
