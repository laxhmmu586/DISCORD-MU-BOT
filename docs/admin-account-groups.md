# Employee administration account cards

The landing toolbar contains only Add account; employee editing, import, workflow and save controls appear after opening an account. The Admin landing view shows a responsive grid of Station / Account cards plus a permanent HeadQuarter card. Employee details appear only after opening a card; All accounts returns to the grid. Switching cards retains unsaved employee edits and custom row order. Original employee IDs and login mappings remain unchanged. Cards are grouped West Coast, Central U.S, East Coast in that order, with HeadQuarter in West Coast. Known airport codes determine the region; unknown stations remain visible under Other stations.

The account catalog is stored in `employee_account_groups` in the employee database, independently of the existing authentication link table `employee_accounts`. Existing non-HQ employees populate the catalog on startup and saves. Empty accounts persist across restarts. HQ titles and explicit HQ station/account values belong to HeadQuarter.

Full employee administrators can create accounts and delete empty accounts. Employee changes must be saved before account mutations. Both routes use the employee revision and a transaction; deletion checks the current employee roster and rejects occupied accounts. HeadQuarter cannot be removed.

Employees may have a primary account plus two additional existing Station / Account memberships. These are stored on one canonical record and displayed in each associated card; editing any copy synchronizes all copies before saving. Account deletion checks every membership. Business Managers receive only their linked Station / Account catalog entries and associated employees; HQ staff appear in station cards only when explicitly associated. They can read the group but retain the existing Agent-only PBB editing scope. Account creation/deletion and foreign-group writes are rejected by the server.

The Discord ID column is visible only inside LAX / MU. Other views preserve the underlying field while hiding its column.

The Info sidebar link is removed across the shared employee portal pages. Existing information resources remain accessible.

Validation: focused employee, Read & Sign and HAS PBB tests; a real local API browser fixture verifies the card grid, detail/back transitions, unsaved edits, ordering, account persistence/deletion, moving employees, PBB editing and Business Manager isolation. Viewports: 320, 390, 1024, 1440 and 2560 pixels. No production employee data is modified.
