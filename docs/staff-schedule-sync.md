# Staff Schedule and Live Schedule synchronization

The Schedule module uses the existing employee database and the same Google workbook as the ETAB schedule reader: spreadsheet `12NH3eQTx6GuOWHWgi4kxI0UsKgaJXW_ceKDnMGF3Zlo`, worksheet gid `1378812072` (currently **Live Schedule**). It never writes the hidden Radio log tab.

## Access and views

Only eligible LAX / MU employees can open Schedule. DEMO HAS and HAS OPS RAMP are excluded from access, the roster, coverage and cost calculations. Ordinary employees and Leads receive only their own assignments, code and public date appearance. Supervisor and higher operational titles can edit the team and view Coverage details, budgets and sync controls.

The live view begins today and extends through the stored/source horizon. History requests return a single calendar month. Add next month completes the last partial calendar month or appends the next full month; it does not duplicate employees or create another workbook. The current employee code is independent of EID.

Deploy frontend and backend together. The updated frontend requires Schedule schema version 2 and displays a pending-update message against an older backend, including in a preview that still uses the production API.

## Period calculation

Every period runs Friday through Thursday. A visible partial period still uses all seven days from storage, including days folded out of the live view or outside the selected history month.

Daily Hour is `D×8 + C×4 + CL×8 + A×4 + GS×4 + BL×8 + B×4 + FL×8 + F×6 + Q×4`. Management counts D only. K, EC, rest, vacation and other source annotations do not add hours under this formula. The period estimate is the sum of seven daily totals **plus 40 once**. An empty period therefore totals 40, not 280. The period budget sums its seven editable daily budgets, initially 61 each (427 per period).

Holiday, Double pay and other date labels are appearance metadata; they do not silently change the user-specified hours formula.

## Source mapping and bounded writes

- Read the actual date serials in row 2, employee names in B, and employee codes in A. Match names/nicknames against existing private employee records; do not create employee accounts from Sheet rows.
- Synchronize assignment text and background colors. `G` in the Sheet maps to `GS`, `x` to `X`, and the vacation emoji to `VAC`. Retain supported source annotations and persist their legend definitions for use after synchronization is disabled.
- Store custom date color on the row-2 date cell. Store labels in a `[MU_SCHEDULE_DATE]` JSON segment in that cell's note, preserving unrelated note text.
- The currently blank row after DAILY HOUR (row 64 in this workbook) stores per-date website budgets when edited. A budget edit populates the seven values for that period and changes only its period-budget anchor to `SUM` those values. The existing summary and flight schedule rows are not deleted or moved.
- When assignments are written, refresh that period's coverage and Daily Hour formulas using the specified weights, including Q×4; the original workbook formula omitted Q. Its period estimate uses `SUM(daily hours)+40`. Appended months receive date headers, matching statistics/formulas, budgets and Friday boundaries.
- Writes target only mapped cells/formula anchors on Live Schedule and use atomic Sheets batches. Never replace the workbook or rewrite other tabs.

## Synchronization lifecycle

The existing Sheets service account is used by default with the spreadsheets scope; it needs editor access for website writes. `STAFF_SCHEDULE_AUTH_MODE=drive` (or the existing `ETAB_SCHEDULE_AUTH_MODE=drive`) can reuse the configured PBB Drive OAuth refresh token. It does not use Gmail tokens or request new interactive grants. No credentials are included in source or responses.

Synchronization defaults on. The backend polls every 60 seconds and uses a cached pull before edits and a fresh source check before writes; the visible client also refreshes while idle. Managers can use Google Sheet settings to sync now or disable synchronization. Disabling preserves the website's imported schedule, appearance and horizon. Re-enabling imports current Sheet values while retaining queued website edits.

Website mutations, their revisions and the write queue are committed together in SQLite. Sheet writes are debounced and rate limited (normally no more than one flush per ten seconds), and the UI polls the small status endpoint until readback verifies them. Failed or uncertain writes stay queued and are verified by readback. A first import backs up pre-existing local day JSON in `staff_schedule_import_backup`. Last-observed source values are retained in `staff_schedule_sync_base`; observed concurrent Sheet changes stop conflicting write batches. Explicit conflict controls select the Sheet or website version. A batch paste is validated before any local cells change.

Google Sheets has no compare-and-swap range write in this integration. An external edit made between the last source read and the atomic write can still race; the stored baseline checks catch changes observed before that write. Multiple website requests are serialized and use revision checks.

## Validation

Run the `staffSchedule`, `staffScheduleSummary`, `staffScheduleRoster`, `staffScheduleGrid` and `staffScheduleSync` Node tests. The browser regression covers desktop/mobile layouts, today's first column, monthly history, future scrolling/month extension, Friday boundaries, full-period calculations, inline duty selection, double-click color editing, date labels, copy/paste, sync controls, code/EID isolation, exclusions and a collapsed legend.

Live source metadata, sample rows, colors, serial dates and formulas were inspected through the connected Google Drive tools during development. Write/append/retry/conflict behavior is tested against an injected Sheets transport; development verification does not modify the production workbook.
