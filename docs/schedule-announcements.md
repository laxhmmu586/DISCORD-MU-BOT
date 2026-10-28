# Schedule shortages and announcements

Supervisor and above may mark a date Short and select missing duty codes with headcounts. The normal date revision protects concurrent edits. Shortage details live in staff_schedule_shortages, independently of Google Sheet date-note synchronization. Employees receive these details alongside their own assignments, without access to team schedules.

Supervisor and above may publish dated title/message announcements. Employees see a red-orange announcement strip with a shaking white megaphone and a dialog. Got it persists an acknowledgement per employee and notice in staff_schedule_notice_reads, surviving reloads and devices. Closing the dialog does not acknowledge it. Publishing uses a Visible through date, expiring at the end of that Los Angeles calendar day, including daylight saving transitions. Legacy duration-based requests remain accepted. Custom announcements remain until acknowledged or expired. Supervisor and above can list and delete published announcements, including expired items. Active or future Short dates generate notices from the saved positions/counts; changing those details produces a new notice version. Past Short reminders expire.

Today ribbons are purple with white text; Short ribbons are red with white text. Ordinary Agent profiles hide Form navigation; Lead and above retain it. Checklist navigation is hidden. These are navigation changes and do not alter direct-page authorization.

Local validation: node --test test/staffSchedule.test.js test/staffScheduleSync.test.js test/employeeProfiles.test.js; node test/staffSchedule.browser.cjs; node test/scheduleNotices.browser.cjs. Browser checks use local fixtures and do not publish real announcements.

Short positions use compact duty-code buttons with an adjacent count. Managers can drag employee names before/after other rows; the shared roster order persists independently from employee titles, accounts, and Google Sheet row order, with revision protection. Schedule range selection accepts any point within duty cells, suppresses native text selection, tracks the pointer across cells, and scrolls at the table edges for copying/pasting large blocks.
