# Per-request approval node editing

Uniform defaults to Employee -> Business Manager -> Select next approver. The second node requires an explicit existing employee; selecting a person in the form also sets that node's position. The server rejects submission without this selection. Existing pending requests retain their saved routes; workflow migration changes only the default for future submissions.

Uniform, Incident Investigation, Expense and Terrific Ten forms use the shared node editor below the form. Requesters may change unfinished node positions and people or insert additional nodes, before submission and while pending. Already completed nodes remain immutable. Existing form eligibility and approver access restrictions are preserved. Report approver directories contain only people eligible to access that report type.

Report routes are saved with stable node IDs, positions, optional named assignees and required-node metadata. Decisions use the saved per-request route, including its dynamic length, instead of the global default. Named assignments override role-wide review access. Route updates require ownership, pending status and the current revision, retain approvals and append an audit history. Legacy records derive node IDs without rewriting their saved approvals.

Form fields are not redrawn when draft nodes change, so editing a route preserves typed content. Draft route choices survive save and submission. Workflow state is keyed by each report ID, preventing cross-form editor state from leaking between forms.

Validation: 63 focused server and export tests; real local API browser checks for all four forms at 390/1440px; Admin checks at 320/390/1024/1440/2560px. Tests use fictional profiles and stub notification delivery. No production requests, email sends or deployment were performed.
