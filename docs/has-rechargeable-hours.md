# Rechargeable hours

HAS Report includes a monthly Rechargeable hours report for the Main Account. The entry and all read/write/export endpoints require Supervisor or a higher operational position. Lead, Agent, unlinked and HQ profiles cannot access it. DA and WWH permissions remain as before.

The monthly page opens on SUMMARY with Date / Flt #s and grouped Agent / Supervisor / Duty Manager headers, matching the reference. Flight cells can be edited directly, including on days without charges, and save with revision checks. A TOTAL row sums all twelve hour columns. Positive recharge values are green; zero values remain white in the browser and Excel. New charge opens the complete daily log from the supplied workbook, with the current station/account locked and a date selector. The form includes four flight/delay/time groups, an optional multiline recharge reason to the right of its label, 37 name/hour rows and both signature areas. Saved forms can be edited, deleted or printed. Clicking a date opens its saved form or an untouched dated form. Multiple charges on one day have individual forms. Print is available before saving and from saved forms.

The monthly Excel download starts with SUMMARY and contains a dated form for every calendar day. Days without charges contain blank forms with account/date and zero totals. Additional charges use day-number suffixes. The reusable workbook retains the supplied daily form structure and signature labels; the reason box is positioned to the right of its label, the supervisor heading stays on one line and the REASON area is narrower. Exported input boxes, merged edges and numeric cells receive explicit borders, including cells with green fills. Original example hours and employee records are excluded.

WWH sums Agent, Supervisor and manager hours by category and Friday–Thursday period: ST → regular (K), T5 → overtime (L), DT → double time (M), TRAIN → training (N). These are raw hours; existing WWH formulas apply overtime/double-time weights. Once a month's charge form is saved, its linked cells are read-only and override older manual entries, preventing double counting. Changes and deletion recalculate the linked cells, including exports and dashboard metrics. Editing only summary flights does not activate charge links or overwrite manual WWH inputs. Existing months without a saved charge retain their manual WWH inputs.

A monthly charge must use the last calendar day. Its category allocations must reconcile exactly to its charge hours across the WWH periods. For example, 124 ST hours remain on the last day in SUMMARY, while 4/28/28/28/28/8 can be allocated to October 2026's six periods. Normal charges follow their selected date.

Blank WWH training (actual and rebillable), delay count/duration, rebillable delay and cancellation fields default to numeric zero. Saved values remain intact.

Storage uses the existing scoped has_reports SQLite table, with revision conflicts and audit names/timestamps. The original source file in Downloads is untouched. There are no schema migrations or new dependencies.

Validation: `test/hasRecharge.test.js` covers permissions, scope, conflicts, monthly allocation reconciliation, WWH totals, defaults, edits/deletes and Excel round trips/layout. `test/hasRecharge.browser.cjs` covers the complete editable form, save/reload, dated blank forms, print signatures, linked WWH values and desktop/mobile layouts. Browser tests use mocked authentication and a temporary local database. Physical printers and production deployment are outside local verification.

Monthly allocation guidance shows the allocated and charged totals for each category. Validation reports both totals and explains how to reconcile them or turn off Monthly charge for an ordinary daily charge.
