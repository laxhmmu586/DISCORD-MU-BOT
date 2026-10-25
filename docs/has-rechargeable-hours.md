# Rechargeable hours

HAS Report includes a monthly Rechargeable hours report for the Main Account. The entry and all read/write/export endpoints require Supervisor or a higher operational position. Lead, Agent, unlinked and HQ profiles cannot access it. DA and WWH permissions remain as before.

The monthly page opens on SUMMARY. New charge opens the complete daily log from the supplied workbook, with the current station/account locked and a date selector. The form includes four flight/delay/time groups, recharge reasons, 37 name/hour rows and both signature areas. Saved forms can be edited, deleted or printed. Clicking a date opens its saved form or an untouched dated form. Multiple charges on one day have individual forms. Print is available before saving and from saved forms.

The monthly Excel download starts with SUMMARY and contains a dated form for every calendar day. Days without charges contain blank forms with account/date and zero totals. Additional charges use day-number suffixes. The reusable workbook retains the supplied styles, dimensions, merged cells, totals and signature labels; original example hours and employee records are excluded.

WWH sums Agent, Supervisor and manager hours by category and Friday–Thursday period: ST → regular (K), T5 → overtime (L), DT → double time (M), TRAIN → training (N). These are raw hours; existing WWH formulas apply overtime/double-time weights. Once a month's recharge report is saved, its linked cells are read-only and override older manual entries, preventing double counting. Changes and deletion recalculate the linked cells, including exports and dashboard metrics. Existing months without any recharge report retain their manual WWH inputs.

A monthly charge must use the last calendar day. Its category allocations must reconcile exactly to its charge hours across the WWH periods. For example, 124 ST hours remain on the last day in SUMMARY, while 4/28/28/28/28/8 can be allocated to October 2026's six periods. Normal charges follow their selected date.

Blank WWH training (actual and rebillable), delay count/duration, rebillable delay and cancellation fields default to numeric zero. Saved values remain intact.

Storage uses the existing scoped has_reports SQLite table, with revision conflicts and audit names/timestamps. The original source file in Downloads is untouched. There are no schema migrations or new dependencies.

Validation: `test/hasRecharge.test.js` covers permissions, scope, conflicts, monthly allocation reconciliation, WWH totals, defaults, edits/deletes and Excel round trips/layout. `test/hasRecharge.browser.cjs` covers the complete editable form, save/reload, dated blank forms, print signatures, linked WWH values and desktop/mobile layouts. Browser tests use mocked authentication and a temporary local database. Physical printers and production deployment are outside local verification.
