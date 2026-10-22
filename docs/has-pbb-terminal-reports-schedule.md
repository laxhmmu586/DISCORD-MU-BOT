# HAS terminal qualifications, NO reports and schedule Config

All new interface labels and messages are English.

## Terminal qualification

LAX gates 131–159 (inclusive, optional single-letter suffix) require the TBIT certificate; 201–225 require MSC. Unknown LAX gates cannot grant Driver access. Existing `pbbId`/`pbbExpiry` remain the TBIT certificate at LAX and the standard certificate elsewhere. New `pbbMscId`/`pbbMscExpiry` are independent; neither certificate substitutes for the other. Administrators must enter actual MSC information. Older employee save clients preserve omitted MSC values, while explicit empty values clear them together.

Admin PBB settings and read-only Profile show both certificates. HAS selects the applicable certificate as the gate is entered. Missing/expired certificates block Driver confirmation and server mutations; expiry warnings retain the under-one-calendar-month rule. Movement audit and Driver signature/PDF use the selected terminal certificate. Other stations and the original PBB workflow retain their existing semantics.

## NO photo report

Every question's NO button opens a report dialog requiring a photo and reason. Mobile file input requests the rear camera; a device may offer its file picker instead. The image is resized in the browser and independently decoded/re-encoded on the server. Cancel leaves the answer unchanged; a failed save retains the draft for retry. A report identifier distinguishes a newly submitted photo from a previously saved NO when replies fail or arrive out of order. Generation, role, phase and revision checks still apply.

The latest report per role/question stores the explanation, normalized JPEG, employee and timestamp. Changing to YES records resolution without deleting that evidence; a bridge/gate reset clears it with the checklist. Reopening the question shows its saved report. Submitted PDF includes report-photo pages and UTF-8 text attachments for original explanations, plus the existing JSON audit. Dashboard summaries omit report-photo payloads. The obsolete Awaiting checks pills are removed from the checklist summary.

## Dashboard Config

Only the existing Dashboard administrator can read/write Config. Each row contains station, account, Inbound flight/days and Outbound flight/days (Monday–Sunday). Weekly pair frequency and expected Arrival counts use Inbound occurrences; the Outbound leg does not count a second flight. Different Inbound and Outbound days are supported. Duplicate leg identifiers in a scope, invalid weekdays and stale saves are rejected. Config is persisted with revision, author and save time.

Expected counts use the saved weekday schedule within the selected date range and scope. Unconfigured schedules count zero; no daily default or real schedule is invented. Saved Config applies to all queried dates, including historical date ranges; schedule effective-date history is outside this change. Submitted-flight counts continue to distinguish station/account/date/flight and count extra bridge forms separately. Add/remove/save/reload and unsaved-change handling are available in the English Config dialog.

## Validation

70 focused HAS/qualification/employee/original PBB tests pass, including terminal boundaries, distinct certificate validity, selected certificate audit, MSC persistence, NO evidence validation/resolution/reset, PDF photo pages, schedule access/conflicts and paired weekday counting. Local Edge verification at 320/390/1440px covers MSC-only qualification and suffix gates, Admin/Profile values, cancellation and retry of NO reports, post-docking reports, complete PDF submission, Config save/reload/statistics and existing shared state/reset behavior. `git diff --check` and JavaScript syntax checks pass. Production deployment, physical-camera behavior and real Drive delivery are not verified by these local checks.
