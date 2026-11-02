# Departure checklist templates

Departure actions are Charge Form, Checklist, Default, Clear. Checklist is limited to linked LAX/MU Lead and higher roles in manager view, enforced on the template API as well as the button. AVIH uses a pet-dog icon and SERVICE DOG uses a harnessed service-dog icon.

The dialog is a read-only paper preview with Edit template and Print actions. Flight, date, passenger, signatures, notes and checkboxes remain blank for completion on paper. There are no online answers, passenger inputs, completion tracking or saved checklist records. Printing does not write any form data.

Lead and higher roles may edit the shared Chinese/English titles and items, add/remove items and reorder them. Only templates are stored, with optimistic revisions and audit records. A4/Letter printing and browser Save as PDF are supported; the default AVIH template fits one sheet and SERVICE DOG uses two. Longer edited templates may expand pagination. Legacy passenger-record tables from the earlier version are left untouched, but their endpoints and UI are removed.

## Sources

- AVIH: the user's image of 东航小动物运输地面检查单, supplied November 2, 2026. All 15 numbered items are transcribed; English translations accompany the Chinese. The source's telegram delay is blank, so the minutes remain an editable field rather than an invented default.
- SERVICE DOG: the supplied Service Dog Checklist 20260412.pdf, also available at https://drive.google.com/file/d/1ApV6-SKNtVYacc2dQHvq7VAvdnhSiVPx/view. The uploaded PDF and downloaded Drive file have SHA-256 `5ad16247181c659d18dd8c70763986268fcc8e003ccae39b47d8d1edf0c802ea`. All 12 items and the guide/hearing-dog scope are retained, including the two checks of muzzle/leash, 0.5 IU/ml threshold and PETC telegram. Paragraph wrapping, punctuation and minor English grammar are normalized for the editable template.

These are transcriptions of the supplied operational materials, not an independent policy update. Content changes are made through Edit template by authorized staff.

## Verification

Run `node --test test/departureChecklists.test.js` for authorization, template updates, validation, revisions, audit records, retired form endpoints and blank print markup. Run `node test/departureChecklists.browser.cjs` for read-only previews, dog icons, shared editing, actual print frames, no form writes, mobile layout and permission revocation. Test outputs are under `.verification/departure-checklists/`.
