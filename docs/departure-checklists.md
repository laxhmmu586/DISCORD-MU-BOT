# Departure checklists

The Departure action order is Charge Form, Checklist, Default, Clear. Checklist is available to linked LAX/MU Lead and higher roles in manager view. Its API uses the same Lead-level boundary as Departure Defaults; granting an Agent a general Briefing editing override does not grant checklist access.

AVIH and SERVICE DOG are shared, editable templates. Leads can change the Chinese and English titles and item text, add/remove items, and reorder them. Templates use optimistic revisions and audit records. Template edits apply to new forms; each saved form embeds its original template so previously completed checks never move to different requirements.

Each form is stored in the employee database with its own ID, flight, date, checklist type, answers, passenger details, notes, agent/supervisor names, revision and template snapshot. Multiple passenger forms may be saved for one flight. Save, switching templates/forms and closing preserve changed forms; save conflicts leave the current draft visible and offer Reload saved version or Discard draft and close. Print saves first, then opens the browser print dialog for A4 or Letter, including checked/unchecked boxes and filled values. Browser “Save as PDF” is supported.

## Sources

- AVIH: the user's image of 东航小动物运输地面检查单, supplied November 2, 2026. All 15 numbered items are transcribed; English translations accompany the Chinese. The source's telegram delay is blank, so the minutes remain an editable field rather than an invented default.
- SERVICE DOG: the supplied Service Dog Checklist 20260412.pdf, also available at https://drive.google.com/file/d/1ApV6-SKNtVYacc2dQHvq7VAvdnhSiVPx/view. The uploaded PDF and downloaded Drive file have SHA-256 `5ad16247181c659d18dd8c70763986268fcc8e003ccae39b47d8d1edf0c802ea`. All 12 items and the guide/hearing-dog scope are retained, including the two checks of muzzle/leash, 0.5 IU/ml threshold and PETC telegram. Paragraph wrapping, punctuation and minor English grammar are normalized for the editable template.

These are transcriptions of the supplied operational materials, not an independent policy update. Content changes are made through Edit template by authorized staff.

## Verification

Run `node --test test/departureChecklists.test.js` for role boundaries, form isolation, validation, concurrency, template snapshots, audit records and print markup. Run `node test/departureChecklists.browser.cjs` for the integrated Departure flow, template editing, saved forms, printing, mobile layout and permission revocation. The browser fixture uses fictional staff and passengers and writes screenshots/PDFs into `.verification/departure-checklists/`.
