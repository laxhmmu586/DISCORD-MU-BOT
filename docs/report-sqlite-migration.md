# Report Center SQLite migration

Report Center retains Sales file downloads, Sales Details, VIP, Authorization and INAD. SPML, WCH, Misconnection and Baggage report entry points are retired. Contact submissions await Discord delivery only; they no longer persist a record or send passenger email. Baggage and Bag Room operations continue to use the existing CBS SQLite store. 240 remains Discord only.

`reportSqlite.js` stores indexed report records, per-report revisions and source fingerprints. The four retained record datasets use local transactions and keys to avoid concurrent duplicate inserts. Unchanged source batches do not write or advance revisions. Authorization remarks remain editable and are preserved across source synchronization. Client saves for one input are serialized and debounced; blur flushes the pending save.

Report reads do not synchronize Google sources. Sales Details source synchronization runs through the existing background cycle and SY refresh path; simultaneous sales synchronizations share one task. Google remains the sales input and Drive remains the Sales XLS download source. Browser report reads reuse results when the selected dataset revision has not changed.

## Import and cutover

Run `node scripts/import-reports-sqlite.cjs /absolute/private/new-reports.db` with all application writers stopped. The importer reads the four existing report tabs, preserves complete raw source values and normalized snapshots, retains duplicate historical rows under separate imported keys, excludes scan markers from displayed business rows and verifies the complete normalized records before marking the database ready. It refuses to overwrite a verified database. The normal application fails closed until import is verified.

Set `REPORT_SQLITE_PATH` to the verified database, or place it at `data/reports.db`, then restart Node and deploy Firebase Hosting. Back up the deployment revision, environment and SQLite files before cutover. Preserve Google sources unchanged. After new SQLite writes, rollback must retain the database; selecting old Sheet storage would discard subsequent changes. No automatic retention deletion is enabled for these imported reports.

## Validation

Isolated production-source import: VIP 21 business records; Authorization 1,090; INAD 116 source rows including 75 scan markers and 41 business records; Sales Details 841. Raw values and normalized records verified in transactions. No source rows changed.

Focused tests cover actual report writers, repeated and concurrent submissions, per-record updates, remark preservation and serialized browser saves, cache reuse and task merging, rollback, date/flight filters, removed buttons and Discord-only contact delivery. Existing CBS transactional tests remain passing. Browser preview with synthetic data verified the five retained buttons and the remark Saved state.

The older Google storage/layout test file contains three pre-existing Authorization PDF string assertions that also fail against the unchanged HEAD page. They are not a clean full-suite result.
