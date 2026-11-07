# MUFC 2.1.1 navigation and Report Center

REPORT opens the independent `/report.html` page instead of the legacy Dashboard overlay. Its only report tabs are Sales Report, Sales Details, VIP Report, Authorization Report and INAD Report. The legacy local-report iframe adapter is removed, so the page starts beneath its own navigation without the Dashboard flight banner or nested report viewport.

The desktop primary navigation is REPORT, BAGGAGE, LBS, NOTES, FORM. Baggage is bundled locally with its dependencies and uses the existing authenticated API proxy. FORM opens the existing form dialog; navigating to it from another page preserves the request until the form scripts have initialized.

Boarding Pass, Reissue, Passenger Details, TCI and Passenger Manifest now belong to LakeTerm. Their desktop pages, renderer scripts, native Boarding IPC handler, preload method, Reissue readers/workers and bundled boarding engine are removed from the new release. Old local page/API paths return HTTP 410. Existing user files are retained.

Build from an installed protected 2.1.0 release:

```
node scripts/prepare-desktop-navigation.cjs BASE_APP NEW_OUTPUT 2.1.1 ASAR_MODULE
node scripts/verify-protected-desktop.cjs NEW_OUTPUT/app-source
node test/desktopNavigation.browser.cjs NEW_OUTPUT/app-source
```

The browser check uses simulated employee/business data against the actual packaged loopback server. It verifies all five navigation pages, exact five report tabs, Report and Baggage navigation, opening FORM from another page, removed feature routes, responsive layout at 1440/1024 pixels, and absence of page errors. It also renders the website flight card and verifies that Enter Dashboard and the Jet Bridge card link are absent.

The website flight script has a new version URL and no-store response headers. This replaces previously cached flight-card code that could still draw Enter Dashboard after the underlying file had changed.
