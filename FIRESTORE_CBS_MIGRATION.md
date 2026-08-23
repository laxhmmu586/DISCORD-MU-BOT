# CBS Firestore storage

Firestore is the only read store for CBS. The legacy Google Sheet import has
been completed and the runtime no longer checks migration markers or imports
Sheet rows. New writes are persisted to Firestore first and then retained in
Google Sheets as the operational backup/report.

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
3. Keep the Google Sheets available as write-only backup/report destinations.

The application does not fall back to importing or reading CBS collections
from Sheets. Do not delete the Sheets; they remain the backup/report destination.
