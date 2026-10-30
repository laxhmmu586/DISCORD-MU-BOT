# HR organization and permission settings

Home retains Home / HR / Finance navigation. HR opens an independent Admin workspace with regional account groups, explicit reporting lines, a shared Supervisor team per station/account, and employee profile, PBB, and Permission tabs. Managers can edit only lower-level descendants in their Main Account; they cannot edit themselves, peers, administrators, or other accounts. Existing employee identities, linked logins, and PBB records survive reassignment. Added placeholder levels can be removed with automatic reconnection; real employees move to Unassigned.

Permission overrides use role default / allow / deny. Each service enforces its own account/station eligibility in addition to the override. A manager cannot change a permission they do not hold. Permission settings do not grant HR administration, bypass approval identity checks, or broaden workspace membership.

SQLite adds employee_reporting, employee_organization_nodes, and employee_permission_overrides in the existing employee database. Schema initialization is additive. Existing employee records are not replaced or seeded from reference names. Agents without a saved reporting line default to their own station/account’s Supervisor team when one exists. Explicitly unassigned employees and accounts without a Supervisor remain under Reporting line not assigned; other reporting relationships require an administrator’s assignment. Supervisor teams are shared across their station/account rather than tied to numbered supervisors.

Request presents only Request New Access for new submissions. Position is a requested lower-level title, retained in the approval snapshot; it does not promote or create a real account. Previously submitted Uniform/report records remain available in history and approval tabs. Existing saved New Access requests without Position display Agent for compatibility.

Checklist and Info are restored with their existing API/visibility restrictions. Info keeps its historical CTO table. Checklist PDFs remain authenticated and outside public hosting. Resource navigation and approval nodes use the shared glass theme and dimensional blue icons.

## Deployment

Deploy the backend and Firebase Hosting from the same revision. The backend must load the new organization and permissions modules before hosting exposes the HR page. Keep all existing employee databases and templates in place. No import of sample people or production data is performed.

Local previews run with `node scripts/preview-hr.cjs` at http://127.0.0.1:9185/home?preview=1. The preview server uses an in-memory database and a simulated Lake login. Reference charts and preview resource behavior are restricted to localhost. Production HR always uses authenticated API data, even when a preview query parameter is supplied.

The legacy /admin entry redirects to /hr. Advanced pending-login, account-membership and import maintenance remains available only via Account settings within HR Accounts, at /account-settings.
