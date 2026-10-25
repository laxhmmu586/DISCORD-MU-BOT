# Briefing PDF attachments and schedule

The `/send` API accepts an optional `file` object with `name`, `contentType:
"application/pdf"`, and `base64`. It uploads the decoded bytes to Discord and
returns `success`, `messageId`, and `attachmentCount`. Text and embed requests
remain supported, including the existing ETAB suppression and boarding cleanup.
The integration limits PDFs to 8 MiB and validates the filename, Base64 encoding,
and `%PDF-` signature. This is a transport check, not a full PDF parser.

## Rollout

1. Deploy the backend from this PR using the existing backend deployment process.
   No dependency or environment variable changes are required. The default JSON
   limit is already 60mb. If overridden, allow at least 12mb. The reverse proxy
   must also allow 12 MiB requests (Nginx: `client_max_body_size 12m;`).
2. Replace the original Google Apps Script with
   [`scripts/apps-script/BriefingPDF.gs`](../scripts/apps-script/BriefingPDF.gs).
   Existing spreadsheet, folder, channel IDs and entry functions are preserved.
   PDFs use A1:R67, Letter portrait, fit to one page, 0.10-inch margins, and Drive backup.
   Portrait matches the tall briefing tables and reduces the wide side gaps.
   New files no longer explicitly enable public link sharing; folder inheritance
   still applies. Discord receives a PDF attachment rather than a Drive link.
3. Run `installBriefingPDFTrigger()` once in Apps Script and authorize it.
   It installs a minute checker and does not immediately send messages.
   Every day at UTC 15:49 it sends MU583 then MU586 to their existing channels:
   Los Angeles 08:49 PDT / 07:49 PST. Google scheduling may be delayed;
   the checker accepts a 15-minute catch-up window, through UTC 16:03.
4. Remove previous briefing send triggers in the Apps Script trigger UI.
   Installation replaces only this account's `scheduledBriefingPDFs` triggers;
   it cannot remove another account's triggers. Use one installing account.

The script serializes scheduled execution with a lock and records each flight's
daily attempt before sending. A failed flight does not prevent the other flight
from sending. It does not automatically retry failures because a timed-out
request may already have posted. Inspect execution logs and the channel before
manually running `sendArrivalPDFtoDiscord()` or `sendDeparturePDFtoDiscord()`.
Trigger status is stored in script properties under `BRIEFING_PDF_MU583_*` and
`BRIEFING_PDF_MU586_*`. Each status is `sending`, `sent`, or `failed: ...`.

`testArrivalPDFOnly()` and `testDeparturePDFOnly()` generate Drive backups only.
The other test entry points send real messages. `removeBriefingPDFTrigger()`
removes the new schedule. Backend deployment does not install Google triggers;
the Apps Script update and authorization are separate required steps.
