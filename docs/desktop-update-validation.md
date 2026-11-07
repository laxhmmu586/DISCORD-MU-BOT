# 2.1.5 validation and rollout status (2026-11-07)

- Audited baseline: supplied 2.1.4 NSIS installer, SHA-256 `6715e572a2aba3f37057dc2babf43da3f7a06b388d1f313f9fe17918c4e62413`.
- New installer: `MUFC-Setup-2.1.5.exe`, SHA-256 `1ac1f1bf5021317b10c6934fb28c6ca2f60d97e38b9545d60c46e2d468e44251`.
- Windows Authenticode: **Valid**, signer `CN=MUFC Internal Release Signing`, pinned thumbprint `877C05BF6EA092C78B8C5A3F081BF25855EFB390`. Application and NSIS uninstaller were signed as well. Certificate is trusted for the release computer's current Windows user; other managed users must enroll the public certificate.
- Extracted the final installer again: internal version is 2.1.5; updater, Core verifier, native integration, publisher and Core-owned renderer coordinator exactly match the reviewed source bytes.
- **75 focused tests passed**, covering updater/security controls, work-page and pending-request deferral, simulated disk-full activation, signed SY/BND ingestion, publisher retry/filtering, persistence, BAB/BOX/SSE behavior, PBB and Briefing.
- Actual packaged local-server integration: 5 protected business pages, 58 bundled JS/CSS dependencies, request-bound device signatures, employee-login simulation and sign-out passed.
- Actual Electron startup: Firebase initialized, desktop bridge and Settings loaded, in-memory session behavior preserved. Screenshot capture reported an existing `UnknownVizError` for one offscreen login capture; startup assertions passed.
- Actual isolated Electron/ASAR hotfix acceptance: signed `good` frontend activated without closing the EXE and acknowledged health; deliberately broken `broken` frontend timed out, rolled back to `good`, and was blocked. Final native run took 59.3 seconds. No employee signed in and no live flight page was closed.
- One additional existing employee-ID test in `desktopProtection.test.js` fails on both this branch and untouched `origin/main` (`1977d996`); it expects a legacy `eid` field to remain in an admin response. This PR does not change that workflow.
- Oracle HTTPS feed is live at `https://api.mufcapp.net/desktop-updates/stable/2.1.5/manifest.json`. The real updater verified its Ed25519 signature and exact bundled-web baseline. POST is rejected. Initial manifest sequence is 1, no hotfix or Core payload is published, and validity is seven days. Release owner must renew signed manifests before expiry.
- nginx was backed up and configuration-tested before reloading. Only the isolated static update location was added; the application service was not restarted. Existing duplicate-server-name warnings remain outside this change; the new HTTPS route was verified directly.
- **The flight-data backend code is in the PR, not deployed.** Use the documented backup/one-time seed/new-client rollout sequence before switching production readers. The installed business client was not replaced. Actual employee login, real terminal-file synchronization and the first Core installation remain operator acceptance steps.

Native acceptance command: `node scripts/verify-hotfix-electron.cjs BASE_RUNTIME NEW_OUTPUT ASAR_MODULE`.

Focused suite:

```
node --test test/desktopUpdates.test.js test/desktopUpdateRenderer.test.js test/flightDayPublisher.test.js test/flightDayStore.test.js test/boardingSqlite.test.js test/boardingBoxCache.test.js test/boardingBoxStream.test.js test/flightListCache.test.js test/briefingBooking.test.js test/pbbFlights.test.js
```
