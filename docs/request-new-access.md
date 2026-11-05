# Request New Access

The Form request-type menu shows **Request New Access** immediately above **Request Uniform** for an employee whose current position is Business Manager (including the legacy Manager title) and whose Main Account is a station account. Supervisors, other employees and HQ employees do not receive the creation option. Permission is also enforced by the API.

The form collects the target employee's name, requested title, optional EID, and email or preferred username. Station and Account default to the requesting Business Manager's Main Account, are read-only, and are checked again on the server. The title is `<station>/<account> Request New Access`, for example `LAX/CI Request New Access`. Secondary accounts never authorize a request for a different account.

1. Submit creates a persistent pending request visible to the requesting employee and Lake. It appears under Lake's Pending approvals.
2. Lake approves, rejects, or returns the request to its requester for revision. Rejection and return require remarks. The reviewer is the existing owner identity (`lake@mu.com`, `nextweek1216@gmail.com`, or its linked employee record), rather than every administrator or every employee holding a management title. Rejection requires a reason.
3. Approval changes the request to **Approved — awaiting requester completion**. It stays unfinished and alerts the requester in My requests and the Form navigation badge.
4. The original requester can select **Complete**. If no confirmation occurs within seven days (168 hours) of approval, the server completes the request and records a System completion event. A role change does not prevent manual completion. The server checks on startup, every minute, and before reads; overdue requests therefore recover after restarts.

The request and its approval/completion history survive reloads and service restarts. Request IDs make submission retries idempotent; revisions reject stale approval and completion actions. Other ordinary accounts cannot read or mutate a case. Configured administrators may view and delete records; this does not grant approval authority. Creating the request does not provision an account or add an employee: access setup is handled separately, and the requester confirms when their work is finished. No email notification is sent by this workflow; it uses the existing in-app request inbox and attention badges.

Validation: `test/newAccessRequests.test.js` covers roles, account boundaries, revisions, retry, return/resubmit, recall, deletion tombstones, HTTP authentication, and exact seven-day completion/restart boundaries. `test/requestRedesign.browser.cjs` exercises separate requester/reviewer pages, the two-pane request manager, mobile layouts, preserved remarks, recall/edit, return/resubmit, deletion and ordinary approval/completion.

The access form displays three workflow nodes: Employee, System Admin and Requester completion. Inputs and decisions live in Your Review; timeline cards show read-only state, time, Action and Remarks. Typed remarks are retained; only an empty approval note defaults to `Approve`.

Before requester completion, the person who submitted a review may recall it with a revision check. Recall restores the saved note for editing, retains the prior review in the audit history, and returns the request to pending. A new approval starts a new seven-day completion window. Completed requests cannot have their reviews recalled.

The requester and configured administrators can delete requests from any state. Deletion hides the record and retains a tombstone so stale submissions cannot recreate it. Administrator delete authority also applies to Uniform, Incident, Expense and Terrific requests; requester withdrawal authority is unchanged.

Pending approvals, My requests and My approvals open a Permission-style manager with a searchable request list and a detail pane. Administrators also receive an All requests view. The four main entry buttons form a compact two-by-two grid on phones, without horizontal scrolling. Mobile request lists scroll vertically.

Existing Uniform, Incident, Expense and Terrific Business Manager nodes now show and authorize only Business Managers whose Main Account matches the requester’s current Main Account. Secondary membership does not qualify. Named assignments, route changes and transfers enforce the same rule; completed approvals retain their recorded history.

Profile photo selection now opens a crop dialog before uploading. PNG, JPEG and WebP files up to 20 MB and 60 megapixels can be moved/zoomed in the frame, then resized to a 512-pixel JPEG before the existing server normalization. Cancelling preserves the original image and other edits. Network errors retain unsaved data for retry.
