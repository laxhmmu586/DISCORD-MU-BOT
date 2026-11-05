# CBS comments and HAS report editing

Baggage creation comments are saved as standard CBS `comment` events with the original author and timestamp. They appear in the existing Comment section and use its existing deletion action.

`scripts/backfill-cbs-baggage-comments.cjs` previews older missing creation comments by default. Use `--apply --backup=/private/path/cbs-before-comments.db` for an explicit SQLite repair. Matching requires the same tag, flight, date and direction; existing identical comments are retained without duplication, and other events are preserved. No automatic backfill runs on reads or startup, so deleted comments remain deleted.

On 2026-11-05, the Oracle CBS database was backed up privately and 43 missing creation comments were restored. A repeat preview found zero outstanding matches, and a public API read confirmed the reported example now has its original comment. The application code and Hosting changes in this PR have not been deployed.

WWH C5:C10 (Contracted Hours daily) are editable even when the original template uses a cell-reference formula. Missing active-week inputs inherit the previous month in the same account, with the previous final active week supplying an extra week. Explicit edits, blanks and zeroes are retained. Saving freezes all daily contract-hour inputs for that month. The same values are used in the editor, dashboard and annual Excel export.

The four Safety/HR Word reports place their action buttons to the right of the title, wrapping on narrow screens. The Expense Report title and period have top and side spacing from the toolbar and frame.

Validation: 41 focused server/storage/formula/export checks passed. Browser checks passed at 320, 390 and 1440 pixels for the report headers and expense layout, including WWH inheritance/edit/save/reload and Word exports. The CBS source-text suite has 30 existing failures, reproduced unchanged against origin/main.
