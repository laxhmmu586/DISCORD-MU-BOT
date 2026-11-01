# HAS workspace

Develop HAS features in this folder. Existing public URLs remain compatible.

| Folder / file | Purpose |
| --- | --- |
| `public/` | Login, Home, Profile, HR, Information, Checklist, PBB, reports, requests, Read & Sign, Briefing, Schedule, shared UI code and their images |
| `server/` | Personnel, permissions, organizational charts, approvals, Schedule, Briefing, reports, notifications and PBB services |
| `resources/` | Original checklist documents, report spreadsheets, Word templates and PBB PDF field mapping |
| `manifest.json` | Source inventory, compatibility entries, shared integrations and runtime data locations |
| `static.js` | Express compatibility for existing URLs and the `/has/` asset namespace |
| `build.cjs` | Generates Firebase hosting output from `public/` |

## Development and deployment

Edit files here, not the old root-level server entry points. Those small files only forward existing callers to `has/server/`.

Run `npm run has:build` from the repository root. This generates `public/public/has/`, which is ignored by Git. Firebase also runs this build before hosting deployment. Only frontend files are published; `server/`, templates, databases and configuration are outside the hosting directory.

Existing links such as `/home`, `/profile`, `/hr`, `/schedule`, `/has-pbb.html`, and legacy script/image URLs still work. Firebase rewrites and Express aliases serve their sources from this folder. Database filenames and API endpoints have not changed.

Additional related pages included beyond the original list: Briefing, Schedule and Rules, PBB configuration/dashboard, report dashboard, request approval workflow, uniform requests, legacy attendance screens, and legacy Admin/account-settings redirects. There is no separate Finance page: Finance currently opens authorized reports.

## Data and future migration

### HR Notification

The Notification entry exists only in HR. Company administrators manage all scopes, station managers manage their own station, and Business Managers manage their Main Account. Station managers can enter this HR view without gaining personnel-editing rights. Each Account card also opens that account's notification settings.

Weekly report, monthly report, timecard close and custom templates are inactive until a manager saves a reminder. Reminders support a specific date, daily, weekly and monthly schedules, an explicit time zone and position targeting. Monthly days beyond the end of a month use its last day. Spring daylight-saving gaps use the first valid minute after the requested time; autumn overlaps send once. The server checks due reminders every 30 seconds. A missed occurrence older than 24 hours is skipped rather than broadcast as a backlog.

SQLite stores reminder definitions, revisions, occurrence records, private inbox messages, scope policies and audit records. An occurrence and its recipient jobs are inserted atomically; the existing push outbox handles device delivery and duplicate suppression. Push delivery rechecks the reminder's enabled state, revision, current recipient membership and positions. Scheduled messages stay in the website bell until marked read; unread items use the red animated bell. The blue bell is used when no attention is needed. System notification retention remains under the phone's control.

Scope switches control Schedule approvals, Report Time, Schedule announcements, Read & Sign, HAS approvals and scheduled reminders. Company and station restrictions are inherited and cannot be overridden by an Account. Position selections narrow the original approval/access audience; they never grant permissions. A person's existing device Notifications switch remains independent. Settings default to enabled, preserving existing notifications until a manager changes them.

## Data and future migration

This change organizes development sources; it does not move or copy live databases.

- `data/EP.DB` contains personnel, linked Firebase IDs, organization/reporting relationships, permission overrides, avatars, approvals, Schedule data/requests/rules, Briefing, Read & Sign, attachments and signatures. Its configurable path is `PBB_EMPLOYEE_DB_PATH`.
- `data/pbb.db` contains PBB sessions, records, signatures, PDF results and delivery state. Its configurable path is `PBB_DB_PATH`.
- `HAS_REPORT_DB_PATH`, when set, stores reports separately. Without it, reports use the employee database.
- Firebase remains the authentication authority. A future server move must retain the Firebase project/authentication configuration and allowed domains, or explicitly migrate Firebase identities while preserving their UIDs.
- Email, Google Drive, Discord, shared flight/ETAB integrations, HTTPS/reverse proxy settings and environment secrets remain deployment dependencies. See `manifest.json` for shared server modules. They are not made public or copied into this directory.

Before a future move, take consistent SQLite online backups (not just `.db` copies while WAL writes are active), preserve relevant external upload/output directories, and validate the new host before switching traffic. Do not publish database copies or secrets through Firebase Hosting.

## Reviewed cleanup

The directory reorganization also removes 8 superseded/unreferenced image files and 3 Visual Studio workspace files, totaling 6,920,618 bytes. These remain recoverable from Git history. Dynamically named baggage images, live databases, uploads, signatures, backups, dependencies and active server configuration are retained.
