# Client 2.1.10: Shanghai glass and local Gmail comparisons

The dashboard and login share a Shanghai night background. The dashboard uses the requested two rows, stronger conditional center alerts, unified SVG icons, emerald completed cards, champagne attention cards and silver pending cards. All bottom LEDs and dotted Pending indicators are removed. Original node handlers remain attached to their original elements. Detail panels remain centered and scroll internally. Header flight/date and three colored metrics retain their design.

Hosted `/profile` HTML now receives the same desktop bootstrap as bundled pages. Firebase compat scripts are mapped to bundled SDK files before the existing local-script policy is applied. Page permission checks remain intact. Recovery notices have clickable Reload/Sign in controls; F5 and Ctrl+R invoke native reload. Profile no longer receives the generic switch-flight shortcut.

`/flight-email-checks` uses the existing Gmail GD and Meal Order readers unchanged. Its expected flight/date, registration and minimal crew passport list come from local terminal logs. It does not read server/Drive logs. The endpoint requires an approved desktop session. Cache keys include employee and exact local expectations; the client discards scope mismatches and clears stale GD completion when expectations change. Meal Order still compares Gmail counts with local RET/SPML, including when only local ticketed reservations change.

NEXTDAY's existing local checks and manual sending behavior are outside this correction.

Reproducible client preparation:

```
node scripts/prepare-client-glass.cjs BASE_RUNTIME NEW_DIRECTORY ASAR_MODULE 2.1.10
```

The baseline must be 2.1.9. The preparer never modifies the installed app or local user files. The new backend endpoint must be deployed before the new client's Gmail checks can become ready. The installed client remains unchanged until the operator installs 2.1.10.

Validation: 24 existing Gmail/PDF/meal tests, 8 client/backend regressions and 3 existing device-protection tests pass. Real bundled SDK initialization under local-only CSP, hosted HTML adaptation, authenticated local-server integration, all twelve original node handlers, both 1366×768 and 1920×1080 layouts, internal popup scrolling and login artwork were checked with local fixtures. No production mailbox or employee session was used in those tests.


## Deployment evidence · 2026-11-07 America/Los_Angeles

The two backend files were backed up under `/home/ubuntu/deploy-backups/client-gmail-20261107-v2` and deployed to the running service; PM2 `mu-bot` remained online after restart. Both endpoint regressions passed on the server. The live `/flight-email-checks` endpoint returns `403 DESKTOP_REQUIRED` without approved-device proof, preserving its authentication boundary. Existing Gmail extraction routines were not changed. No databases or mail were modified.

The signed initial 2.1.10 update feed is live. The actual client verifier accepted its pinned signature, Core version, sequence 1 and exact bundled-web baseline `ef2595b14a24ab0a3a6aa55250ef55203635c99577d590f6c73ea3de7bed3fbb`. The feed contains no automatic installer offer to existing 2.1.9 clients.

`MUFC-Setup-2.1.10.exe` was built with the existing NSIS trust workflow. Authenticode is Valid with pinned certificate `877C05BF6EA092C78B8C5A3F081BF25855EFB390`; SHA-256 is `9f9185eccb4e845fb93db7c63270288b6556ba7ae49fb0aff6ad29c2d30e3f42`. Native Electron startup initialized Firebase and Settings, with in-memory session behavior preserved. Its offscreen login screenshot returned the existing `UnknownVizError`; Settings capture and independent browser screenshots were obtained. The isolated test process was cleaned up after those assertions. The installed working client was not closed or replaced.
