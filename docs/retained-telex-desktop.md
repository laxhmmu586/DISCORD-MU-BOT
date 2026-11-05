# Retained Telex detection and single-border CBS editing

Once a special service is detected, its Telex task remains for that signed-in account, flight and date. Later source snapshots cannot remove it. Detection excludes already found services while continuing to discover other services. Cached detection survives page reload within the current session, remains permission-gated and is isolated by account/flight/date. The existing shared checkbox API, live updates and status reconciliation remain in place; checking a task updates its Done state without replacing its control.

CBS bag-tag and flight editing remove the surrounding badge decoration while editing. A single rounded input border remains; Flight uses a compact centered input. Existing single-click expansion, double-click editing, Escape, save/retry and correction history behavior remain.

Windows release: MUFC 2.0.16, prepared from the existing 2.0.14 release. `scripts/prepare-retained-telex-desktop.cjs` copies the release, updates Telex and the CBS page/dependencies, preserves the desktop SSR permission gate and authenticated live-stream adapter, and verifies all archive changes. The boarding engine and other desktop runtime files are retained.

The NSIS installer was built with the existing app ID and upgrade GUID. Its extracted application archive matches the prepared archive by SHA-256. Both the prepared app and extracted installer payload passed startup checks (Firebase initialized, Settings available, no persisted login session). The installer itself was unpacked for validation; it was not installed over the user's application.

Validation: nine focused unit/storage tests passed. Browser checks passed for Telex retention, repeated snapshots, stable controls, Done, new services, reload and flight isolation using both web and packaged desktop scripts. CBS browser checks passed on both web and packaged desktop assets, including single-border computed styles at 1440/390px and the existing editing interactions. Browser service responses are simulated.

Installer SHA-256: `402f8a37ce51000d081165c15ae565f148a3efca409109fbef7fd4e80c644cb2`.

The new installer is a local deliverable. Web Hosting changes have not been deployed by this PR.
