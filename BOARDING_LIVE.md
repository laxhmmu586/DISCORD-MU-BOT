# Live Scan and M-board

Scan commits to the backend's persistent store before returning success and
publishing a flight-scoped SSE snapshot. Google Sheets is the scan backup, not
the scan acknowledgement gate. Staff can continue adding NBRD in columns L:M.

## Deployment

Use **Node.js 22.13 or newer** (the store uses built-in SQLite with FULL
synchronous commits). Mount a **persistent local disk** on the API backend and set
`BOARDING_LIVE_STORE_DIR` to an absolute directory on that disk (for example
`/var/data/boarding-live` on Linux). Run **one API backend process/replica**. Do
not use ephemeral storage or a shared directory mounted by different hosts.
The SQLite writer lock rejects a second process using the same directory and
automatically releases after a process crash. Restrict
directory access: the primary store includes raw boarding-pass data.

Deploy the backend and the static `scan.html`, `m-board.html` and
`boarding-live.js` assets together. Without this environment variable the
existing Sheet-confirmed scan flow and manual board refresh remain active;
there is no false immediate acknowledgement from a memory-only fallback.
No production deployment is performed by this PR.

The first use of each supported boarding flight imports its current worksheet
and entered colors. After restart the disk snapshot remains authoritative for
scan rows; pending backups are replayed at their original row coordinates, so
a timed-out write can be safely retried. Never delete this directory to fix a
Sheet outage. Restore it alongside the backend when recovering the service.
In live mode do not clear, reorder, or delete scan rows in Sheets: it is a
backup. An operational reset must stop the service, finish pending backups and
archive/reset both the primary store and corresponding Sheet together.

## Shared request schedule

- Every 3 seconds: one `values.batchGet` reads L2:M for all initialized flight
  worksheets, then publishes only changed NBRD or freshness recovery.
- Every 6 seconds: one `spreadsheets.batchUpdate` backs up all dirty scan rows,
  infant rows and entered-color changes across flights. Idle cycles skip it.
- The timers wait for a previous operation to finish before scheduling the
  next cycle. Additional connected scanners never create additional readers.
- A page open/reconnect receives a complete cached snapshot. A refresh reads
  the primary store. Neither triggers a steady-state Sheets read.
- SSE heartbeats are sent every 15 seconds and never access Sheets.

In steady state this adds at most about 20 reads and 10 writes per minute,
before startup imports, quota retries, explicit app NBRD edits/deletes and any
other backend features. Existing shared rolling-minute limits reserve headroom
at 50 read attempts and 50 write attempts; failed attempts count and 429/403
quota responses use coordinated backoff. Startup resolves titles, initializes
missing headers and imports colors, so it costs additional requests.

Backups touch only A:E, N:R and entered color formatting in A:C. They never
overwrite the manually maintained L:M NBRD region. App-originated NBRD
write/delete operations retain their existing regular/emergency Sheet mirror
behavior; the shared reader picks their results up on its next cycle.

Manual NBRD additions take about 3 seconds plus request time to be discovered.
This is not an instantaneous Sheet change notification. If the reader has not
succeeded for more than 15 seconds, scans fail with `NBRD_UNAVAILABLE` until
it recovers rather than silently checking an indefinitely stale list.
Backup failures retain the durable pending records and retry on the next cycle;
they do not block scans while NBRD remains fresh. The board shows pending backup.

## Validation

Run `node --test test/boardingLive.test.js test/boardingLivePage.test.js
test/boardingQuotaRecovery.test.js test/boardingFlightIsolation.test.js
test/emergencyBoard.test.js` (48 tests passed).
Tests cover ten simultaneous scanners, multi-flight shared request counts,
duplicate/NBRD rejection, persistence failures, restart recovery, slow/failed
backups, stale-reader recovery, SSE browser behavior and column isolation.
These local tests do not establish production concurrency capacity or disk
durability for a hosting configuration that has not been provisioned.

Two pre-existing `scan-page.test.js` failures concern the unchanged emergency
camera page. Three pre-existing `googleSheetsStorage.test.js` failures concern
Authorization Report PDF branding. Both groups were reproduced from the
unchanged HEAD source and are outside this change.
