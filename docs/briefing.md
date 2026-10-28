# Arrival and Departure briefing

`/briefing.html` replaces the Profile entry in the workspace sidebar. The account menu still provides Profile. Access requires an existing linked LAX/MU employee, using the same eligibility rules as Schedule.

The heading and record date use today's date in America/Los_Angeles. Flight defaults to MU583 and aircraft type to 777-300; flight can be changed. Departure defaults to MU586. Arrival mobile sections are Flight, Details, Duty and Time; Departure uses Flight, Details and Duty.

## ETAB import

The existing ETAB advisory service calls `onAdvisorySent` after Discord acknowledges its message. The callback stores a parsed, flight/date-specific snapshot in `briefing_etab_snapshots`; failed Discord delivery does not import. No mailbox reads are triggered by Briefing. The existing ETAB service must be enabled and running for new imports.

Registration, ETA, gate, TTL PAX and crew use that snapshot until manually overridden. Manual corrections are saved per flight/date and survive later ETAB deliveries. Open pages receive stored snapshot changes through the live connection. On service startup the latest previously acknowledged Discord advisory is restored from persisted state or its original Gmail message, without posting it again. The delivered advisory also supplies the departure flight registration, gate and STD/ETD; arrival PAX and crew are not copied to departure. ETA preserves its local-time suffix. Arrival STA defaults to 0905.

## Editing and assignment

Lead and above can edit the sheet. Employees may edit plain-text Time Record only. Editable fields and assignments are yellow, readonly fields neutral. Operational fields save automatically to `briefing_records`. Field comparisons reject concurrent overwrites. Changes are recorded in `briefing_audit` with the linked employee identity.

The desktop roster reads today's scheduled working employees, with avatars and a separate original-color shift badge. It exposes this assignment information, not another employee's calendar or private profile fields. Names can be dragged from the roster into a duty, moved between duties, or returned to the roster. Assigned names remain in the left roster so the same person can be assigned to multiple duties in Arrival and Departure. Dropping onto an occupied duty appends that person; both nicknames remain visible in the slot and frozen exports. Each chip can be moved or removed independently. The same roster person remains available for other duties. Click a person and then a duty to assign; remove buttons return names. Duty inputs search the full eligible employee directory, including off-duty employees; users must select a suggestion. Unmatched names show a red border and cannot be saved. The left roster has no search box. Moves update both duties in one transaction.

Lead and above can edit the supplied shared contacts and use Clear. Both permissions are enforced by the API. Clear resets all input values and assignments for the current flight/date while preserving the flight/date identity and contact directory. Cleared ETAB values stay blank rather than reappearing on the next snapshot read.

## Report follow-ups

The Report Dashboard button appears only for authorized users while WWH is selected. Terrific Ten supports 1–200 entry rows through + row/− row controls at the bottom. Removing a populated last row requires confirmation; row edits are revision-checked, shared, and reflected in Excel exports while preserving the other original workbook parts.

## Local verification

Use Node 22 for the installed SQLite binary. Focused suites: `briefing.test.js`, `etabAdvisory.test.js`, `hasReportForms.test.js`, and `staffSchedule.test.js`. Browser suites: `briefing.browser.cjs`, `hasReportForms.browser.cjs`, `hasReportDashboard.browser.cjs`, and `staffSchedule.browser.cjs`. They use local fixture servers and mock Discord delivery; they do not send production messages.

## Archived reports

Lead and above can generate immutable PDF archives; eligible employees can preview and download saved reports. Lead and above can delete website archives, including their stored PDF and snapshot; external Discord and Drive copies remain. Reports retain the captured values after subsequent edits or Clear. The preview and PDF end after Time Record; Contact Information and Instructions are excluded, including from the attached snapshot.

## Live updates and Finish delivery

Authenticated SSE updates synchronize fields, assignments, contacts and saved-report changes between open pages, with reconnect and polling fallback. Local drafts and focused inputs are preserved; concurrent same-field edits still use server comparisons.

The bot process starts `briefingAutoArchive`, which now consumes explicit Finish requests from `briefing_finish`. Filling the five Arrival times alone never schedules delivery. Finish requires all five nonblank Arrival times; Gate Lead Finish requires Lead or above. The server stores a three-minute deadline, shared across reloads/devices/restarts. The blue button shows `Finish in 2:59` inside the button; Cancel is available before the deadline. Completion stores the PDF and PNG, then shows a green Completed button. Clear cancels a pending countdown. Generation and external delivery failures retry independently; completed jobs never regenerate or resend acknowledged messages.

Arrival posts its briefing PNG to Discord 1563411695936864447. Gate Lead posts only the control-sheet PNG to 1252032370920656907, excluding document preparation, contacts, boarding instructions and office-file guidance. Both save a full Briefing PDF to Drive folder 1NX1WCsYZqNvdz57J8oGb7h1yQWyt_O1S, named `YYYY-MM-DD FLIGHT ARRIVAL BRIEFING SHEET.pdf` or `YYYY-MM-DD FLIGHT DEPARTURE BRIEFING SHEET.pdf`. Gate Lead has a live PNG Preview tab. Delivery retries reuse a reserved Drive ID; ambiguous Discord sends reconcile against nonce/attachment metadata instead of blindly reposting. The old five-minute Arrival scan is disabled.

Production stops the previous fixed-time ARRIVAL spreadsheet export; the existing DEPARTURE schedule continues. The existing Google identity must have write access to the destination folder and the bot must have attachment-send/history access to the channel. Local tests mock external delivery and do not post to production services.


## Departure briefing

Departure opens MU586 with the same shared editing, live updates, directory search and drag/drop assignments as Arrival. Direction is stored with the flight/date record. Its Flight Information, F/J/Y configuration/booking/infants, calculated TTL/PLF and special passenger fields are followed by three Time Check cards and Details. Time Check uses the current Los Angeles date: +2 days, +11 days and EDATE-equivalent minus 21 years (clamping leap day).

Team Assignment switches between Counter and Gate. Counter positions A59–A68 form one vertical list; desk numbers and service labels are editable. Gate provides two boarding and two passport-check slots, plus lead/assist, pre-board, bag/boxcount, spotter, announcement, lounge/wheelchair and jet bridge. Only Gate Lead and Gate Assist have time inputs. No RADIO controls are shown. Departure reports capture both Counter and Gate and their time values; the existing scheduled spreadsheet departure delivery remains unchanged.

Three right-edge reference tabs open Membership, Important Info and Price panels, organized from the supplied operational reference. They are reference content, not external data lookups. Membership separates tiers and cabin benefits. Important Info separates name checks from document/itinerary handling. Price separates routes, upgrades and special baggage, with No Cash and the supplied special-baggage conversion rate.


Arrival Contact Information and Instructions open from English side tabs aligned to the sheet border, using the original shared contact save and per-flight instruction autosave. Membership omits ordinary/Explorer tiers; Lead and above can edit shared membership text with revision protection and audit. Config F/J/Y is editable only by Duty Manager, Business Manager, Airport/Operations/General/Regional Manager roles (including legacy Manager), with plain values for other roles. Clear preserves Config for anyone without that permission. PLF is adult F+J+Y divided by 313, excluding infants and independent of Config. Missing ETAB shows no waiting message. Cards share a consistent spacing scale, and mobile PAX Booking uses the same card frame as Flight Information.

Counter and Gate appear together on desktop (side by side when space permits); phones retain the segmented switch.


Built-in reference copy and membership tiers use English. Previously saved copies of the original bilingual membership labels are normalized on display while retaining custom edits. Arrival shows only Contact Information and Instructions tabs; Departure shows Membership, Important Info and Price, each with a distinct color. All assignment fields, including the first four Counter roles and Arrival roles, share the Search or drag employee hint for editors. Read-only views show names or an empty marker without personnel input boxes. Lead and above can rename Gate positions; labels save per flight/date and are included in archived reports.


Important Info and Price share the reference editor authorization with Membership. Lead and above may edit built-in text or add structured title/body cards; revisions reject concurrent saves and ordinary employees remain read-only. Content is rendered as text rather than stored HTML. Reference tabs stay visible below the header during scrolling. Empty duties show no dash. Departure leaves every scheduled person in the roster even after assignment, allowing the same employee in multiple roles; Arrival also supports repeated use of the same roster person.

Departure STD defaults to 1130; the departure time from ETAB, including a line labeled STD, fills ETD. The automatic departure registration follows the effective Arrival registration (including manual Arrival corrections). ETAB snapshots and automatic archive scans use the employee database that owns Briefing records, not the separate PBB operations database. The account selector uses a white aircraft on a green circle; Briefing/Schedule visibility is limited to authenticated LAX/MU scope and is re-evaluated after account switches.


The account selector now has no aircraft icon. Gate position labels use raised Counter-style badges with wrapped editable text. The left roster displays nickname when available while preserving canonical employee identity for assignments. Departure includes a blue/white GATE LEAD side tab separated from Price by one tab-height gap; it opens the Gate Lead Control Sheet.


Arrival includes a Lost and Found side panel with three tabs: Delay Bag (AHL), Damage Bag (DPR), and Baggage Pick-up Info. The supplied checklist, delivery-address requirements, MU damage handling/contact and A68 pickup location/hours are shown as reference content.

The Gate Lead panel now contains a sample control sheet. All editable entries are grouped in two top cards (Operational Times; Final PAX / Delay Announcements); Information / Instructions and Common Contacts are separate tabs, with a compact Preview tab containing only control-sheet data. Current Gate Lead and Gate Assist display from the departure assignments using their shown names/nicknames. Date, flight, gate and existing contact numbers are sourced from Briefing. Hardcopy # is omitted. Entries share flight/date autosave, concurrent-field checks and existing Lead-and-above edit permissions. The final count totals F/J/Y plus INF.


Gate Lead now shows only the two entry cards under Control Entries, with F/J/Y/INF in one row. Document preparation, boarding checks and office-file guidance are under Information / Instructions. Common Contacts uses the six numbers supplied for Gate operations. Lost and Found text is editable by Lead and above through revision-checked shared reference values; employees remain read-only.

Report snapshots capture assignment nicknames separately from canonical stored employee names, so new PDF reports and previews show the same frozen display names. Discord archive posts show `✅ document archive`; deduplication uses the nonce/attachment description and recognizes older body markers. Drive failure does not block Discord delivery. Briefing Drive uploads reuse the existing user-authorized Drive adapter, and unusable legacy service-account reserved IDs are replaced before retrying upload.

Departure PDF and HTML report previews arrange Team Assignment into parallel Counter and Gate columns. Each column keeps its own role/name rows, including multiple frozen nicknames and Gate Lead/Assist times.

Gate Lead control entries and Finish are editable by Lead and above, or employees assigned to Gate Lead / Gate Assist on today's departure briefing in Los Angeles. Server permissions check current assignments on each write; removing an assignment immediately revokes that employee's control-edit permission. This does not grant general Briefing or assignment-edit access.
