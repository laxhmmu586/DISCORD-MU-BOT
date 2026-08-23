# CBS Firestore migration

Firestore is the primary read store for CBS. On the first read of each CBS
collection, a migration marker is checked and the legacy Google Sheet is
batch-imported exactly once. Subsequent reads come from Firestore. Writes are persisted to
Firestore and retained in Google Sheets as the operational backup/report.

## Required runtime configuration

The existing Google service account must have `roles/datastore.user` on the
Firebase project. The defaults target the existing `china-eastern` project and
the named `laxmufc` database:

```env
CBS_FIRESTORE_ENABLED=true
FIREBASE_PROJECT_ID=china-eastern
FIRESTORE_DATABASE_ID=laxmufc
```

`GOOGLE_CLIENT_EMAIL` and `GOOGLE_PRIVATE_KEY` continue to provide server-only
credentials. CBS collections are intentionally denied to browser SDKs by the
Firestore rules; all access goes through the authenticated backend API.

## Deployment

1. Deploy `public/firestore.rules` and `public/firestore.indexes.json` with the
   Firebase CLI from the `public` directory.
2. Deploy the backend with the variables above.
3. Open each CBS view once. This triggers idempotent import for Passenger Filed,
   On-hand, WorldTracer, Missing Bag, and Wrong Baggage collections.
4. Compare Firestore document counts with their legacy Sheet row counts before
   removing any legacy data.

Set `CBS_FIRESTORE_ENABLED=false` for an emergency rollback to direct Sheet
reads. Do not delete the Sheets; they remain the backup/report destination.
