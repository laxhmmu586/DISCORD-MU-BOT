# Approved MUFC Desktop computers

Dashboard (`index.html`), Report Center, LBS and Jet Bridge are desktop-only from MUFC 2.1.0. Firebase Hosting excludes their source files, including nested copies, and serves a small desktop-required notice for old links. The API host rejects the original pages before any static router. Info is retired. Employee information responses omit EID; internal identifiers remain stored for existing record associations.

Every approved computer has a separate Ed25519 key. The private key is generated on that computer, encrypted with Electron safeStorage (Windows credential protection), and stored under `%APPDATA%\MUFC\desktop-device-key.bin`. It is never included in an installer or uploaded. The public enrollment request is `%APPDATA%\MUFC\desktop-device-enrollment.json`.

Copy only the public enrollment request to the API host, then run:

```
node scripts/approve-desktop-device.cjs enroll /path/to/desktop-device-enrollment.json "Computer label"
node scripts/approve-desktop-device.cjs revoke DEVICE_ID
```

The API registry defaults to `data/desktop-devices.json` and can be overridden with `MUFC_DESKTOP_DEVICES_FILE`. Registry changes take effect on the next request without restarting. There is no browser enrollment endpoint or shared client password. All approved devices must still sign in as an employee and pass existing account and feature permissions.

Signatures bind the method, path/query, timestamp, nonce, employee bearer token and body hash. Requests expire after 60 seconds; used nonces are rejected for the entire validity window. The native loopback server additionally requires its per-process Electron session header, checks same-origin requests, and verifies device approval before opening its login session. Signing out clears that local session; token refresh rechecks approval. The old unsigned local Dashboard entry is removed.

Build from the installed verified release without replacing the boarding engine:

```
node scripts/prepare-protected-desktop.cjs BASE_APP NEW_OUTPUT 2.1.0 ASAR_MODULE
node scripts/verify-protected-desktop.cjs NEW_OUTPUT/app-source
```

Validation: 26 focused security/profile tests passed. Integration against the actual packaged server verified five pages, 55 bundled dependencies, signed cloud proxy requests, employee login, sign-out, URL encoding/case variants and rejection of ordinary browsers. A real Electron smoke run initialized Firebase and the native bridge and rejected protected pages before login. Business data returned by cloud services in the integration test is simulated; a real employee sign-in remains the final production acceptance check.

The broader employee-admin/workspace suite has 16 failures on the unchanged `48e6a65e` baseline as well (mock database, route expectations and missing VM globals). Those failures are unrelated to this change.

Approval controls access from new installations and ordinary browsers. It cannot prevent an approved employee from copying data they are authorized to view or protect a Windows session already controlled by another person.
