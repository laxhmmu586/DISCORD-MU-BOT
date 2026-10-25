# System-managed briefing PDFs

The MUFC backend generates and sends both briefing PDFs itself. No Google Apps
Script installation, synchronization, authorization, or trigger is required.
The existing Google spreadsheet remains the data source; the system uses its
existing Google service account connection to read it and export each tab.

Every day at UTC 15:49 (Los Angeles 08:49 PDT / 07:49 PST), the backend exports
ARRIVAL and DEPARTURE, range A1:R67, as portrait Letter PDFs with single-page
scaling and 0.10-inch margins. This replaces the landscape layout that left wide
blank side areas. A restart after the scheduled time catches up the current day.

- MU583 Arrival: Discord channel 1563411695936864447
- MU586 Departure: Discord channel 1563411615351574528

Delivery state persists in briefing_deliveries in the existing system SQLite
database. Completed flights are skipped across restarts. Export failures retry
after five minutes without blocking the other flight. An ambiguous Discord send
is reconciled against the bot's recent PDF attachments; it is never blindly
resent. Unconfirmed deliveries remain uncertain for investigation.

The /send endpoint ignores legacy Apps Script briefing uploads for the known
briefing channels to prevent duplicate posts. Other text, embed, and PDF requests
retain their existing behavior and 8 MiB PDF attachment limit.

Deploy the backend through the existing process. The existing Google service
account must have read access to spreadsheet
1-BnQrtRj6-uTgoC89uj8zQ1dZTcSh96QFRH-_Tf4JEQ. The Discord bot must be able to view
channel history and send attachments in the two destination channels.
Old Google briefing triggers may be removed later, but the system does not rely
on them and ignores their duplicate send requests.
