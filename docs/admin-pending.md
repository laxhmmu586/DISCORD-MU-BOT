# Pending Firebase accounts

Full employee administrators see Pending in Admin. The existing server Google service identity reads the Firebase Auth directory through Identity Toolkit with a minimal field projection; passwords, hashes, salts and tokens are never returned. The directory loads only when Pending is opened. Admin initialization and background timers never request it; Refresh inside the dialog forces a new read. Disabled accounts and all @mu.com addresses are excluded from both the list and pending count.

Pending means an Auth UID with an email that has no employee_accounts binding. Reserved administrator logins are excluded. Administrators may link an existing employee (an exact unique email/login match is suggested) or create a new employee profile, selecting full name, Main Account and Title. HeadQuarter remains a permanent account choice. Approval saves the employee and UID binding in one revision-checked transaction and records an audit row. It does not change Firebase credentials or grant PBB qualifications.

Business Managers and Supervisors with account-scoped Admin access cannot list or assign globally unassigned Auth accounts. Existing employee title/account permissions and onboarding remain in place. Existing profiles bound by UID are recognized even for @mu.com password logins. No production accounts are created or assigned by the tests.
