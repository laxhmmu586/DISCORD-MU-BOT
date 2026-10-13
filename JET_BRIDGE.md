# Jet Bridge checklist

`/pbb.html` is a public English arrival/departure checklist. Separate browser sessions claim Driver or Spotter, see live SSE updates, select their role on the flight page, and sign using qualified employee names and EIDs. Opening the same current flight, gate and bridges joins the active checklist.

The simplified READY / SAFE / GO controls write the corresponding individual source checklist rows. Arrival gate/PPE and briefing questions default to YES and are hidden from the UI. Remote bay walk-through defaults to N/A. Departure door closure defaults to YES. Date is automatically the current Los Angeles day; no date field is shown. Gmail ETAB supplies only the flight's gate, including messages without an ETA. Missing gates allow manual entry. Block time accepts HH:MM or HHMM. There is no ETA display, 15-minute calculation or gate-arrival timestamp action.

SSE supports six simultaneous independent browser sessions on the same checklist. The live badge shows actual unique sessions and updates on connection/disconnection. Tabs from one session are counted once. Driver and Spotter remain the two operational owners; additional sessions observe their updates. Connections send 15-second keep-alives and automatically reconnect after interruption.

Completed PDFs load the supplied source PDFs and overlay answers, names, EIDs and signatures. Original page content and page sizes are retained. Embedded JSON preserves operational audit details. Both signatures are required before PDF generation and delivery. Successful delivery targets are retained when retrying failed targets.

## Configuration

- Deploy the existing Node backend and Firebase public directory together. `PBB_DB_PATH` defaults to `data/pbb.db`; use a persistent volume. SQLite and SSE currently require one backend instance.
- Employee administration verifies Firebase identity (`FIREBASE_PROJECT_ID`, default `china-eastern`) and permits only `lake@mu.com` and `tamsun@hm.com`. The account menu entry opens `admin.html` below Change Password.
- Import the supplied private roster through Admin → Import JSON → Save, or provision `PBB_EMPLOYEE_SEED_JSON` / `PBB_EMPLOYEE_SEED_PATH`. The default private seed path is `data/employee-seed.json`, excluded from Git. Initial seed data never overwrites an existing database. The public repository contains only synthetic test employees.
- Gmail uses the existing Gmail OAuth configuration with mail read access. ETAB lookup restricts approved senders and matches flight/date; the newest matching message wins.
- Google Drive uses `GOOGLE_CLIENT_EMAIL` and `GOOGLE_PRIVATE_KEY`. Grant that service account permission to create files in the target folder; its Drive configuration must support service-account uploads. `PBB_DRIVE_FOLDER_ID` defaults to `1wMyB23ikaAnbkhJZcKBKBNujEeeY7Xsu`.
- The existing Discord bot needs channel access and attachment permissions. `PBB_DISCORD_CHANNEL_ID` defaults to `1559561919826890852`.

## Validation

Run `npm test`. `scripts/verify-pbb-ui.cjs` additionally exercises six independent browser sessions, employee administration, ETAB gate autofill, role selection, hand signals, signatures, responsive layout, and PDF output. Its external delivery and mail dependencies are fixtures; it does not send test files to production channels or folders. Live credentials and destination permissions need verification in the deployment environment.

Illustrations are generated reference images, not operational instructions. Final assets and generation specifications are in `public/public/assets/pbb/image-prompts.json`.
