# Employee account switching and shared membership

The HAS PBB Current account panel displays one button per assigned account, up to three. Selecting an account loads its own schedules, default flights, gate locks and records. The choice is remembered per employee in the browser session and never changes the saved Main account. Duplicate airline labels include the station so they remain distinguishable.

All HAS PBB requests, PDF downloads and live streams include the chosen station/account. The server checks current employee membership before reading or mutating that scope, and checks live subscriptions again during events and heartbeats. Revoked membership blocks further operations; the browser returns to the main account on its context refresh. Existing certificate validation still uses the selected station and gate. The legacy PBB page is unchanged.

Employee administration replaces separate Station / Account fields with a Main account selector. Main, 2nd and 3rd account choices continue to save one canonical employee record. Business Manager management scopes include every assigned account.

Business Managers can add Agents inside their managed account cards. An exact Employee ID lookup first checks for an existing record. A matching Agent requires explicit Add as second account / Add as third account confirmation; the server appends membership without replacing the ID, name, login mapping or other employee details. New Agents may be created only within a managed account. Ambiguous IDs, non-Agent existing records, full memberships, unauthorized scopes, stale revisions and unconfirmed existing matches are rejected. Lookup responses omit contact and login details. Existing Agent-only PBB edit permissions remain unchanged.

The Administration heading is now ADMINISTRATION without the duplicate eyebrow. The landing view hides Employee Information and total employee count. Original Login ID is visually hidden while its data remains intact. The add/link dialog uses the portal's blue styling and a responsive two-step layout.

Validation: 56 focused employee/HAS PBB tests; real local API browser checks for 1/2/3 account buttons, switching flights/gates, session restore, membership revocation, Main account changes and identity preservation, manager second/third-account linking and multi-account management. Viewports: 320, 390, 1024, 1440 and 2560px as applicable. Existing flight-operation synchronization checks also pass. No production data or delivery was exercised.
