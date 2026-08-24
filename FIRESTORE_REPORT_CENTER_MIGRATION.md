# Report Center Firestore storage

Report Center rows now use Firestore as the only runtime read store. The
existing Report Center Google spreadsheet rows have already been imported, so
the application no longer reads a sheet to populate Firestore and no longer
creates migration markers. The spreadsheet remains in place as a best-effort
backup: new report rows are committed to Firestore first and are then appended
to the matching sheet tab.

Collections use the `reportCenter_` prefix by default:

- `reportCenter_vip`
- `reportCenter_psmMsg`
- `reportCenter_inad`
- `reportCenter_wheelchair`
- `reportCenter_salesDetails`

Set `REPORT_FIRESTORE_COLLECTION_PREFIX` to change the prefix. Firestore uses
the existing `FIREBASE_PROJECT_ID`/`GOOGLE_CLOUD_PROJECT`,
`FIRESTORE_DATABASE_ID`, and Google service-account credentials.

If a backup append fails after Firestore succeeds, the API continues to serve
the saved Firestore row and logs the sheet error. Existing spreadsheet data is
retained as backup data, but is not used to populate Report Center reads.
