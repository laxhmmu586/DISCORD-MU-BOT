# MUFC 2.1.4 audit and secure update implementation

Historical 2.1.5 audit. See `desktop-2.1.6.md` for current certificate installation and local-only GD/NEXTDAY/Meal Order. The latest dependency list supersedes associations described below.

## Audited baseline

The supplied `MUFC-Setup-2.1.4.exe` was extracted, without installing it, from the user's software folder. Its internal `package.json` identifies `mufc-desktop` 2.1.4, `src/main.js`, and `electron-updater ^6.8.9`. The EXE installer is NSIS; application code is `resources/app.asar`. Existing packaging metadata identifies Electron 44.5.1, while the inherited PE executable's Windows file version remains 2.0.10. Application version must therefore be checked inside ASAR, not inferred from the inherited PE metadata. The installed application on the audit machine was 2.1.2, distinct from the supplied 2.1.4 installer.

`main.js` starts a Node HTTP server bound to 127.0.0.1:17865, injects a random per-process `X-MUFC-Session` header through a dedicated Electron session, and loads `/login.html`. Static code is bundled under `web/`; HTML receives desktop scripts through the local server. Protected business pages require employee sign-in and device approval. Firebase configuration and SDKs are bundled. The Electron partition is in memory: reload preserves the existing session, but a full app restart intentionally does not preserve the signed-in employee. Do not change this existing policy in an updater.

The local server reads configured eTerm/history directories with `LogStore`, performs local analysis, and forwards online business APIs to Oracle. `device-client.js` stores an Ed25519 device private key encrypted by Electron safeStorage and signs cloud requests, including the employee token, request body, URL, timestamp and nonce. Employee authentication and feature permissions remain separate from device approval.

The old updater required `app-update.yml`, absent from the supplied release, and checked every four hours. The supplied installer was **NotSigned**. `desktop-config.json` contained an empty cloud bridge URL. Existing `sheet-sync.json` infrastructure therefore was not evidence of working flight synchronization.

## Implemented boundary

One bootstrap Core release (2.1.5) installs the privileged updater. 2.1.4 cannot acquire this capability as an HTML hotfix. Repository code owns this integration through `scripts/prepare-secure-desktop.cjs` and an audited, assertion-based 2.1.4 patch; generated build folders are not source code and are not committed.

Hotfixes are signed UTF-8 JSON manifests in a base64 envelope, verified with a pinned Ed25519 public key. They bind channel, increasing sequence, exact Core version, full bundled-web SHA-256, issue/expiry times, publication controls and each changed file's path/size/SHA-256. Maximum validity is seven days; expired manifests cannot activate staged releases. A previously verified installed release can continue offline. Equal sequences must contain identical payloads. A server cannot provide new signing keys. Keys rotate through Core releases (multiple public keys can be pinned during a transition).

The production source is **Oracle HTTPS only**. Optional explicitly configured private IPv4 LAN HTTP mirrors are supported by the verifier, but no LAN address is configured or discovered. Fetches have time and byte limits, prohibit redirects and retry the next configured source after failure. Startup and five-minute checks download in the main process. Neither a website nor the renderer can select a source, sign a request, execute an installer or bypass validation.

Staging copies the bundled frontend into a new version directory and applies only allowlisted frontend changes. Paths reject traversal, alternate streams, Windows device names, case duplicates and trailing-dot aliases. Native code, arbitrary extensions, the desktop bridge scripts and bundled Firebase SDKs cannot be hotfixed. No ZIP extraction is involved. The entire staged tree is checked against the bundled baseline and signed file hashes before a directory rename. An unsigned local receipt cannot authorize added or altered JS.

Updates live under `%APPDATA%\MUFC\updates\<CoreVersion>`, separately from settings, device credentials, notes, original files and all business SQLite databases. Only updater-created staging directories are cleaned up. Previous releases are retained. A durable state pointer records active/previous/pending versions. Each HTTP request gets a main-process-pinned UI generation; an existing request keeps its captured root. Switching stops the renderer before reloading, avoiding arbitrary file-by-file replacement of a live UI.

## Safe activation, rollback and Core installation

The Core-owned renderer coordinator permits automatic refresh only on `/login.html` or `/flights.html`, after 30 seconds without user activity, with no dirty input, open dialog, iframe, focused editor, pending fetch or explicit operation lock. Flight Control, checklists, uploads, signatures and scanning pages never refresh automatically. Feature code may hold `mufcUpdateLock(key)`, cancel `mufc-before-update`, and signal `mufc-work-saved` after actually saving a transaction. No generic successful network response is interpreted as proof a draft was saved.

Before switching, the current URL, flight selection already held by the application, session and scroll position are retained. Passwords, tokens, passenger fields, draft form values, signatures and file inputs are not copied to updater storage. Work pages defer until the operator leaves; this is deliberately safer than attempting a generic restore of every existing form.

Main-frame-only IPC uses an unpredictable one-use handshake token. The new page must initialize Firebase, the desktop bridge, DOM and loading state and acknowledge health within 30 seconds. Renderer crash, main-page load failure, health timeout or restart during pending activation causes rollback. Failed versions are blocked locally. This checks startup health; it cannot prove every business workflow is semantically correct, so release acceptance still includes workflow tests.

Signed `paused` controls prevent new activations while preserving the working version. Signed `disabled` or `revoked` controls request rollback at the same safe boundary. Local administrators can create `disable-updates.json` containing `true` inside the version's updater directory to stop checks and activation. A disabled/revoked active release is not forcibly refreshed while an operator is working. An offline machine cannot learn a new server-side revocation until connectivity returns.

Core EXEs are downloaded separately and checked against the signed manifest and SHA-256. Automatic execution also requires a valid embedded Windows Authenticode signature and an exact pinned certificate thumbprint. A fixed PowerShell helper verifies signature/hash again after the existing process exits; the feed cannot supply command-line arguments. The fixed NSIS argument is `/S`. Installation is attempted only after a safe close handshake on a login/flight-selection page. Closing a work page exits without installing. Windows may still require UAC for the inherited per-machine installation.

Free internal signing uses a non-exportable RSA code-signing private key in the release computer's CurrentUser certificate store, plus an ACL-protected Ed25519 key outside the repository. Only `.cer` and Ed25519 public material may be distributed. Each managed Windows user must explicitly enroll the reviewed certificate using `trust-certificate.ps1` and its expected thumbprint. This is managed internal trust, not public CA trust; it does not promise SmartScreen reputation or compatibility with Smart App Control policies. Never distribute a private key or change a verifier to accept an untrusted signature.

## Electron checks

Preserved `nodeIntegration:false`, `contextIsolation:true`, `sandbox:true`, loopback/session/origin checks, device proof, online employee authorization, and external-navigation allowlists. IPC now also requires the main frame; child frames receive no desktop bridge. Webviews are rejected. Remote script requests are rejected and HTML Firebase SDK references are rewritten to bundled copies. Static responses include `nosniff`, `no-store` and a CSP allowing local scripts plus existing inline scripts, without `unsafe-eval`, plugins or external frames. Removing all inline scripts requires a separate page refactor; claiming a strict nonce-only CSP here would be inaccurate.

## Daily flight data

Approved employee desktops publish only today's supported LAX SY/BND sections to `/flight-day-sync`; the endpoint requires the existing request-bound device signature and employee authentication. It does not accept a whole passenger-log export. Input has an explicit 1 MiB bound, flight/date filters, terminal timestamp ordering and checks against mixed PR/PD records. An older workstation capture cannot overwrite a newer capture. Terminal export timestamps follow the existing parser's wall-time ordering convention; they are not represented as a new authoritative UTC business timestamp.

`flight_day_sections` resides in the existing `data/boarding.db`, alongside BAB. GATE/BDT/ETD, the `/flights` list, departure PBB gate source and Briefing SY booking source read this store. BOX rebuilds from committed SY/BND with its existing manual corrections/confirmation behavior. Current-day dashboard/search operational fields are overlaid from this database. Local full-log analysis and historical/SY+ workflows remain available through their existing paths.

BAB's existing daily **07:00 America/Los_Angeles** transaction clears SY/BND, scans, NBRD, BOX, and old operational dashboard/list caches together, with DST-aware scheduling and missed-cleanup recovery. Yesterday's logs cannot recreate today's records. A missing publisher produces an empty/unavailable operational database result rather than silently going back to Drive. Deploy and connect an approved updated publisher before relying on these new readers. SQLite is local to the Oracle service; this change does not pretend the existing Electron client already had its own native SQLite boarding engine.

Sales Report stays on Drive through the existing signed cloud API. The client no longer offers or reads a Sales folder. Existing saved `salesFolder` settings are left intact but unused.

Rollout order: install and approve an updated desktop first (its publishing requests safely retry until the backend route exists); back up `boarding.db`; run `node scripts/seed-flight-day.cjs` once on Oracle using the existing log source; verify that it finds today's LAX SY; then deploy/restart the backend and confirm the updated desktop's signed publishing succeeds. The seed does not modify Drive, save passenger log exports or create an ongoing Drive fallback. Do not switch readers if the seed fails. Rolling the backend back leaves the additive table harmlessly in place.

## Reviewable file changes and tests

Privileged updater, renderer coordination, Core signing/trust, publishing, build integration and nginx snippet: `scripts/desktop-updates/*`, `scripts/prepare-secure-desktop.cjs`. Shared flight-day store and integration: `flightDayStore.js`, `index.js`, `desktopProtection.js`, `boardingSqliteLive.js`, `has/server/pbbFlights.js`, `has/server/briefingBooking.js`. Regression tests: `test/desktopUpdates.test.js`, `test/flightDayStore.test.js` and existing boarding/security/PBB suites. Remaining Google dependencies are catalogued separately.

Required acceptance: signed/modified/expired/wrong-base manifests; unknown signer; replay/conflict; size/timeout/redirect rejection; path aliases; pause/revoke/local-disable; partial download and power loss; unsigned receipt tampering; preservation of business files; unsafe-page/input/network/lock refresh deferral; safe navigation restoration; actual packaged login and settings startup; actual server/device-signature integration; database ordering/isolation and BAB cleanup; valid and invalid pinned Windows signatures. Business data and employee logins in automated acceptance are simulated. Do not sign an employee in, send a report or interrupt a live Flight Control session merely to smoke-test an installer.

## Publishing

1. Prepare from the verified extracted 2.1.4 source with the public production configuration and a new output directory.
   Alternatively use `node scripts/build-secure-desktop.cjs VERIFIED_INSTALLER NEW_OUTPUT CONFIG VERSION BUILD_TOOLS_NODE_MODULES` to extract, prepare, package and sign in one operation. It pins the audited 2.1.4 installer's SHA-256 and requires the release computer's non-exportable Windows key.
2. Package ASAR and NSIS. Sign the application, installer and uninstaller with the pinned Windows certificate; verify Authenticode after packaging.
3. Create a publication plan for `publish.cjs`: channel, coreVersion, bundledRoot, keyId, strictly increasing sequence, validity (at most 168 hours), paused/disabled/revoked controls and optional hotfix/core artifacts. Hotfixes list exact changed frontend paths. Core publishes its installer path/id/version.
4. Run `node scripts/desktop-updates/publish.cjs PLAN PRIVATE_KEY NEW_OUTPUT`. Transfer only the resulting manifest and content-addressed files to Oracle. Upload files first, then atomically rename `manifest.json`. Keep signing private keys on the release machine. Renew signed manifests before expiry, even when releasing only publication controls.
5. Include `oracle-nginx.conf` inside the existing HTTPS virtual host, run `nginx -t`, then reload nginx. Do not expose application source, `.env`, signing material or business databases through this directory.
6. Pause/revoke using a new signed plan and a higher sequence. Re-enabling a permanently revoked ID requires a new release ID. A rollback is a new signed release of the previous good frontend; anti-replay is never disabled.
