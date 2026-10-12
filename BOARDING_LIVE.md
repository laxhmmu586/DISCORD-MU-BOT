# SQLite boarding and NBRD

The boarding API uses the supplied better-sqlite3 scans table and UNIQUE index
on flight_date, flight_no, boarding_no. db.js creates data/boarding.db and its
parent directory automatically, with WAL, synchronous=NORMAL and a 3000ms busy
timeout. Node.js 20.20.2 or newer and better-sqlite3 11.10.0 are supported.
Run npm ci on the Oracle server to install the native dependency for that host.

## Current workflow

Scan -> existing parser/validation -> synchronous SQLite transaction -> SSE
snapshot and immediate success response. There are no Google Sheets calls,
backup timers or per-device readers in boarding scan, NBRD or board operations.
A failed database transaction returns an error without publishing success.
SQLITE_CONSTRAINT_UNIQUE returns HTTP 409 with code DUPLICATE_BN. Regular and
emergency devices use the same primary scans and NBRD source, isolated by
flight and flight date. Infant keys use an INF prefix so the pre-existing adult
and infant numbering spaces remain separate under the exact supplied index.

Supported departures are MU586, MU9586, MU578 and MU9578 for both ordinary
and emergency scanning.

The companion boarding_scan_details table stores seat, raw barcode, infant
status and entered colors without changing the provided scans schema. Raw
barcode data is excluded from SSE snapshots. The synced column remains present
and new scans retain 0; no worker changes it to 1 because Sheets backup was
removed at the user's request. backupPending is false in UI responses.

## NBRD

FB-derived CKIN NBRD gate comments are written directly into boarding_nbrd during
SY and passenger searches. Offloaded passengers are excluded. The existing
Add NBRD endpoints also write this table. Both board views share it. Adding an
NBRD for an already boarded adult consults SQLite, not Sheets, and initially
marks the NBRD resolved. Subsequent explicit pending/resolved actions persist.
Repeated FB updates retain staff resolution and manual entries; stale source
versions are rejected. Empty source snapshots do not remove stored NBRD.

The selected flight/date's `pd*,ckin/nbrd` list is also imported during searches.
Numbered passenger rows provide BN ownership; `+` page continuations preserve
that ownership across PN/PF headers. Revisited page fragments without an owner
are ignored. Bare `CKIN NBRD` is retained, and repeated lists insert only missing
BNs without changing existing comments or resolution. Separate terminal files,
other commands, flights and dates cannot share passenger ownership.

The original two-stage NBRD confirmation remains scoped to the exact boarding
pass, flight, date and current detail. Confirmation resolves NBRD atomically
with the scan INSERT. A changed detail invalidates the old confirmation.
All NBRD and entered-color mutations broadcast immediate SSE snapshots.
Both M-board pages provide a confirmed manual-clear button below Infant Scan.
It clears only the selected flight/date (adult/infant scans, NBRD, source
versions and confirmation challenges); other flights and the 07:00 cutoff
remain intact.

## Deployment

Run one API process for this database and in-process SSE broadcaster. Retain
the data directory across code updates; do not delete boarding.db as part of
deployment. Existing production scans and the provided UNIQUE index are reused.
Previous Sheets records are not automatically imported or cleared. SQLite is
the primary record store. At 07:00 America/Los_Angeles each day, one SQLite
transaction clears ALL scans, scan details/entered states, NBRD and source
versions across every flight and date. It retains the schema and database file.
The schedule follows DST: 14:00 UTC in summer and 15:00 UTC in winter.
Cleanup also clears confirmation challenges and broadcasts empty SSE snapshots.
A persisted maintenance marker catches a missed cutoff after restart. A failed
cleanup rolls back every table and retries; no partial reset is published.
Database, WAL and SHM files are ignored by Git. No BOARDING_LIVE_STORE_DIR or
persistent-volume environment variable is required on the existing Oracle host.

## Verification

node --test test/boardingSqlite.test.js test/nbrdConfirmation.test.js test/boardingLivePage.test.js

Tests exercise ten concurrent callers with actual better-sqlite3, INSERT-based
duplicate detection, adult/infant and date/flight isolation, failed transaction
rollback, SSE callback failure, FB/Add NBRD, confirmation/reopening/deletion,
SQLite-based boarded detection, reopening an on-disk database, the actual scan
handlers, absence of Sheets calls, page script parsing, 10 concurrent HTTP
scans with an SSE viewer, 07:00 all-flight resets, DST, missed-cutoff restart
and failed-cleanup rollback. Local tests do not
constitute deployment verification on the Oracle production server.

## Changed files

- db.js: supplied SQLite schema, automatic data directory creation.
- boardingSqliteLive.js: synchronous scans, UNIQUE handling, shared NBRD, entered states, SSE and atomic daily reset.
- boardingNbrd.js: FB CKIN/NBRD extraction.
- boardingCleanupTime.js: next 07:00 Los Angeles cutoff, including DST.
- index.js: SQLite boarding endpoints, FB/Add NBRD integration and reset timer.
- boardingContext.js: include MU9578 in the supported boarding flights.
- cbsScanParser.js: recognize MU9578 ordinary/emergency boarding passes.
- nbrdConfirmation.js: clear old challenges at daily reset.
- public/public/scan.html: apply live NBRD rows to existing bubbles.
- public/public/m-board.html: local boarding status, resolved-NBRD display and manual clear below Infant Scan.
- public/public/m-board2.html: shared SSE, deferred rendering during mutations and the same scoped manual clear.
- public/public/index.html: update the NBRD persistence error text.
- package.json: exact better-sqlite3 dependency, Node.js version and native install approval.
- package-lock.json: lock the SQLite dependency tree.
- .gitignore: exclude database/WAL/SHM files.
- test/boardingSqlite.test.js: SQLite, NBRD, HTTP/SSE, all-flight and daily-reset regressions.
- test/emergencyBoard.test.js: update migrated endpoint expectations.
- BOARDING_LIVE.md: describe the final SQLite-only behavior and deployment.
