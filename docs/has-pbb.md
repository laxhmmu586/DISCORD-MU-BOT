# HAS Jet Bridge Arrival

`/has-pbb.html` is the independent HAS arrival workflow. The original `/pbb.html`, its question data, PDF template and Discord delivery remain unchanged. `pbb.js` only registers and closes the new service alongside the existing services.

## Employee setup

Employee Administration adds Station, Account, PBB ID and PBB valid through. Profile displays these fields as read-only. Only existing employee administrators may update them. Existing employee records without affiliation are persisted as LAX / MU during employee database initialization. Later administrator edits survive restarts. No credentials are invented for existing drivers.

HAS Driver requires the existing Attach qualification, a PBB ID, and a valid expiry date including the final date shown. Expiry uses the existing application's Los Angeles business date and is checked on every Driver mutation. Expired dates appear red in Profile and HAS, with a cannot-drive warning. This new qualification rule applies to HAS; legacy PBB behavior is retained.

## Shared workflow

Confirm flight and gate, choose L1/L2/L3, answer the illustrated pre-movement questions using YES or NO, and choose Ready to move or Not ready. All ordinary checks must be YES to declare Ready. Both Ready states synchronize over authenticated SSE and may be changed before movement. Spotter signs independently. With both Ready states and the Spotter signature, Driver starts movement. The moving animation and height/clearance references remain available, with an automatic horizontal slide every 4.5 seconds and no title/counter/Auto control strip. Driver explicitly answers the floor-position question from the supplied Word reference before confirming docking, answers the four after-docking questions, and signs. Both signatures automatically submit and trigger PDF archival.

Records are unique per station/account/business date/flight/bridge. Every read, change, PDF download, retry and SSE subscription enforces the employee's saved affiliation. A user cannot supply another station/account to enter that scope. Roles become assigned on their first saved action, require distinct employees, and use the canonical linked employee identity. Record revisions reject stale simultaneous edits. Signed records survive refresh and server restart; completed records are locked.

## Archival and dashboard

HAS stores its own records and PDFs in `has_pbb_records` in the existing PBB SQLite database. The generated PDF follows the supplied `ARR TEST JB CHECKLIST 2026 rev2.docx` as a one-page Hallmark form, retaining its logo, metadata table, section order, checklist rows, incident note and two signature rows. The retained source and design evidence are in `assets/has-pbb/`. Application responses and recorded Ready/movement confirmations populate the form; the audit JSON retains the detailed saved state. Block Time is left blank because it is not collected. It sends no Discord messages. `HAS_PBB_DRIVE_FOLDER_ID` optionally sets the destination; otherwise the configured PBB folder is reused. Existing Drive authentication is reused. Stable file IDs, retry and startup recovery prevent duplicate uploads. Failed uploads remain visibly failed and can be retried without losing the submitted checklist.

`/has-pbb-dashboard.html` and its API are restricted to the verified `lake@mu.com` account. The default range is seven days, with one expected arrival flight per station/account daily. Separate Station and Account selectors support individual scopes, all accounts at a station, all stations for an account, and an overall view. Date ranges up to 93 days and a per-station/account breakdown are supported. It distinguishes unique flights submitted, bridge checklists submitted, in-progress checklists and successful Drive uploads. A submitted flight means at least one bridge checklist has both signatures; other bridges count separately. The dashboard refreshes every 30 seconds.

## Imagery

Existing PBB photographs and height/clearance references are reused. New gate, cable stowage, aircraft-stop and crew-acknowledgment SVG diagrams supplement missing illustrations. The equipment question uses `has/public/assets/pbb/has-equipment-realistic-v3.webp`, generated with the built-in ImageGen tool and optimized for the web. Its final prompt is preserved in [has-pbb-equipment-image-prompt.md](has-pbb-equipment-image-prompt.md).

## Verification

Run `node --test test/hasPbb.test.js test/employeeDatabase.test.js test/employeeProfiles.test.js test/employeeAdminPermissions.test.js test/pbb*.test.js` for service, migration and legacy PBB regressions. `scripts/verify-has-pbb.cjs` uses Playwright with Edge (override `HAS_BROWSER_CHANNEL` if needed) to verify paired Driver/Spotter browsers, readiness changes, independent signatures, movement refresh, after-docking references, automatic submission, expired credentials, lake-only dashboard and 320/390/1440 layouts. It uses fictional employees and a simulated Drive adapter; it does not contact production Drive or Discord. Profile and Administration browser verifiers cover their existing flows.

The migration runs when the updated server initializes the employee database. Local tests do not change the hosted employee database, publish the new pages or prove live Drive delivery. Frontend and backend must be released together.
