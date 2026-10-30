# HAS Jet Bridge NO reports and HAS email

Saving NO with a valid problem photo and explanation records the evidence and a durable email job in the same SQLite transaction. Invalid/rejected/stale answers do not queue mail. The saved report snapshot survives a later YES, reset, or deletion of an incomplete checklist.

## Recipients

Recipients are current Business Managers whose **Main Account** matches the report's Station and Account. Additional Account membership alone does not make someone that account's Business Manager. Only their `companyEmail` value is used; Admin now labels and exposes that existing field as **HAS EMAIL**. Existing stored addresses are retained. Personal email and Original Login ID are never fallbacks.

If several eligible managers share an address, it receives one message per problem event. If one manager lacks HAS email, valid managers still receive their messages, and the missing recipient remains pending. Fill the HAS email in Admin and Save; the pending job is checked again within about a minute. If no Business Manager exists, the event remains pending until one is configured.

## Message and delivery

Each email contains the exact problem question, NO-at-submission status, explanation, actual JPEG photo attachment, reporter, role, date/time, Station/Account, operation, flight, gate and bridge. The message describes a report at submission and directs the recipient to HAS Jet Bridge for later updates. It does not claim an old report is still unresolved.

The worker uses the existing `googleDrive.getNextDayInfoGmailClient()` mail configuration; no new credentials or personal mailbox fallback are introduced. Only new NO report submissions are queued; existing historical evidence is not bulk-emailed. Initial delivery starts asynchronously after saving the report. SQLite stores the event, per-address acknowledgements and retry state in `has_pbb_problem_mail`. A lease prevents concurrent workers from sending the same event. Failures retry with backoff; missing-recipient jobs retry every minute. Gmail Sent is reconciled using the event's reference, exact subject and recipient before retrying a lost acknowledgement.

The stable identity includes checklist ID, reset generation, role, question and report ID. Resubmitting the same report ID does not create another message. A newly opened problem report or reset generation has its own identity. Messages already acknowledged for one recipient are not resent while another recipient is being retried.

For operational diagnosis, inspect `status`, `error` and `next_attempt_at` in `has_pbb_problem_mail`; do not print the photo/data column or mail credentials into logs.

## Driver-first signatures

The previous client rendered a completed state for a signed Spotter but continued rendering the Driver signature canvas after the Driver signed first. Another click then correctly received `Your signed section is locked` from the server. The client now shows **Driver signature saved / Waiting for the Spotter signature**, provides Exit, and switches to the normal completed state when both signatures arrive. Saved signatures and server locking are preserved. If a sign response is lost, the client rereads the record and recognizes its own saved signature only for the same checklist generation and employee.

## Validation limits

Tests use fictional data and mocked Gmail delivery, including MIME/photo contents, missing HAS email, scope isolation, duplicate report IDs, retries/restarts, concurrent workers and lost Gmail acknowledgements. Browser tests cover Admin address retention/editing, driver-first signing, reload recovery, server lock preservation, both-signature completion and a deliberately lost sign response. No real employee emails were sent and production Gmail delivery was not exercised.


The focused 64-test API/PDF/mail/scope set, the HAS-email validation/persistence test, and Admin, New Access, signature-recovery and completion browser checks pass. Two pre-existing `companyApprovalEmail.test.js` Uniform reminder fixtures fail before email logic because they omit the newer post-Business-Manager approver selection; replaying the unchanged HEAD fixtures reproduces those errors. `hasPbbAccountSwitch.browser.cjs` stops at an unrelated mobile header-name assertion (`nowrap` versus `normal`), also reproduced when serving the unchanged HEAD HAS client. These broader fixtures/behaviors were not changed by this work.
