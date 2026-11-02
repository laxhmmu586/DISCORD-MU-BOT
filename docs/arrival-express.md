# Arrival Express

The Arrival Briefing Express button opens a shared list keyed by arrival date and flight. Enter name, seat, flight and destination manually; the Short Connection total is always the number of passengers. Arrival staff assigned shift A today and briefing editors can save and prepare emails; eligible Briefing readers can view and print. Revision checks prevent overwriting another person's changes.

The list is stored in the existing website employee SQLite database. Opening a cached list checks its revision first. While the dialog is visible, clean and idle, a small version check runs every 60 seconds; the full list is fetched only after a revision change. Saving is explicit, with no write for an unchanged list.

## CBP application

The original supplied Word document is preserved in `has/resources/express/express-connect-source.docx`. The blank PDF is a native Word export with only the example ETA and passenger count removed. The original logo and static layout are preserved. `template.json` records asset hashes and field coordinates. Reference/blank render comparison found no changed pixels outside the two value slots.

Email uses the selected arrival flight, ETAB ETA and passenger total. The sending date uses Los Angeles time. The recipient is fixed to `lax-watch-cmdr@cbp.dhs.gov`. Email opens an attachment/body preview first; only Send email performs delivery through the existing Gmail sender. The PDF bytes shown are stored with the preview and attached unchanged. A changed list, ETA, sending date or preview older than 30 minutes requires a new preview. Durable delivery claims prevent concurrent/duplicate sends; an uncertain delivery requires checking Sent Mail rather than automatically retrying.

## Passenger posters

Print preview generates one A4 landscape page per passenger, with exactly two visible lines: name, then destination (for example `DL555/JFK`). Seat and flight remain in the shared list but are omitted from posters. Font size fits each line to the page. Print all opens one print job for the complete PDF. PDF preferences request single-sided printing and actual size; the operator's printer settings still apply.

## Validation

Focused server tests cover persistence, derived totals, revisions, permissions, ETA/date formatting, immutable previews and duplicate delivery handling. The browser fixture covers editing, shared read access, cached reopening, attachment preview and one-call batch printing at desktop/mobile widths, using actual PDF generation and a mocked email sender. No real CBP email or physical print is used for testing.
