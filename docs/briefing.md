# Arrival briefing

`/briefing.html` replaces the Profile entry in the workspace sidebar. The account menu still provides Profile. Access requires an existing linked LAX/MU employee, using the same eligibility rules as Schedule.

The heading and record date use today's date in America/Los_Angeles. Flight defaults to MU583 and aircraft type to 777-300; flight can be changed. Departure is a placeholder. Mobile sections are Flight, Details, Duty, and Time.

## ETAB import

The existing ETAB advisory service calls `onAdvisorySent` after Discord acknowledges its message. The callback stores a parsed, flight/date-specific snapshot in `briefing_etab_snapshots`; failed Discord delivery does not import. No mailbox reads are triggered by Briefing. The existing ETAB service must be enabled and running for new imports.

Registration, ETA, gate, TTL PAX and crew use that snapshot until manually overridden. Manual corrections are saved per flight/date and survive later ETAB deliveries. Open pages receive stored snapshot changes through the live connection. Messages posted before this integration are not backfilled automatically.

## Editing and assignment

Lead and above can edit the sheet. Employees may edit plain-text Time Record only. Editable fields and assignments are yellow, readonly fields neutral. Operational fields save automatically to `briefing_records`. Field comparisons reject concurrent overwrites. Changes are recorded in `briefing_audit` with the linked employee identity.

The desktop roster reads today's scheduled working employees, with avatars and a separate original-color shift badge. It exposes this assignment information, not another employee's calendar or private profile fields. Names can be dragged from the roster into a duty, moved between duties, or returned to the roster. Assigned names are hidden from the left roster, whether assigned by drag or search, and reappear when their final duty is removed. Dropping an assigned name onto another occupied duty swaps the two names atomically. Click a person and then a duty to assign; remove buttons return names. Duty inputs search the full eligible employee directory, including off-duty employees; users must select a suggestion. Unmatched names show a red border and cannot be saved. The left roster has no search box. Moves update both duties in one transaction.

Lead and above can edit the supplied shared contacts and use Clear. Both permissions are enforced by the API. Clear resets all input values and assignments for the current flight/date while preserving the flight/date identity and contact directory. Cleared ETAB values stay blank rather than reappearing on the next snapshot read.

## Report follow-ups

The Report Dashboard button appears only for authorized users while WWH is selected. Terrific Ten supports 1–200 entry rows through + row/− row controls at the bottom. Removing a populated last row requires confirmation; row edits are revision-checked, shared, and reflected in Excel exports while preserving the other original workbook parts.

## Local verification

Use Node 22 for the installed SQLite binary. Focused suites: `briefing.test.js`, `etabAdvisory.test.js`, `hasReportForms.test.js`, and `staffSchedule.test.js`. Browser suites: `briefing.browser.cjs`, `hasReportForms.browser.cjs`, `hasReportDashboard.browser.cjs`, and `staffSchedule.browser.cjs`. They use local fixture servers and mock Discord delivery; they do not send production messages.

## Archived reports

Lead and above can generate immutable PDF archives; eligible employees can preview and download saved reports. Lead and above can delete website archives, including their stored PDF and snapshot; external Discord and Drive copies remain. Reports retain the captured values after subsequent edits or Clear. The preview and PDF end after Time Record; Contact Information and Instructions are excluded, including from the attached snapshot.

## Live updates and automatic delivery

Authenticated SSE updates synchronize fields, assignments, contacts and saved-report changes between open pages, with reconnect and polling fallback. Local drafts and focused inputs are preserved; concurrent same-field edits still use server comparisons.

The bot process starts `briefingAutoArchive`: all five Time Record values must be nonblank and unchanged for at least five minutes (checked every 15 seconds). Changing or clearing a time restarts the wait. A completed time-value version produces one saved archive, including after restart; changing the time values can produce another version. It sends the PDF to Discord channel 1563411695936864447 and stores it in Drive folder 1NX1WCsYZqNvdz57J8oGb7h1yQWyt_O1S. File names are `YYYY-MM-DD MU583 ARRIVAL BRIEFING SHEET.pdf` using the actual flight/date. Pending deliveries survive restarts and date rollover. Drive retries reuse a reserved file ID. Ambiguous Discord posts are reconciled against message history rather than blindly reposted; unresolved ambiguous sends are logged for operator review.

Production stops the previous fixed-time ARRIVAL spreadsheet export; the existing DEPARTURE schedule continues. The existing Google identity must have write access to the destination folder and the bot must have attachment-send/history access to the channel. Local tests mock external delivery and do not post to production services.
