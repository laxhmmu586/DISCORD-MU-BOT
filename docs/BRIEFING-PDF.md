# Retired Google Sheets Briefing sender

The legacy daily MU583/MU586 Discord sender (PDF attachment plus Open briefing sheet Google Sheets link) is retired immediately, ahead of its former November 1 cutoff. The backend no longer constructs or starts the scheduler. Its compatibility service is inert, including retries, catch-up and restarts. Existing delivery history and posted Discord messages are retained.

The /send endpoint continues to suppress matching legacy Apps Script uploads in the known Briefing channels, so old triggers cannot reintroduce these posts. Other /send messages and attachments remain supported.

Website Finish PNG delivery, PDF archiving to Drive, ETAB, and LDM/CPM mail remain separate and enabled. The exporter utility is retained for existing callers, but is not scheduled. Deploy/restart the backend to apply this retirement to the running service.
