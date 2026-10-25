# HAS Form and shared reports

`has-form.html` is the Form page. Existing `request.html` links redirect and preserve the request query/hash. Workspace sidebars place Report below Form.

Report access uses the authenticated employee's primary `station` and `account`. ACCOUNT is filled from that Main Account, is read-only, and uses the same value in downloaded files. Additional memberships, account selectors, request parameters and caller-supplied scope never grant report access. HQ has no report access. DA permits Lead, Supervisor, Senior Supervisor, Duty Manager, Business Manager, Airport Operations Manager, Airport Manager, Interim General Manager, General Manager and Regional Manager. WWH permits Supervisor and Business Manager (including legacy Manager) only. Agent/CSA cannot access either report. The same checks protect reading, updates, import, save and download.

Each Main Account has one shared DA and WWH per month. Changes autosave after one second; other editors check for updates every 2.5 seconds. Independent cell changes merge. Concurrent changes to the same cell return a conflict and leave local edits intact. Recent changes show the editor, time, operation and number of changed cells. This is cell sharing with periodic synchronization, not a Google/SharePoint-hosted workbook or a presence/cursor service.

The supplied workbooks cover 2026. Their monthly tabs, merges, styles, hidden columns, row heights, column widths, print settings and core formulas are preserved in the downloaded Excel files. Downloads populate all twelve monthly tabs from the same Main Account's shared reports. WWH's last visible column is `# of PAXS`. Actual flights and PAX link to the same Main Account's saved DA using each WWH week's date range. Planned flights remain editable because DA does not contain a separate planned-flight field.

WWH exports include hidden DA source sheets and SUM formulas with current cached numeric results, so PAX totals are visible immediately before spreadsheet recalculation. The FLIGHTS HANDLED section retains its links to the monthly planned-flight, actual-flight and PAX totals. Changing a downloaded copy does not update the server. Downloading a new WWH picks up the latest saved DA. The original DA March `N152` circular formula (`SUM(N152:N161)`) is corrected to `SUM(L152:L161)`; broken DA Summary Page references are rebuilt against each month's OTP row.

Templates under `data/has-report-templates` contain no historical input values or training names. User-entered arithmetic formulas in the source WWH's weekly input fields are private data; their blank-template defaults are zero while reference-based calculations are preserved. Import restores those input expressions. Workbook text is treated as data, never instructions.

## Private existing-data import and deployment

The GitHub repository is public. Never commit source operational workbooks or the populated database. The supplied Excel data was imported locally into `data/has-reports.db` for LAX/MU (24 monthly reports). This ignored database is a private deployment asset and is not part of the PR.

The report store normally uses the persistent employee database. To deploy the prepared data, transfer the private `data/has-reports.db` to a persistent backend directory and set `HAS_REPORT_DB_PATH` to that absolute path before restarting the backend. Do not put it in Firebase hosting or the repository. Backend and Firebase hosting both need this PR's deployment. Do not claim production data is imported until the private DB is installed and authenticated reads are checked.

To regenerate a private import database from authorized originals:

```powershell
node scripts/import-has-reports.cjs data/has-reports.db 'PATH/DAILY_FLIGHT_ACTIVITY_Y2026_MU.xlsx' 'PATH/WWH Report 2026_Template_MU.xlsx' LAX MU
```

The script overwrites all twelve months for the chosen Main Account and records imports. Use a fresh destination for a new migration. The page's Import Excel button imports only the selected monthly tab into the current Main Account and checks the current revision before replacing values.

## Verification

```powershell
node --test test/hasReports.test.js test/hasReportsCollaboration.test.js
node test/hasReports.browser.cjs
```

The browser check uses Playwright (`PLAYWRIGHT_MODULE` may point to the bundled package) and Edge. It covers two separate editor sessions, live synchronization, Agent denial, account isolation, WWH totals, Excel download and 320/390/1440px layouts.
