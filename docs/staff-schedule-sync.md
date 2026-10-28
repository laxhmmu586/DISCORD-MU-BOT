# Website-owned staff schedule

Schedule is stored in SQLite and edited through schedule.html. Google Sheets import, export, polling and conflict-resolution controls have been retired. Existing day records, custom role definitions and the saved horizon are retained. Legacy sync metadata is retained for recovery, but no transport or outbox worker is started, even if an old setting or environment variable enables synchronization. Legacy attempts to enable or resolve Sheet synchronization return 410.

The website continues to refresh its own API while idle. Supervisor+ edits, revision checks, copy/paste, month extension, employee views, announcements and Briefing roster reads all use local records. Other Google Drive document archiving integrations are unaffected.

Validation: staffSchedule Node tests and staffSchedule browser suite.
