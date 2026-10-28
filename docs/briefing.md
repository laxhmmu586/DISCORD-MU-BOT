# Arrival briefing

`/briefing.html` replaces the Profile entry in the workspace sidebar. The account menu still provides Profile. Access requires an existing linked LAX/MU employee, using the same eligibility rules as Schedule.

The heading and record date use today's date in America/Los_Angeles. Flight defaults to MU583 and aircraft type to 777-300; flight can be changed. Departure is a placeholder. Mobile sections are Flight, Details, Duty, and Time.

## ETAB import

The existing ETAB advisory service calls `onAdvisorySent` after Discord acknowledges its message. The callback stores a parsed, flight/date-specific snapshot in `briefing_etab_snapshots`; failed Discord delivery does not import. No mailbox reads are triggered by Briefing. The existing ETAB service must be enabled and running for new imports.

Registration, ETA, gate, TTL PAX and crew use that snapshot until manually overridden. Manual corrections are saved per flight/date and survive later ETAB deliveries. Open pages check the stored snapshot every 15 seconds. Messages posted before this integration are not backfilled automatically.

## Editing and assignment

Operational fields save automatically to `briefing_records`. Field comparisons reject concurrent overwrites. Changes are recorded in `briefing_audit` with the linked employee identity.

The desktop roster reads today's scheduled working employees, with avatars and a separate original-color shift badge. It exposes this assignment information, not another employee's calendar or private profile fields. Names can be dragged from the roster into a duty, moved between duties, or returned to the roster. A source name remains available for multiple duties. Click-select/Assign and remove buttons also support keyboard use. Moves update both duties in one transaction.

Supervisor and above can edit the supplied shared contacts and use Clear. Both permissions are enforced by the API. Clear resets all input values and assignments for the current flight/date while preserving the flight/date identity and contact directory. Cleared ETAB values stay blank rather than reappearing on the next snapshot read.

## Report follow-ups

The Report Dashboard button appears only for authorized users while WWH is selected. Terrific Ten supports 1–200 entry rows through + row/− row controls at the bottom. Removing a populated last row requires confirmation; row edits are revision-checked, shared, and reflected in Excel exports while preserving the other original workbook parts.

## Local verification

Use Node 22 for the installed SQLite binary. Focused suites: `briefing.test.js`, `etabAdvisory.test.js`, `hasReportForms.test.js`, and `staffSchedule.test.js`. Browser suites: `briefing.browser.cjs`, `hasReportForms.browser.cjs`, `hasReportDashboard.browser.cjs`, and `staffSchedule.browser.cjs`. They use local fixture servers and mock Discord delivery; they do not send production messages.
