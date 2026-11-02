# CBS SQLite migration and traffic review

Scope: CBS cases, Wrong Baggage, On-hand/Not Load, Rush, Missing Bag, damage images, and shared Baggage/Misconnection records. CBS retention remains **two calendar years**, following the final user correction. Report Center's other datasets remain on their existing storage. 240 is Discord-only; its obsolete Sheet writer and unused FULL-sheet lookup are removed.

## Production recovery and count cards — 2026-11-01 (Los Angeles)

After PR #1826 was deployed without the final import, the live CBS database had zero imported workbooks and zero rows. The service was briefly stopped to prevent writes, the empty database was backed up privately, and the final source import verified 2 workbooks, 10 tables and 1,449 rows. The service was restarted; public Open, Closed, Bag Room and Rush API reads returned HTTP 200 with data. No Google source rows were modified by the importer.

All three case-count cards remain visible without downloading unopened modules. The existing small revision response now includes Open totals and Closed totals by month for Passenger Filed, On-hand and Bag Room. Counts are recomputed once per database revision from the same normalized records used by the lists, including historical event statuses and timestamps; ordinary revision checks reuse the cached totals. Bag counts use the same archive rules, Office/type exclusions, tag deduplication and independent No Tag rows as the lists. Selecting a closed month updates all three counts, while list bodies still load only for the selected module.

Schedule profile dialogs hide scrollbar chrome while retaining native wheel/touch scrolling. The embedded document no longer creates a second scroll surface; the background page is locked while a profile is open. Both manager and read-only cards close on an outside click while clicks inside remain open. Desktop and mobile browser fixtures verified these behaviors and the three count cards without requests for unopened lists.

## Findings and measurements

Production was running `acf6a754`. A read-only source snapshot was imported into an isolated Oracle test database: **2 workbooks, 10 tables, 1,449 source rows**, verified against SHA-256 digests of the imported values. No production database, active writer, Hosting deployment, or PM2 service was switched. The test database was about **1.61 MiB**; the server had about **39 GiB** free at inspection. Row counts include headers and image chunks, not just cases.

Measured on that staging snapshot using the production Node 20 runtime (milliseconds; storage/parsing only, excluding HTTP/TLS, browser rendering, Discord and Gmail):

| Reader | Records | JSON bytes | First call | Warm call |
| --- | ---: | ---: | ---: | ---: |
| Passenger cases | 49 | 387,229 | 26.20 | 5.87 |
| Wrong Baggage | 0 | 2 | 0.49 | 0.01 |
| On-hand, including resolved | 162 | 331,299 | 2.54 | 1.39 |
| Rush | 85 | 23,288 | 0.99 | 0.16 |
| Missing Bag response | — | 78,589 | 1.13 | 0.30 |
| Misconnection | 20 | 4,536 | 0.46 | 0.33 |
| Baggage report default page | 20 | 78,498 | 26.92 | 32.47 |

After module/view filtering on the same snapshot:

| Requested module | Records returned | JSON bytes |
| --- | ---: | ---: |
| Passenger Open (default entry) | 1 | 8,111 |
| Passenger Closed, latest available month | 25 | 226,046 |
| On-hand Open | 0 | 11 |
| Bag Room Open | 11 | 25,349 |

Default entry therefore downloads about **8 KB** of passenger data in this snapshot rather than all four lists. Closed history is not transferred until selected. Sizes vary with live data and include no reverse-proxy compression. The small version/attention response is additional.

The four CBS lists total roughly **820 KB before compression**, excluding response wrappers. The Baggage reader still parses its retained rows before returning a page; warm calls are not guaranteed to be faster than cold calls. These are a small snapshot benchmark, not a concurrency/load guarantee.

## Read and write frequency

| Operation | Previous behavior | New behavior |
| --- | --- | --- |
| Dashboard entry | Four complete list requests; shows Loading | Loads only the selected module (Passenger Filed by default), using its session cache when present; Closed, On-hand, Bag Room, Rush and Missing Bag stay unloaded until selected |
| Unchanged open dashboard | Timer every 30 s; with SSE connected, complete four-list reconciliation about every 90 s | One small revision GET every 60 s while visible; zero complete list downloads when unchanged |
| Return to visible page | Normal loading/reconciliation | One revision check; unchanged cache remains visible |
| Actual update | SSE invalidation and four full list requests | SSE triggers a small version check; only the active, changed module refreshes. Open and Closed versions are separate, preserving unchanged archive/Rush caches |
| Manual Refresh | Forced remote reads | Reloads only the active module; Closed fetches one selected month |
| Sheet cache | Mostly 30 s caches, including empty main case list; other readers vary | Existing parser caches remain; underlying CBS storage is local SQLite |
| User save | Header reads and one/multiple Sheets API writes | Same HTTP action; synchronous SQLite commit before success; unchanged row writes do not bump revision |
| Batch writes | Multiple remote operations for related rows | Existing multi-row append/batch calls run as local transactions; concurrent exported case mutations are serialized |
| Retention | Two-year checks during several list reads, deleting/renumbering sheet rows | Daily local sweep on first access, plus existing date checks; deleted rows leave stable ID gaps |
| 240 submission | Sheets metadata/header read + append, then Discord | Direct Discord send only; send failure returns failure |

The cache is tab-scoped `sessionStorage`, survives same-tab navigation/reload, and expires after two hours. It is best effort if browser storage is full. The two-hour expiration is measured since the most recent successful cache/version update. It is not a shared cache across browsers, tabs, domains or devices. Offline cached data is labelled offline. Hidden pages skip polling and catch up when visible. SSE keep-alives remain every 15 seconds, with very small payloads. Version checking is a small local SQLite revision lookup, not a Google request. Content-version hashes and attention flags are recomputed once when the database revision changes and reused for subsequent checks; they are not full table scans on every minute tick.

Before this change, an unchanged connected dashboard could transfer approximately `40 × 820 KB = 32.8 MB/hour/user` in uncompressed JSON, or around 262 MB per eight-hour shift. Without an SSE connection the 30-second fallback could approach 98.4 MB/hour. With the new behavior, unchanged content transfers no full lists: 60 small revision responses/hour plus transport headers and SSE heartbeats. Actual wire usage depends on reverse-proxy compression, HTTP/TLS reuse and user activity. The final implementation goes further: Passenger Open/Closed, On-hand Open/Closed, Bag Room Open/Closed, Rush, Missing Bag and Shipment have separate content versions. An Open edit does not invalidate an unchanged Closed or Rush module. Only the currently selected, changed module downloads data; the other changed modules reload on their next visit. Closed downloads are limited to the selected month. Shipment explicitly loads its two contributing datasets. Tiny missing-report/Rush attention flags remain in revision metadata, so lazy loading does not remove sidebar warnings. Cross-module matching badges receive minimal identifiers rather than entire related lists.

There is no artificial delay to accumulate unrelated user saves: network write batching is no longer needed to avoid Sheets quota. Preserve existing multi-row submissions and commit them together; acknowledge only durable writes. Email/Discord/Drive archive lookups remain external services and can still dominate the end-to-end time. Their data is not moved by this PR. Background PNR miss/retry behavior remains intact.

The shared Baggage and Misconnection functions also serve Report Center: those two views naturally read the same migrated records, avoiding a stale second copy. Sales, VIP, SPML, Authorization, INAD and WCH report storage is not migrated.

## Would moving report.html cause huge server traffic?

SQLite runs on the same server as Node, so database reads/writes do not create off-server database network traffic. Browser result downloads, uploaded attachments and report exports determine external traffic. Moving storage does not inherently increase those result sizes. The current Report UI runs on user searches, flight changes and selected report modes; it is not a 30-second four-list dashboard poll. Authorization remark saves are debounced by 600 ms. Some source report readers currently read whole Sheets before filtering; a future migration should use indexed date/flight queries and pagination instead.

Illustrative uncompressed response traffic, **not measured user demand**:

| Searches/day | Average result | Response traffic/day |
| ---: | ---: | ---: |
| 100 | 200 KB | 20 MB |
| 1,000 | 200 KB | 200 MB |
| 10,000 | 1 MB | 10 GB |

The first two examples are modest in bandwidth terms; actual Oracle egress allowance and peaks must be checked against the account's current plan and logs. No claim about free-tier limits is needed for this implementation. Large repeated whole-history downloads, PDFs/images and unbounded exports are the risks, rather than SQLite itself. A future report migration should index `(report_type, flight_date, flight_no)`, filter/page on the server, batch imported rows in transactions, maintain per-dataset revisions, compress responses, and keep images out of list JSON. No report migration is included here.

## Cutover procedure

1. Back up the current deployment and SQLite databases using SQLite online backup. Keep the Google source unchanged as a point-in-time reference. The staging snapshot made while production was writing is for verification only, not a cutover snapshot.
2. Deploy the reviewed code with `CBS_STORAGE=sheets` temporarily, or keep it stopped until the final import is ready. Schedule a short write maintenance window: stop every writer to the migrated tabs, including PM2 and any external Sheet editor/integration. Do not allow writes during import.
3. From the server application directory with its existing credentials, run `node scripts/import-cbs-sqlite.cjs /absolute/private/path/new-cbs.db`. The importer makes read-only Google requests, preserves source row positions, imports all selected tables in a transaction, refuses to overwrite existing imported data, and verifies all tables. It prints only aggregate counts. An incomplete/failed verification must not be activated.
4. Set `CBS_SQLITE_PATH` to the verified database and `CBS_STORAGE=sqlite`; restart Node and deploy Hosting assets including `npm run has:build`. No automatic fallback writes or dual writes to Sheets occur. A missing import fails closed rather than presenting an empty database as a successful migration.
5. Verify lists, existing links/images, a reversible case edit, cross-group roster reorder/Undo and employee profiles. Validate 240 in a test Discord channel only if an actual test send is authorized; automated tests mock Discord.
6. After SQLite receives new writes, do **not** roll back by simply selecting Sheets: that would hide post-cutover changes. Roll back the application while retaining the SQLite adapter/database, or reconcile/export new changes first. Keep private backups outside Hosting and Git.

Reproduce the read benchmark only on a disposable copy: `node scripts/benchmark-cbs-sqlite.cjs /absolute/path/staging-cbs.db`. The first access can apply the two-year cleanup to that copy.

## Validation

- 98 focused tests passed on Oracle's production Node 20 runtime, including SQLite persistence/retention, concurrent case edits, rollback of a multi-row failure, Open/Closed cache isolation, lazy module navigation, Schedule ordering/Undo/profile access, approvals and mocked 240 delivery.
- The broader related run had 346 passes and 35 failures. Comparison with the unmodified production commit found no new failures; the baseline had 36 failures, one of which was an obsolete browser-cache assertion updated for the requested behavior. The remaining failures are existing source/layout expectations, not a clean full-suite result.
- The source snapshot import was verified separately. No real test Discord/email was sent, and production was not cut over.
