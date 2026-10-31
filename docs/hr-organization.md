# HR organization and permission settings

Home retains Home / HR / Finance navigation. HR opens an independent Admin workspace with regional account groups, explicit reporting lines, a shared Supervisor team per station/account, and employee profile, PBB, and Permission tabs. Managers can edit only lower-level descendants in their Main Account; they cannot edit themselves, peers, administrators, or other accounts. Existing employee identities, linked logins, and PBB records survive reassignment. Added placeholder levels can be removed with automatic reconnection; real employees move to Unassigned.

Permission overrides use role default / allow / deny. Each service enforces its own account/station eligibility in addition to the override. A manager cannot change a permission they do not hold. Permission settings do not grant HR administration, bypass approval identity checks, or broaden workspace membership.

SQLite adds employee_reporting, employee_organization_nodes, and employee_permission_overrides in the existing employee database. Schema initialization is additive. Existing employee records are not replaced or seeded from reference names. Agents without a saved reporting line default to their own station/account’s Supervisor team when one exists. Explicitly unassigned employees and accounts without a Supervisor remain under Reporting line not assigned; other reporting relationships require an administrator’s assignment. Supervisor teams are shared across their station/account rather than tied to numbered supervisors.

Request presents only Request New Access for new submissions. Position is a requested lower-level title, retained in the approval snapshot; it does not promote or create a real account. Previously submitted Uniform/report records remain available in history and approval tabs. Existing saved New Access requests without Position display Agent for compatibility.

Checklist and Info are restored with their existing API/visibility restrictions. Info keeps its historical CTO table. Checklist PDFs remain authenticated and outside public hosting. Resource navigation and approval nodes use the shared glass theme and dimensional blue icons.

## Deployment

Deploy the backend and Firebase Hosting from the same revision. The backend must load the new organization and permissions modules before hosting exposes the HR page. Keep all existing employee databases and templates in place. No import of sample people or production data is performed.

Local previews run with `node scripts/preview-hr.cjs` at http://127.0.0.1:9185/home?preview=1. The preview server uses an in-memory database and a simulated Lake login. Reference charts and preview resource behavior are restricted to localhost. Production HR always uses authenticated API data, even when a preview query parameter is supplied.

The legacy /admin and /account-settings entries redirect to HR. Pending accounts opens directly in an HR dialog for authorized owners. Admins add accounts and delete empty accounts in the HR Accounts view; the API rejects deletion when any main or additional membership remains.

Server owners are exact authenticated sign-ins `lax@mu.com` and `nextweek1216@gmail.com`; the existing `lake@mu.com` owner alias remains supported. Owners can manage every HR employee, including themselves, and all catalog permissions remain enabled regardless of title or per-person denial. Linked profiles derive owner status from the authenticated identity, never a submitted profile field.

A Business Manager without an explicit reporting relationship defaults to the unique General Manager in their station, preferring an account match when multiple General Managers exist, or the unique headquarters General Manager when no local General Manager exists. Explicit Unassigned and manual relationships remain intact. Multiple accounts may share the same General Manager; scoped HR views include the reporting ancestors so these connections remain visible.

HR Profile & reporting includes Main account, 2nd account and 3rd account. Administrators can update the additional memberships; reporting managers see them read-only. All three accounts must be distinct existing workspaces, with at most two additional accounts. Account views include employees with an additional membership in that workspace.


The Today Team panel on `/index.html` displays the saved employee **Code** beside the avatar and name, with a dash for an unset code. It uses the native-reference typography (28px Code and 18px names on desktop, with compact mobile sizes). The roster is read when the panel opens; there is no interval, focus or visibility refresh while it remains open.

Full Name search now offers **Merge** after the owner selects an existing employee. Merge uses that selected profile as the master, combines distinct Main / 2nd / 3rd memberships and login links, and hides the duplicate from HR and active rosters. Existing master fields win; empty contact, Code/EID and PBB fields can be filled from the source. The source record and an audited snapshot remain available for historical references. Old login/EID aliases resolve to the master. Merge is separate from position assignment, and an unassigned duplicate does not need a reporting manager. Account limits, Google login conflicts, protected identities and stale revisions are checked transactionally.
