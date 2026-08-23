# Report Center Firestore storage

Report Center rows now use Firestore as the primary data store. On the first
read of each report type, existing rows in the Report Center Google spreadsheet
are copied into a dedicated Firestore collection and a migration marker is
recorded. The spreadsheet remains in place as a best-effort backup: new report
rows are committed to Firestore first and are then appended to the matching
sheet tab.

Collections use the `reportCenter_` prefix by default:

- `reportCenter_vip`
- `reportCenter_psmMsg`
- `reportCenter_inad`
- `reportCenter_wheelchair`
- `reportCenter_salesDetails`

Set `REPORT_FIRESTORE_COLLECTION_PREFIX` to change the prefix. Firestore uses
the existing `FIREBASE_PROJECT_ID`/`GOOGLE_CLOUD_PROJECT`,
`FIRESTORE_DATABASE_ID`, and Google service-account credentials. The existing
`CBS_FIRESTORE_ENABLED=false` switch also disables this Firestore adapter and
falls back to reading the legacy sheet.

If a backup append fails after Firestore succeeds, the API continues to serve
the saved Firestore row and logs the sheet error. Existing spreadsheet data is
not deleted by the migration.
