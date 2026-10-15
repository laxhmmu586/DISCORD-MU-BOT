# ETAB advisory integration (local preview)

ETAB email parsing, image rendering and ordered Discord delivery now run in the MUFC bot. The Apps Script is not required after cutover. No PR or live cutover has been performed.

## Polling and workload

- America/Los_Angeles, including daylight saving: 21:00–12:00 every 5 minutes; 12:00–21:00 every 15 minutes. Approximately 216 mailbox list requests per day, with full bodies cached (up to 50 messages). No Sheets read or rendering for unchanged content.
- Each cycle finishes before the next timer starts. Google requests have 15 second timeouts, and body requests run sequentially. Background image work uses asynchronous sharp operations; no synchronous sleeps are added to the bot's request handlers.
- Search the existing authenticated Gmail mailbox for the original two senders, `subject:ETAB newer_than:3d`, inspect up to 15 messages and select the newest valid advisory by Gmail internal timestamp. Startup can publish the latest advisory from this window; it does not replay the full history.
- Deduplicate on the full parsed flight/date/data, so a passenger or registration correction can also produce a new advisory. Durable state in the existing PBB SQLite database survives restart. Use one enabled bot instance for this channel.

## Data and delivery

- Schedule remains `12NH3eQTx6GuOWHWgi4kxI0UsKgaJXW_ceKDnMGF3Zlo`, `Live Schedule`. Read the second row as dates, names in column B, and shift exactly `A`. Dates use Sheets serial values to avoid server locale ambiguity.
- Match names case-insensitively to the server's employee database (`EP.DB`, the same store as employee administration), then use its `discordId`. Missing, ambiguous or invalid mappings stop delivery with a diagnostic, allowing correction before a later retry. Employee IDs are not read from the old employee Sheet.
- Clock-in retains every minute boundary of the supplied Apps Script, including midnight rollover. STD still takes precedence over ETD.
- Send the PNG first, then a separate ordinary Discord message with `## 👥 Arrival Team`, `## 🕒 Clock-in　**0830L**`, and one `<@id>` per line. Only resolved employee IDs can be mentioned. Discord supplies each member's current display name.
- Persist the image message ID before sending the team message. If the team message fails, retry only that second part on the next cycle. Deterministic Discord nonces reduce duplicate sends after an ambiguous network response; Discord's nonce deduplication has a limited time window, so this is not an absolute exactly-once guarantee across a crash immediately after sending.
- TBA: night/yellow. Ordinary gate: day/green. Gates 201–225 (including suffixes): red sunset/red, with MSC operation notice. Arrival/Departure show flight numbers without appended dates; the top date remains. STD/ETD is one line with the same numeric font as ETA.

## Cutover

The service is disabled by default to keep previews from posting alongside the old trigger. After reviewing the images, deploy the code/dependencies/assets, verify Gmail and schedule access and employee Discord IDs, disable the Apps Script trigger, then set `ETAB_ADVISORY_ENABLED=true` and restart the bot. Set it to `false` to stop this integration before restoring the old trigger. Existing Google OAuth and Sheets service account configuration is reused.

Optional environment variables: `ETAB_DISCORD_CHANNEL_ID` (default `1252026975720046655`), `ETAB_SCHEDULE_SHEET_ID` (default above). Database location follows the existing `PBB_DB_PATH`; employee store follows `PBB_EMPLOYEE_DB_PATH`.

## Preview and verification

`node scripts/preview-etab.cjs` writes the three 900×900 PNGs and a comparison to `.verification/etab/`. Production rendering uses `assets/etab/{day,night,msc}-template.png` and the bundled OFL-licensed Archivo Black font. The source triptych is an imagegen edit of the supplied original artwork, preserving its heading, runway and soft neon glass. Gate and lower cards include subtle etched aviation textures; ETA keeps its clock dial. Operational text and circle-plane icons are composited deterministically. STD/ETD labels have a 22-pixel gap before the time, and the complete group is centered.

`node --test test/etabAdvisory.test.js test/pbbEtab.test.js` checks original clock-in equivalence across all 1,440 minutes, the supplied mail formats, gate selection, date rollover, schedule lookup, mentions, deduplication and interrupted sends. Local previews do not access Gmail, Sheets or Discord. Live access, channel appearance and runtime load still require verification in the configured server environment.
