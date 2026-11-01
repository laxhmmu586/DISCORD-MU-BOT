# Approval and Read & Sign Push

## Files and dependencies (A, B, E, F)

New: `has/server/approvalPush.js`, `has/public/push-notifications.js`,
`has/public/push-manifest.webmanifest`, three `has/public/assets/push-*.png` icons,
`public/public/firebase-messaging-sw.js`, `test/approvalPush.test.js`, this report.

Changed: `has/public/flight-account.js`, `has/server/pbb.js`, `staffSchedule.js`,
`uniformRequests.js`, `newAccessRequests.js`, `incidentReports.js`, `expenseReports.js`,
`terrificReports.js`, `readSign.js`, and `public/firebase.json`.
All server paths above are under `has/server/`. No production npm packages were added.
FCM HTTP v1 uses the existing `googleapis` package and existing server-only Google
service credentials. Firebase compat 10.12.2 Messaging is loaded on demand alongside
the existing app/auth SDKs; the Firebase app is not initialized again.

## Firebase and Oracle setup (C, D)

Reuse Firebase project `china-eastern`. Its FCM API and the server credential's
`cloudmessaging.messages.create` permission were verified before deployment.
Server `.env` requires `FCM_VAPID_PUBLIC_KEY` (the public key supplied by the owner).
`FIREBASE_PROJECT_ID` defaults to `china-eastern`; `GOOGLE_CLIENT_EMAIL` and
`GOOGLE_PRIVATE_KEY` remain server-only. Never put service credentials in Hosting.

Public VAPID key location: Firebase Console → Project settings → Cloud Messaging →
Web configuration / Web Push certificates → Key pair. Generate a pair there if none
exists, and copy the public key. Do not substitute a made-up key. The device API
returns only that public key and configuration readiness to authenticated users.

Tokens use Oracle SQLite, not Firestore, so no Firestore Rules changes or client
database-write access were introduced. Existing Firebase authentication is retained.
No public push-send API exists. Token endpoints require verified Firebase identity
and a linked employee profile; supplied user IDs are ignored.

## Storage, trigger points and recipients (G, H, I, J)

The existing employee SQLite database (`data/EP.DB`, or `PBB_EMPLOYEE_DB_PATH`) now
contains `notification_tokens`, `approval_push_outbox`, and `approval_push_delivery`.
Tokens retain Firebase UID, browser device UUID, token hash, token, timestamps,
platform, user agent, and enabled state. Multiple devices remain separate. Token
changes replace only that browser's registration. Logout disables only that user's
current browser device. `UNREGISTERED` FCM tokens are disabled automatically.

Successful Schedule `create`/`act` mutations enqueue after the store accepts the
request, inside the same outer database transaction. Recipients come from actual
`canApprove` / `canConfirm` views and Schedule eligibility. A trade first notifies
its partner; if confirmation requires Supervisor approval, the Supervisor queue is
notified next. Existing shared queues remain shared: every user actually able to
handle the current task is eligible; unrelated managers are not broadcast targets.

HAS Uniform, New Access, Incident, Expense, and Terrific mutations reuse each
store's authenticated `read().canReview`. Submission, next-stage approval, transfer,
route changes, return/resubmission and lifecycle changes are checked after the
successful mutation. Only the currently responsible people receive Push.
Call Sick / Call Off currently records attendance and sends the existing team
notification directly; there is no approval queue, so no approval Push is invented.

Read & Sign `publish` and `addRecipients` enqueue for assigned, unsigned recipients
using the existing scoped `read()` view. Existing email delivery remains intact.
Each newly added recipient receives one Push; signed or out-of-scope users do not.
Ordinary announcements, schedule edits, and approval/rejection results do not push.

## Deduplication and delivery limits (K)

Unique event key: source + request ID + stable approval stage/node/submission cycle
+ Firebase UID. Read & Sign uses one publication stage per memo and user.
The outbox is written atomically with the original mutation: rollback removes both.
Reads, browser listeners and page refresh never enqueue notifications. The worker
rechecks current responsibility immediately before processing, skips obsolete jobs,
and records each event/token claim durably before the FCM request. Immediate
processing is scheduled after commit; a five-second server timer recovers pending
work after restart. No existing pending-task backlog is broadcast on installation.

FCM has no transactional exactly-once contract with SQLite. To prioritize the
requested no-duplicate behavior, a claimed device delivery is never automatically
resent after an ambiguous timeout/crash. Such a delivery can be missed; claims
recorded as `sending` or `failed` require investigation rather than blind retry.
`processed` means the job was attempted, not that a device displayed it. Inspect
`approval_push_delivery.status` for FCM acceptance. No active device means no send.
Browser/OS delivery timing also remains outside the application's control.

## Browser and device testing (L, M, N, O)

1. Chrome desktop: sign in at the HTTPS site, open the avatar menu, click **Enable
   Notifications** immediately above **Logout**, and allow browser notifications.
   The entry changes to **Notifications Enabled** after device registration.
2. Android Chrome: repeat on the phone, optionally install the PWA. Enable both
   browser/site and operating-system notifications. A second device must create
   a separate enabled token row for the same UID.
3. iPhone/iPad: Safari → Share → Add to Home Screen, then launch that icon, sign in,
   and enable notifications there. Use iOS/iPadOS 16.4+ with Web Push support.
   Ordinary Safari displays the Home Screen instruction without requesting access.
4. Use two real test accounts: submit a future Schedule Request Off as an employee
   with the approver's app in the background. Only the actual approval queue should
   receive **Approval Required**. Repeat the same request reference or refresh;
   no second Push should occur. Test a named multi-stage Uniform route; approve
   stage one and confirm that only stage two receives the next notification.
5. Publish a clearly marked test Read & Sign memo to an authorized test scope;
   verify assigned unsigned recipients receive **Read & Sign Required**. Add a
   newly eligible test recipient and verify only that person receives a new Push.
   These are real workflow actions, so use test accounts/scope and remove test
   records with the existing controls afterward.
6. Close/background the page, then repeat a real test assignment. Click the Push
   to focus an existing same-origin window or open the relevant MUFC page.
   Logging out of one device must preserve the user's other devices.

No permission prompt runs on page load. Granted devices resynchronize their token
on sign-in and return to the page. Denied/unsupported browsers receive an inline
explanation. A minimal installable manifest and icons were added; the new Service
Worker does not intercept network requests or cache pages.

Automated verification: `node --test test/approvalPush.test.js` covers real store
permissions, multiple devices, stage progression, transaction rollback, obsolete
tasks, restart deduplication, invalid tokens, Schedule HTTP submission, Read & Sign
publication/additions and token API ownership/logout. Browser verification covers
menu order, explicit permission, registration, current-device logout and the iPhone
Home Screen prerequisite. Real FCM device delivery still requires the device-side
permission and the manual two-account checks above.

## Rollback (P)

Disable sends by removing `FCM_VAPID_PUBLIC_KEY` and restarting the Oracle service,
then revert the feature commit on the server and Firebase Hosting. Preserve the
three new SQLite tables: they are additive, and preserving claims prevents repeat
delivery if the feature is restored. Do not restore an old whole employee database
over newer operational data. Existing approvals do not depend on these tables.
The deployment backup retains the previous server revision, protected environment
file and a consistent SQLite online backup. Browsers may retain the push-only
Service Worker; without sends it cannot change page loading or approval behavior.
