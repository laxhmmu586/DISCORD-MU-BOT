# Workspace header

The shared employee workspace header puts Admin above Profile inside the avatar menu, preserving the existing Admin visibility checks. Briefing and Schedule move from the sidebar into an Account feature strip for LAX/MU. The avatar chevron uses a consistently sized SVG.

The Account selector reads only the authenticated employee's Main/Additional Account memberships from `/profile-api/workspace`. A single membership displays without a selectable arrow. Switching warns about unsaved work and reloads; the per-tab selection is committed only when navigation actually leaves. It does not edit employee identity or Main Account membership.

Report and Checklist API requests, plus Briefing and Schedule, carry `X-Workspace-Account`. The backend validates membership on every request. Report records remain keyed by account; omission of the header retains Main Account behavior. Invalid or revoked selections fail closed. A removed selection returns to the default on the next header refresh. Existing form approval and Admin authority remain governed by their original services.

The notification bell shows actual actionable requests (review, revision or completion) and pending/overdue Read & Sign documents, using RequestInbox. Clicking an entry opens its existing request or signing page. The badge is a pending-work count, not fabricated unread-message data. It refreshes after request/sign changes, focus and the existing minute timer.

Validation: `workspaceScope.test.js`, `employeeProfiles.test.js`, `hasReports.test.js`, `briefing.test.js`, `staffSchedule.test.js`; browser checks `workspaceHeader.browser.cjs`, `briefing.browser.cjs`, and `staffSchedule.browser.cjs`, including 320/390px layout, authorized switching, Admin menu order and notification counts. No production messages are sent.
