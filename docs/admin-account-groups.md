# Employee administration account cards

The Admin landing view shows a responsive grid of Station / Account cards plus a permanent HeadQuarter card. Employee details appear only after opening a card; All accounts returns to the grid. Switching cards retains unsaved employee edits and custom row order. Original employee IDs and login mappings remain unchanged.

The account catalog is stored in `employee_account_groups` in the employee database, independently of the existing authentication link table `employee_accounts`. Existing non-HQ employees populate the catalog on startup and saves. Empty accounts persist across restarts. HQ titles and explicit HQ station/account values belong to HeadQuarter.

Full employee administrators can create accounts and delete empty accounts. Employee changes must be saved before account mutations. Both routes use the employee revision and a transaction; deletion checks the current employee roster and rejects occupied accounts. HeadQuarter cannot be removed.

Business Managers receive only their own Station / Account catalog entry and non-HQ employees. They can read the group but retain the existing Agent-only PBB editing scope. Account creation/deletion and foreign-group writes are rejected by the server.

The Info sidebar link is removed across the shared employee portal pages. Existing information resources remain accessible.

Validation: focused employee, Read & Sign and HAS PBB tests; a real local API browser fixture verifies the card grid, detail/back transitions, unsaved edits, ordering, account persistence/deletion, moving employees, PBB editing and Business Manager isolation. Viewports: 320, 390, 1024, 1440 and 2560 pixels. No production employee data is modified.
