# Google Sheets storage

The application uses Google Sheets as its only operational data store. It does
not initialize, read, or write Cloud Firestore.

## Sheet mapping

- Report Center (`VIP`, `PSM/MSG`, `INAD`, wheelchair, and sales details) reads
  and appends rows in the spreadsheet selected by `REPORT_SHEET_ID` and the
  corresponding report sheet GID settings.
- Passenger-filed CBS cases use `CBS_SHEET_ID` / `CBS_SHEET_GID`.
- Wrong-baggage cases use `CBS_SHEET_ID` / `WRONG_BAGGAGE_SHEET_GID`.
- On-hand cases use `CBS_SHEET_ID` / `CBS_UNRESOLVED_BAGGAGE_SHEET_GID`.
- WorldTracer/RUSH cases use `CBS_SHEET_ID` / `CBS_WORLDTRACER_SHEET_GID`.
- Missing-bag reports use `CBS_SHEET_ID` / `CBS_MISSING_BAG_SHEET_GID`.

Writes are considered successful only after the Google Sheets API call
succeeds. Row numbers returned by Sheets are used as the identifiers for later
updates, acknowledgements, linking, and case actions.

Firebase Hosting and Firebase Authentication may still be used by the web
application. The Firebase Hosting configuration contains no Firestore database,
rules, or index deployment configuration.
