# MUFC 2.1.14: shared DA and HAS workspace sign-in

Report opens the complete LAX/MU DA editor in an isolated native window backed by HAS Station's existing DA records. The MUFC-specific DA view keeps only Report navigation, hides the account/date/notification/profile controls, and returns to MUFC flight selection when its logo is clicked. Jet Bridge opens the HAS Station PBB workspace with the same sign-in handoff.

The handoff verifies the MUFC token with its server, matches an existing verified, enabled, linked HAS employee by login ID, checks LAX/MU membership, and issues a single-use 30-second code. Its cookie session lasts at most 15 minutes or the source token expiry. Existing HAS role permissions, DA revisions and conflicting-cell checks still apply. The restricted session cannot access WWH, Rechargeable or administrative APIs. Source sign-in and target access are rechecked. Reopen the workspace from MUFC if its short session expires.

Deployment used the existing HAS data store. Eleven matching months were left unchanged; November differed only at J6 (blank versus MUFC's newer `1`). HAS revision 124 was backed up and replaced with the checked MUFC revision 125. No other report records were migrated. New MUFC DA operations use the HAS store directly; legacy MUFC-server report endpoints continue to use their previous store.

Validation: eight sign-in/shared-report tests, desktop IPC and logo-return checks, exact installer/source-byte checks, valid Authenticode signature and native startup smoke exit 0. Live readiness and public pages return 200; invalid sign-in handoffs and unauthenticated DA requests return 401. Custom-token signing using the server's existing certificate was verified. Real employee automatic sign-in and interactive PBB acceptance still require operator verification; no employee credentials were used in tests.

The 2.1.14 installer is a manual delivery. No update manifests, automatic update feeds or installed user applications were changed.
