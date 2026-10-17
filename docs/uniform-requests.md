# Uniform requests

Profile provides a Request card and a sidebar entry to `/uniform.html`. Employees submit replacement reasons, the six original garment rows, and TIE / SCARF quantities. The server takes the employee's full name, EID and phone from the linked employee record and dates the request in America/Los_Angeles. Account MU, location LAX and status PT are fixed on the PDF and do not require inputs.

## Setup and approvals

In Admin, set each employee's Position to Manager, Supervisor, Lead or Agent and save. Existing records display Agent until assigned. Approvers need linked employee accounts. The final approving Manager needs a valid contact email in the employee record.

The default flow is Employee submits → Supervisor → Manager → Generate PDF → Email approving Manager. Any eligible employee in the current stage's position can review it; later stages cannot see the request before their turn. Self-approval and approval of more than one stage by the same employee are prohibited. Rejection requires a reason and ends the request. Requesters and previous reviewers can see the history.

Admin's Approval Workflow button shows a diagram and an editor for adding, removing and reordering up to five stages. The final stage remains Manager. Workflow changes apply only to future submissions. Configure enough distinct approvers for every stage, including requests submitted by supervisors or managers themselves.

The shared account header checks for pending approvals on authenticated page entry, focus and every minute while visible. It shows a popup with direct links to the relevant requests. The Uniform page already shows the approval inbox, so it does not interrupt that page with another popup.

## PDF and delivery

`assets/uniform/replacement-form.pdf` is the supplied original, preserved as the background. `uniformPdf.js` overlays request values, circles PT, and places the final Manager's full name on Requested By. LAST REPLACEMENT, authorization, issuance and receipt signatures remain blank.

Requests, approval history, workflow versions, PDFs and delivery flags persist in the employee database (`EP.DB`). Final approval queues PDF generation and a MIME email attachment to the approving Manager's employee contact email using the existing Gmail client from `googleDrive.getNextDayInfoGmailClient()`. Failed jobs retry every minute and after restart. A sent flag prevents normal repeated delivery; a crash after Gmail accepts the email and before the flag commits can cause a duplicate. Approved PDFs are also downloadable by the requester and authorized reviewers.

Deploy backend and Firebase Hosting assets together. This change does not create approval email messages before final approval; pending approval notifications appear inside the app. Local tests stub Gmail and never send real mail.

## Validation

- `node --test test/uniformRequests.test.js test/employeeProfiles.test.js test/employeeDatabase.test.js test/employeeAdminPermissions.test.js test/employeePhone.test.js`
- `node test/uniformRequest.browser.cjs` with `PLAYWRIGHT_MODULE` configured if Playwright is not locally installed.
- Existing `test/employeeProfile.browser.cjs` and `test/employeeAdmin.browser.cjs`.
- Render and visually inspect a generated PDF against the supplied original.

Use a Node version matching the installed `better-sqlite3` native module (Node 22 in the verification environment).
