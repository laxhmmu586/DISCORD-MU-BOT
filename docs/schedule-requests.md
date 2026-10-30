# Schedule requests and team view

Eligible LAX / MU employees can view the team's assignments and nicknames. Only Supervisor and above receive schedule totals, budgets, editing and approval controls. DEMO HAS / HAS OPS RAMP remain excluded unless identified as the explicitly enabled `test@hm.com` Schedule test account. `test@hm.com` is included in Schedule and its navigation for testing; its Read & Sign exclusion remains unchanged.

Employee view places the current employee first, separated from the team. Mobile employee view shows avatars with visible nicknames in its fixed left column; missing/broken photos fall back to name initials. Frozen bands have opaque backgrounds with spacing inside cells, so scrolling assignments cannot show through their gaps. The compact team table keeps this column fixed and continuous dates starting with Today. Scroll dates horizontally and staff vertically; the avatar/name column, date header and employee’s own first row stay frozen. Staffing rules use the same Friday–Thursday periods. Today, Holiday and Short retain the existing colored hanging-ribbon styles in both layouts. Nicknames take precedence in both layouts; missing nicknames fall back to names.

## Requests

Employees select a date in their own row or use the request inbox. Pending markers are visible to their author and to supervisors in editing view. A trade partner sees a confirmation prompt on their own row. Other team members do not receive private request records or markers.

| Request | Approval and result |
| --- | --- |
| Request Off | Supervisor selects the green check or red deny button. Approval writes a red tile with a white X. |
| Trade Shift | The employee chooses a colleague. Only assignments on the same date are exchanged. The colleague must confirm before any approval or schedule change. |
| I Can Work | Available only on X or an unassigned date. A supervisor chooses a qualified shift to approve immediately, or uses the red deny button. |

Trade Shift is available only when both employees have a scheduled working shift that day; blank dates, X and absence codes are rejected. The menu and compose selector hide unavailable request types. The partner dropdown shows only eligible colleagues; unqualified and otherwise blocked candidates are omitted. Trade confirmation applies both changes in one SQLite transaction if no extra approval is needed. A resulting six-day week or more than 40 hours for either employee requires Supervisor+ approval after the colleague confirms. A seven-day working week is blocked even for supervisors. Counts and hours use actual individual duties; the team's fixed +40 reporting allowance is not added to an individual's hours.

All receiving employees must be qualified for the shift. Eligibility identifies only the duty, regardless of color. Supervisor+ select an employee and their duty checkboxes under **Edit Skill**. Legacy color-specific qualifications merge automatically; no week selector appears in this screen. **Second-account hours** contains only Employee and Total hour. The saved value applies every week to the 40-hour check; legacy week-specific values remain a fallback until a recurring total is saved. Known hours start from the existing duty durations (Q is a four-hour individual shift even though it contributes zero to team budget totals); unknown/custom duty hours must be configured before processing a trade. No qualifications are inferred from past assignments. Picker, legend and request-catalog colors use the most common saved color for each duty in the current team’s future roster, falling back to configured defaults when unused. Individual color overrides remain unchanged.

The hours screen records a recurring weekly total per employee. Employees with another account require an explicit total, including 0 when appropriate; missing values block trades instead of assuming zero. These hours count toward the 40-hour approval threshold. Qualification, hours, seven-day and original-assignment checks run again when confirmation/approval occurs.

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

Employee desktop and mobile views retain the default-collapsed Clock-in Time card and collapsible Duty legend below the roster. Viewing the full team does not hide these reference panels. Unread Announcements remain above the roster with the existing per-employee Got it flow.

Pending Off Req and Work Req badges briefly sway every three seconds in desktop and mobile views. The animation pauses for users who prefer reduced motion; clicking and positioning are unchanged.

Request Off, Trade Shift and I Can Work now open their named form directly from a schedule cell; no request-type dropdown or second type selection appears. The generic New request entry offers compact type buttons. The inbox uses compact type icons, dates and outcome badges, and approved time off shows a red X. Eligibility, approvals, private notifications and three-day result retention are unchanged.

The shared header notification bell includes schedule approvals/partner confirmations that need the viewer’s action, and their unread decision notices. Pending requests merely awaiting somebody else are not counted. Links open the corresponding request directly on Schedule; decisions and read receipts update the badge without losing existing form or Read & Sign reminders. Mobile Friday–Thursday periods use the same red Friday boundary as desktop, including the frozen own row.

On mobile, the request shortcut shares the month-heading row and the content follows the measured header height without a vacant control row. Height-only resizes (such as browser chrome or keyboard changes) preserve the roster DOM and scroll position. Desktop does not construct a hidden mobile roster. Request-count-only updates and unchanged request markers avoid unnecessary rendering, and horizontal scrolling updates the month label only when the visible month changes.

Trades match each receiving employee’s saved incoming-duty Skill, irrespective of their current duty: C may exchange with Q, A or any other mutually qualified work duty on the same date. Identical no-op assignments are omitted. Any trade involving A (either direction or color) waits for colleague confirmation and then approval by one Supervisor or above. No second approver is required. Existing six-day/over-40-hour approval and seven-day rejection rules still apply, and current skills and original shifts are checked again before applying the atomic exchange.

Desktop grid/coverage scrolling is synchronized once per animation frame with passive listeners. Background refreshes wait until active scrolling settles, then preserve horizontal and vertical offsets. Each grid isolates its paint work from the rest of the page.

The inline duty picker omits EK and TK, adds a red C variant (the same C duty/Skill with #ff0000), and provides — to clear the assignment through the revision-protected API. Ordinary C and red C can be selected directly to switch colors. Previously saved EK/TK assignments remain intact.


Schedule synchronization uses the authenticated revision stream. The initial snapshot includes its opaque revision, so the first unchanged stream event, repeated revisions and heartbeats do not fetch or repaint the roster. Idle minute checks only handle the date rollover. Request badges and announcements refresh on actual invalidation, and unchanged responses keep their existing DOM. During a stream outage, the five-second fallback checks `/staff-schedule-api/revision` rather than downloading the full roster; reconnects retain the last revision. Failed changed-data reads retry until they succeed, then stop. Live loads are serialized, wait for desktop scrolling to settle, and preserve scroll offsets, filters and selection. Manual Refresh remains available.

Request card employee nicknames use the same font size as their request title on desktop and mobile.


Double-click a duty to edit its display text, color and remark. Supervisors can use custom text (up to 20 characters), including EK, CI or TI, and the label is shared with employee views and preserved by rich copy/paste. A custom label different from the original duty code is excluded from coverage counts and estimated Daily Hour/period totals; changing it back to the original code or clearing the override restores counting. The configured daily budget itself is unchanged.


On mobile, each remark badge is an independent accessible button. Tapping it opens a read-only dialog with the employee nickname, date and full remark, including remarks on colleagues' shifts; the duty/request action remains on the shift itself. Text is rendered literally, and closing the dialog keeps the roster position.

Supervisor-and-higher mobile views include Coverage details with the same role counts, Daily Hour, budgets and period totals as desktop. Coverage labels stay frozen while dates scroll, and horizontal date positions follow the mobile roster in either direction. The coverage table can independently reach its last date. Employee views continue to omit coverage and manager-only totals. The request status button uses blue paper/check artwork when clear and clipboard/clock artwork when pending, retaining pending counts, animation and reduced-motion behavior.
