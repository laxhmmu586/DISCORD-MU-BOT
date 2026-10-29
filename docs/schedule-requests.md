# Schedule requests and team view

Eligible LAX / MU employees can view the team's assignments and nicknames. Only Supervisor and above receive schedule totals, budgets, editing and approval controls. DEMO HAS / HAS OPS RAMP remain excluded unless identified as the explicitly enabled `test@hm.com` Schedule test account. `test@hm.com` is included in Schedule and its navigation for testing; its Read & Sign exclusion remains unchanged.

Employee view places the current employee first, separated from the team. Mobile employee view shows only avatars in its fixed left column; missing/broken photos fall back to name initials, and tapping an avatar shows the nickname above it. The compact team table keeps this column fixed and continuous dates starting with Today. Scroll dates horizontally and staff vertically; the avatar/name column, date header and employee’s own first row stay frozen. Staffing rules use the same Friday–Thursday periods. Today, Holiday and Short retain the existing colored hanging-ribbon styles in both layouts. Nicknames take precedence in both layouts; missing nicknames fall back to names.

## Requests

Employees select a date in their own row or use the request inbox. Pending markers are visible to their author and to supervisors in editing view. A trade partner sees a confirmation prompt on their own row. Other team members do not receive private request records or markers.

| Request | Approval and result |
| --- | --- |
| Request Off | Supervisor selects the green check or red deny button. Approval writes a red tile with a white X. |
| Trade Shift | The employee chooses a colleague. Only assignments on the same date are exchanged. The colleague must confirm before any approval or schedule change. |
| I Can Work | Available only on X or an unassigned date. A supervisor chooses a qualified shift to approve immediately, or uses the red deny button. |

Trade confirmation applies both changes in one SQLite transaction if no extra approval is needed. A resulting six-day week or more than 40 hours for either employee requires Supervisor+ approval after the colleague confirms. A seven-day working week is blocked even for supervisors. Counts and hours use actual individual duties; the team's fixed +40 reporting allowance is not added to an individual's hours.

All receiving employees must be qualified for the shift. Eligibility identifies only the duty, regardless of color. Supervisor+ select an employee and their duty checkboxes under **Edit Skill**. Legacy color-specific qualifications merge automatically; no week selector appears in this screen. Duty hours and second-account hours are available separately through **Second-account hours**. Known hours start from the existing duty durations (Q is a four-hour individual shift even though it contributes zero to team budget totals); unknown/custom duty hours must be entered before processing a trade. No qualifications are inferred from past assignments.

The settings screen also records total second/other-account hours per employee and Friday–Thursday week. Employees with another account require an explicit weekly value, including 0 when appropriate; missing values block trades instead of assuming zero. These hours count toward the 40-hour approval threshold. Qualification, hours, seven-day and original-assignment checks run again when confirmation/approval occurs.

Approvals and denials create persistent, private in-app notifications. Employees see the outcome in Schedule and can mark it read manually. Viewing a result card in the request window also automatically marks that visible result read. The request button shows the pending clock with a shake animation while there are visible pending requests, and the completed/check icon otherwise; unread decisions have a count badge. Reduced-motion preferences disable shaking.

Request UUIDs prevent duplicate submissions. Changed assignments return a conflict rather than overwriting a newer schedule. Declines and cancellations do not change assignments. Request actions, approvals, settings, and applied before/after assignments are audited.

## Attendance and date appearance

A successfully saved Call Off / Sick attendance request writes CS to the selected employee/date immediately, independently of Discord delivery. Its reference makes the schedule update idempotent. Coming Late does not change the schedule. N and CS use black backgrounds and red text, including existing assignments and legend entries.

**Delete date settings** clears a date's custom color, labels and Short-role settings with revision checks. Employee assignments and budgets remain intact. Coverage/employee header cells stay above scrolling dates so date headings cannot overlap the fixed label column.

## Validation

`test/scheduleRequests.test.js` covers authorization, private notifications, atomic same-date exchange, stale state, qualifications, secondary hours, six/seven-day rules, approvals and attendance updates. `test/scheduleRequests.browser.cjs` runs against a local real API and verifies employee/manager workflows, mobile fixed names, frozen date/self rows and continuous Today-first scrolling, nickname/self-first layout, request privacy, decision notifications and date-setting deletion. Fixtures do not send production notifications or modify production schedules.

## Live updates and manager controls

Authenticated live connections invalidate open Schedule views within approximately one second of saved changes, including trades, approvals, attendance and private request outcomes. Reconnection uses a five-second polling fallback. Active editors defer redraw until safe; mobile horizontal/vertical offsets are preserved. Request badges repaint after every layout change. Work Req uses a calendar/check icon and Off Req a red minus-circle icon. Mobile includes sticky role-group separators.

Supervisor editing view has a standard **Add/Edit** dropdown button beside Refresh with three actions: Add next month, Announcement and Edit Shift. Edit Skill remains separate. The selected-duty toolbar button and request actions inside manager shift menus are removed. Clicking the top avatar opens the account menu, including Logout; Profile remains a menu action.

Resolved request cards and outcome notifications remain visible for three days; pending requests remain until processed. Stored request/audit data is retained for history integrity. Result cards are compact, and visible outcome cards automatically mark their own notifications read while the manual Mark read action remains available.
