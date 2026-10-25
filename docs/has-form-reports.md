# HAS Form and shared reports

`has-form.html` is the Form page. Existing `request.html` links redirect and preserve the request query/hash. Workspace sidebars place Report below Form.

Report access uses the authenticated employee's primary `station` and `account`. ACCOUNT displays `station/account` (for example, `LAX/MU`), is read-only, and uses the same value in downloaded files. Additional memberships, account selectors, request parameters and caller-supplied scope never grant report access. HQ has no report access. DA permits Lead, Supervisor, Senior Supervisor, Duty Manager, Business Manager, Airport Operations Manager, Airport Manager, Interim General Manager, General Manager and Regional Manager. WWH permits Supervisor and Business Manager (including legacy Manager) only. Agent/CSA cannot access either report. The same checks protect reading, updates, import, save and download.

The toolbar contains report and month selectors and Download Excel. Changing either selector automatically saves pending edits and displays the selected report; no Load, Save or Import button is required. Table headings remain visible while scrolling. Editable fields fill the grid cells without nested borders or resize handles. WWH exposes only meaningful input cells, with one wide field per weekly comment or training comment and section-specific notes below the summary.

Numeric input fields support arithmetic, absolute/relative cell references, ranges and SUM, AVERAGE, MIN, MAX, COUNT, ROUND, IF, IFERROR and ABS within the current monthly sheet. Expressions are parsed without executing JavaScript. A focused cell shows its original expression or full precision; otherwise it shows the calculated result. WWH displays at most two decimal places while retaining the original precision for storage and calculations. DA time cells display HH:mm. Invalid expressions remain local until corrected and block saving/downloading incomplete values.

DA alternates the background color of whole days. A `+ row` control at the bottom of each day adds a line to that day, including its shared color and merged daily totals. Added lines persist, shift later cells and formula references, and participate in WWH summaries and annual downloads. Limits are 20 extra rows per day and 200 per month. A layout revision prevents a stale editor from saving values to addresses shifted by another editor's insertion.

Each Main Account has one shared annual DA workbook and one shared annual WWH workbook, with twelve monthly reports per year. Periods from January 2026 onward are supported. Monthly records remain independent across years. Changes autosave after one second; there is no manual Save button. Transient save failures retry automatically, and reconnecting the browser resumes saving. Validation errors retry after the user corrects the input; conflicting changes stay local with a visible warning rather than overwriting another editor. Downloading Excel flushes any pending changes first. Other editors receive revision notifications over an authenticated SSE connection; healthy connections do not poll. Committed saves and imports notify subscribers for the same Main Account/month/year, and DA changes also notify the corresponding WWH. The client reloads updated data when it has no unsaved local edits. Independent cell changes merge. Recent changes show the editor, time, operation and number of changed cells. The files are stored by this application; they are not hosted in Google Sheets or SharePoint.

SSE uses fetch with a Bearer header, never tokens in URLs. It rechecks Main Account and role on each push and 15-second heartbeat; changed/revoked access closes the connection. Streams reconnect at least every 30 minutes for fresh authentication. Heartbeats also reconcile revisions written by another backend process. Disconnected or stalled streams reconnect with backoff and temporarily poll every 10 seconds; reconnection stops fallback polling. Changing report/month, signing out or leaving the page closes the previous stream. Proxies must permit streaming: responses set `X-Accel-Buffering: no` and disable caching/transformation. Nginx buffering must honor that header, and upstream read timeouts must exceed the heartbeat interval. SSE still requires a functioning backend and does not repair an upstream 502 by itself.

The supplied workbooks are the 2026 design base. Existing 2026 dates and formatting remain intact. Later years regenerate DA dates, weekdays, five-row daily blocks, Monday-Sunday weekly flight counts, monthly totals and print ranges, including leap days. WWH retains its formulas and regenerates its Friday-Thursday week periods and accounting-month ending date. Core styles, hidden columns and layout are reused from the originals. Downloads named `DA_STATION_ACCOUNT_YEAR.xlsx` and `WWH_STATION_ACCOUNT_YEAR.xlsx` populate all twelve monthly tabs from the selected year's shared reports, without loading records from another year. WWH's last visible column is `# of PAXS`. Actual flights and PAX link to the same Main Account's DA using each WWH week's date range. Planned flights remain editable because DA does not contain a separate planned-flight field.

WWH exports include hidden DA source sheets and SUM formulas with current cached numeric results, so PAX totals are visible immediately before spreadsheet recalculation. The FLIGHTS HANDLED section retains its links to the monthly planned-flight, actual-flight and PAX totals. Changing a downloaded copy does not update the server. Downloading a new WWH picks up the latest saved DA. The original DA March `N152` circular formula (`SUM(N152:N161)`) is corrected to `SUM(L152:L161)`; broken DA Summary Page references are rebuilt against each month's OTP row.

Templates under `data/has-report-templates` contain no historical input values or training names. User-entered arithmetic formulas in the source WWH's weekly input fields are private data; their blank-template defaults are zero while reference-based calculations are preserved. Import restores those input expressions. Workbook text is treated as data, never instructions. Template generation and downloads remove Excel comment/VML parts that otherwise produce red corner markers, preserving styles, merged cells, formulas and visible Comments sections.

## Private existing-data import and deployment

The GitHub repository is public. Never commit source operational workbooks or the populated database. The supplied Excel data was imported locally into `data/has-reports.db` for LAX/MU (24 monthly reports). During the subsequent production repair, these 24 records were also imported into the live employee database, preserving any existing records. Private data is not part of the PR; do not repeat the import automatically on deployment.

The report store normally uses the persistent employee database. To deploy the prepared data, transfer the private `data/has-reports.db` to a persistent backend directory and set `HAS_REPORT_DB_PATH` to that absolute path before restarting the backend. Do not put it in Firebase hosting or the repository. Backend and Firebase hosting both need this PR's deployment. Do not claim production data is imported until the private DB is installed and authenticated reads are checked.

Report storage and Excel support initialize only when a report operation needs them. The permission/context endpoint does not require either. An unavailable report dependency, database or template returns a report-only HTTP 503 with `Retry-After: 30`; it must not stop Profile, Read & Sign, HAS or the rest of the API from starting. Initialization can retry after the underlying problem is corrected. A configured database's parent directory is created when needed; failures never silently switch to another database. The report service closes only database connections it opened itself.

On the backend host, run `npm ci --omit=dev` when deploying dependencies and ensure the service user can write the directory containing `HAS_REPORT_DB_PATH` (when set). Keep both template workbooks under `data/has-report-templates`. If the public API still returns Nginx 502 after deployment, inspect the actual process manager and Nginx error logs: DNS changes cannot diagnose a Node process that is not listening. The precise cause of a live outage requires those logs.

The Report-only outage after startup isolation was confirmed in the server log as `Cannot find module 'exceljs'`. ExcelJS 4.4.0 was installed in an isolated backend runtime location and linked into the existing application's module path without reinstalling native dependencies or restarting the process. Server-side checks then successfully loaded both templates and read/calculated the imported reports. Future deployments should install the declared dependencies normally and run `node scripts/check-has-report-runtime.cjs` to detect missing Excel support or templates before release.

To regenerate a private import database from authorized originals:

```powershell
node scripts/import-has-reports.cjs data/has-reports.db 'PATH/DAILY_FLIGHT_ACTIVITY_Y2026_MU.xlsx' 'PATH/WWH Report 2026_Template_MU.xlsx' LAX MU
```

The script overwrites all twelve months for the chosen Main Account and records imports. Use a fresh destination for a new migration. The authenticated monthly import API remains available for existing tooling and checks the current revision before replacing values; the page does not expose an Import Excel button.

## Verification

```powershell
node --test test/hasReports.test.js test/hasReportsCollaboration.test.js
node --test test/hasReportsStartup.test.js
node --test test/hasReportsLive.test.js test/hasReportLiveClient.test.js
node --test test/hasReportsAnnual.test.js
node --test test/hasReportCells.test.js
node test/hasReports.browser.cjs
```

The browser check uses Playwright (`PLAYWRIGHT_MODULE` may point to the bundled package) and Edge. It covers two separate editor sessions, live synchronization, Agent denial, account isolation, WWH totals, Excel download and 320/390/1440px layouts.
