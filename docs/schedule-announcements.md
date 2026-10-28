# Schedule shortages and announcements

Supervisor and above may mark a date Short and select missing duty codes with headcounts. The normal date revision protects concurrent edits. Shortage details live in staff_schedule_shortages, independently of Google Sheet date-note synchronization. Employees receive these details alongside their own assignments, without access to team schedules.

Supervisor and above may publish dated title/message announcements. Employees see a red-orange announcement strip with a shaking white megaphone and a dialog. Got it persists an acknowledgement per employee and notice in staff_schedule_notice_reads, surviving reloads and devices. Closing the dialog does not acknowledge it. Publishing requires a visibility duration from 0.25 to 720 hours. Custom announcements remain until acknowledged or expired. Supervisor and above can list and delete published announcements, including expired items. Active or future Short dates generate notices from the saved positions/counts; changing those details produces a new notice version. Past Short reminders expire.

Today ribbons are purple with white text; Short ribbons are red with white text. Ordinary Agent profiles hide Form navigation; Lead and above retain it. Checklist navigation is hidden. These are navigation changes and do not alter direct-page authorization.

Local validation: node --test test/staffSchedule.test.js test/staffScheduleSync.test.js test/employeeProfiles.test.js; node test/staffSchedule.browser.cjs; node test/scheduleNotices.browser.cjs. Browser checks use local fixtures and do not publish real announcements.
