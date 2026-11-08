# Client 2.1.10: Shanghai glass and local Gmail comparisons

The dashboard and login share a Shanghai night background. The dashboard uses the requested two rows, stronger conditional center alerts, unified SVG icons, emerald completed cards, champagne attention cards and silver pending cards. All bottom LEDs and dotted Pending indicators are removed. Original node handlers remain attached to their original elements. Detail panels remain centered and scroll internally. Header flight/date and three colored metrics retain their design.

Hosted `/profile` HTML now receives the same desktop bootstrap as bundled pages. Firebase compat scripts are mapped to bundled SDK files before the existing local-script policy is applied. Page permission checks remain intact. Recovery notices have clickable Reload/Sign in controls; F5 and Ctrl+R invoke native reload. Profile no longer receives the generic switch-flight shortcut.

`/flight-email-checks` uses the existing Gmail GD and Meal Order readers unchanged. Its expected flight/date, registration and minimal crew passport list come from local terminal logs. It does not read server/Drive logs. The endpoint requires an approved desktop session. Cache keys include employee and exact local expectations; the client discards scope mismatches and clears stale GD completion when expectations change. Meal Order still compares Gmail counts with local RET/SPML, including when only local ticketed reservations change.

NEXTDAY's existing local checks and manual sending behavior are outside this correction.

Reproducible client preparation:

```
node scripts/prepare-client-glass.cjs BASE_RUNTIME NEW_DIRECTORY ASAR_MODULE 2.1.10
```

The baseline must be 2.1.9. The preparer never modifies the installed app or local user files. The new backend endpoint must be deployed before the new client's Gmail checks can become ready. Source preparation and an installer/portable build do not establish production deployment or replacement of an existing installation.

Validation: 24 existing Gmail/PDF/meal tests and 8 client/backend regressions pass. Real bundled SDK initialization under local-only CSP, hosted HTML adaptation, authenticated local-server integration, all twelve original node handlers, both 1366×768 and 1920×1080 layouts, internal popup scrolling and login artwork were checked with local fixtures. No production mailbox or employee session was used in those tests.
