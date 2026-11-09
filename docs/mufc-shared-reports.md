# MUFC shared LAX/MU reports

MUFC Report Center links to **Weekly & Monthly · LAX/MU** at `/mufc-report.html`.
This editor offers only DA, WWH and Rechargeable hours, subject to the same
employee role permissions as HAS Station. It contains no account switcher.

The page reuses the HAS report editor, formulas, spreadsheet exports, grid tools
and revision-conflict handling. Its `/mufc-report-api` entry point is normalized
to the existing HAS report handlers and fixes the account to LAX/MU on the
server. A supplied workspace account cannot redirect these requests. Employees
must already have LAX/MU membership or the existing owner privilege; this entry
point grants no new report role permissions.

Both sites read and save the same `has_reports` records keyed by LAX/MU, report
kind and month, in the existing report database. No replication job, second
database or data migration is introduced. HAS Station keeps its other accounts
and reports. DA and Recharge continue to feed WWH's existing calculations.
Excel exports use those same saved records.

DA/WWH retain their live revision stream and polling fallback. Recharge checks
for remote changes every ten seconds and on window focus. It defers refreshing
while a charge dialog is open, the user is editing the summary, or local writes
are in progress, so it does not discard unsaved input. Stale writes are rejected
by the existing revision checks.

The desktop server and navigation packaging patch include the new report page
and route legacy `/has-report-api` calls through the same fixed-account MUFC
endpoint, supporting context, DA, WWH and Recharge only. Existing flight report
tabs remain available.

Deploy the backend and hosting build together (`npm run has:build` builds the
HAS assets). Desktop users also need a release/update built with the updated
desktop server/navigation sources. This source change does not install, publish
or migrate a running desktop release and does not modify production records.

Checks: `test/mufcSharedReports.test.js`, `test/mufcReportProxy.test.js` and
`test/mufcSharedReports.browser.cjs` cover account boundaries, shared writes in
both directions, conflicts, DA/Recharge-to-WWH calculations, exports, live
updates, restricted desktop routing and desktop/mobile layout.
