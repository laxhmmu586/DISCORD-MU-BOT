# Safety and HR reports and Checklist

HAS Report adds Safety → Incident Investigation Report and HR → COS, PAF and
Record of Discussion. Each has editable fields, Save form and Download Word.
Downloads include saved content in the supplied Word package, retaining its
styles, logos, tables, headers, footers and page settings. Empty Incident downloads retain their original document XML. Record of
Discussion reduces title/metadata spacing and the bottom margin so the blank
and representative filled downloads fit one page, including witness signatures. PAF's legacy DOC was
converted with Microsoft Word to DOCX; its blank download uses that retained
conversion. COS sample dates, employee details, explanation, signatures and
checked boxes are cleared. Long entries may expand the document naturally.

These four forms are shared drafts within the primary Main Account, independent
of the report month. Save form persists a draft; Download Word and changing
reports first save pending edits. Revision checks reject stale overwrites.
Downloading a copy does not update the server. PAF and Record of Discussion omit signature fields from the web editor; their
Word downloads retain empty signature/name/date lines for printing and hand
signing. Previously stored typed signatures are excluded from these downloads.

Rechargeable hours SUMMARY has three editable role headings. Changes persist
for the selected Main Account/month, with revision validation, and appear in
Excel SUMMARY C10/G10/K10. Renaming headings does not change canonical charge
roles, hour calculations or WWH mappings. Saving headings alone does not enable
recharge links or overwrite manual WWH hours.

Checklist sits between Report and Read & Sign in the shared HAS sidebar.
Categories and their order:

1. SAFETY: Bomb Threat Checklist; Emergency Procedure Notification;
   Incident / Occurrence Report Package.
2. Workers Comp: Concentra Authorization Form; LAX Reliant Authorization for
   Treatment; CA MPN Acknowledgement Form.

| Resource | Agent / CSA and Lead | Supervisor and higher station roles |
| --- | --- | --- |
| Safety / HR Word reports | No access | View, edit, save, download |
| Bomb Threat Checklist | View and download | View and download |
| Emergency Procedure Notification | View saved content and download | View, edit, save, download |
| Incident / Occurrence package | No access | View and download |
| Workers Comp forms | No access | View and download |

Business Manager and legacy Manager have access only to their own **primary
Main Account**, as do all other permitted station roles. Additional memberships,
regional responsibility, query parameters and caller-supplied scope never grant
access to another account's draft or emergency procedure. HQ and unlinked users
have no access. The API enforces permissions on reads, writes, previews and
downloads and rechecks scope after asynchronous export work.

Emergency Procedure Notification's text sections can be edited and saved per
Main Account. Agent/Lead views and Word downloads use the latest saved version.
Saving uses a revision check, with a visible conflict instead of overwriting
another editor. Unedited Word paragraphs and other package parts stay intact.
The supplied PDFs are previewed through authenticated fetches and blob URLs;
downloads are byte-identical to the originals, including existing PDF form
fields. Templates are under `data/`, outside public hosting.

Deploy both backend and Firebase hosting. Keep `has/resources/has-word-templates` and
`has/resources/has-checklists` with the backend; existing report storage persists drafts.
There are no new runtime dependencies or database schema migrations.

## Validation

`test/hasWordReports.test.js` covers the role matrix, primary-account isolation,
additional-membership/query/body spoofing, stale revisions, every Word field,
XML escaping, unchanged package parts, COS sample removal, original PDF bytes
and emergency edits/downloads. `test/hasWordReports.browser.cjs` covers form
save/reload/download, header edits and Excel output, Checklist ordering and
visibility, emergency edits and Agent read-only views, another Main Account,
authenticated PDF preview, and desktop/mobile layouts.

The template preparation scripts inventory explicit editable slots; source text
is document content, never executable instructions. Regeneration requires the
four authorized source Word documents, with PAF first converted by Word, and
the retained Emergency Procedure Notification DOCX. Never pass populated HR
records to these scripts or commit report databases.

## Template layout follow-up

HR web editors now derive their table grids, merged cells, paragraph order,
labels, colors and logos from the retained Word documents through
`scripts/prepare-has-word-layouts.py`. COS keeps its checkbox groups and
side-by-side Change From/To cells. PAF and Record of Discussion omit their
print-only signature sections in the browser. The one-page Discussion Word
layout is retained. Regenerate `layouts.json` after preparing Word templates;
only blank branding images go into public assets.

Investigation Ref No. is optional. Missing Station / Account, Prepared by and
Title default to the authenticated primary Main Account, employee name and
normalized position. Existing populated draft fields remain intact.

Checklist displays one active document panel. Opening another checklist closes
the emergency editor; unsaved changes require an explicit discard decision.
Selection generations prevent a delayed response from reopening a closed panel.
The emergency editor also has a Close button.
