# Schedule requests and team view

Eligible LAX / MU employees can view the team's assignments and nicknames. Only Supervisor and above receive schedule totals, budgets, editing and approval controls. DEMO HAS / HAS OPS RAMP remain excluded unless identified as the explicitly enabled `test@hm.com` Schedule test account. `test@hm.com` is included in Schedule and its navigation for testing; its Read & Sign exclusion remains unchanged.

Employee view places the current employee first, separated from the team. Mobile employee view shows only avatars in its fixed left column; missing/broken photos fall back to name initials, and tapping an avatar shows the nickname above it. The compact team table keeps this column fixed and exactly one Friday–Thursday period. Swipe left/right or use the week buttons to change periods; the name column stays in place. Staffing rules use the same Friday–Thursday periods. Today, Holiday and Short retain the existing colored hanging-ribbon styles in both layouts. Nicknames take precedence in both layouts; missing nicknames fall back to names.

## Requests

Employees select a date in their own row or use the request inbox. Pending markers are visible to their author and to supervisors in editing view. A trade partner sees a confirmation prompt on their own row. Other team members do not receive private request records or markers.

| Request | Approval and result |
| --- | --- |
| Request Off | Supervisor selects the green check or red deny button. Approval writes a red tile with a white X. |
| Trade Shift | The employee chooses a colleague. Only assignments on the same date are exchanged. The colleague must confirm before any approval or schedule change. |
| I Can Work | Available only on X or an unassigned date. A supervisor chooses a qualified shift to approve immediately, or uses the red deny button. |

Trade confirmation applies both changes in one SQLite transaction if no extra approval is needed. A resulting six-day week or more than 40 hours for either employee requires Supervisor+ approval after the colleague confirms. A seven-day working week is blocked even for supervisors. Counts and hours use actual individual duties; the team's fixed +40 reporting allowance is not added to an individual's hours.

All receiving employees must be qualified for the shift. Eligibility identifies the duty and its color, so red A and dark-green A are distinct. Supervisor+ configure qualifications and duty hours under **Shift eligibility & hours**. Known hours start from the existing duty durations (Q is a four-hour individual shift even though it contributes zero to team budget totals); unknown/custom duty hours must be entered before processing a trade. No qualifications are inferred from past assignments.

The settings screen also records total second/other-account hours per employee and Friday–Thursday week. Employees with another account require an explicit weekly value, including 0 when appropriate; missing values block trades instead of assuming zero. These hours count toward the 40-hour approval threshold. Qualification, hours, seven-day and original-assignment checks run again when confirmation/approval occurs.

Approvals and denials create persistent, private in-app notifications. Employees see the outcome in Schedule and can mark it read. The request button shows the pending clock with a shake animation while there are visible pending requests, and the completed/check icon otherwise; unread decisions have a count badge. Reduced-motion preferences disable shaking.

Request UUIDs prevent duplicate submissions. Changed assignments return a conflict rather than overwriting a newer schedule. Declines and cancellations do not change assignments. Request actions, approvals, settings, and applied before/after assignments are audited.

## Attendance and date appearance

A successfully saved Call Off / Sick attendance request writes CS to the selected employee/date immediately, independently of Discord delivery. Its reference makes the schedule update idempotent. Coming Late does not change the schedule. N and CS use black backgrounds and red text, including existing assignments and legend entries.

**Delete date settings** clears a date's custom color, labels and Short-role settings with revision checks. Employee assignments and budgets remain intact. Coverage/employee header cells stay above scrolling dates so date headings cannot overlap the fixed label column.

## Validation

`test/scheduleRequests.test.js` covers authorization, private notifications, atomic same-date exchange, stale state, qualifications, secondary hours, six/seven-day rules, approvals and attendance updates. `test/scheduleRequests.browser.cjs` runs against a local real API and verifies employee/manager workflows, mobile fixed names and week swiping, nickname/self-first layout, request privacy, decision notifications and date-setting deletion. Fixtures do not send production notifications or modify production schedules.
