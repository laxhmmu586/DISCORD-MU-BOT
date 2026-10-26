# Request New Access

The Form request-type menu shows **Request New Access** immediately above **Request Uniform** for an employee whose current position is Business Manager (including the legacy Manager title) and whose Main Account is a station account. Supervisors, other employees and HQ employees do not receive the creation option. Permission is also enforced by the API.

The form collects the target employee's name, EID and email. Station and Account default to the requesting Business Manager's Main Account, are read-only, and are checked again on the server. The title is `<station>/<account> Request New Access`, for example `LAX/CI Request New Access`. Secondary accounts never authorize a request for a different account.

1. Submit creates a persistent pending request visible to the requesting employee and Lake. It appears under Lake's Pending approvals.
2. Lake approves or rejects. The reviewer is the existing owner identity (`lake@mu.com`, `nextweek1216@gmail.com`, or its linked employee record), rather than every administrator or every employee holding a management title. Rejection requires a reason.
3. Approval changes the request to **Approved — awaiting requester completion**. It stays unfinished and alerts the requester in My requests and the Form navigation badge.
4. Only the original requester can select **Complete**. That action records completion separately and closes the workflow. A role change does not prevent the original requester from finishing their already-approved case.

The request and its approval/completion history survive reloads and service restarts. Request IDs make submission retries idempotent; revisions reject stale approval and completion actions. Other accounts cannot read or mutate a case. Creating the request does not provision an account or add an employee: access setup is handled separately, and the requester confirms when their work is finished. No email notification is sent by this workflow; it uses the existing in-app request inbox and attention badges.

Validation: `test/newAccessRequests.test.js` covers server roles, account boundaries, validation, revisions, submission retry, rejection, approval, persistence, completion and HTTP authentication. `test/newAccessRequests.browser.cjs` exercises the full workflow with separate requester/reviewer pages, mobile/desktop forms and the existing request dashboards.

The access form always displays three workflow nodes, including before submission: Employee, Lake approval and Requester completion. Review controls appear inside the current Lake node; the Complete action appears inside the requester node.

Existing Uniform, Incident, Expense and Terrific Business Manager nodes now show and authorize only Business Managers whose Main Account matches the requester’s current Main Account. Secondary membership does not qualify. Named assignments, route changes and transfers enforce the same rule; completed approvals retain their recorded history.

Profile photo selection now opens a crop dialog before uploading. PNG, JPEG and WebP files up to 20 MB and 60 megapixels can be moved/zoomed in the frame, then resized to a 512-pixel JPEG before the existing server normalization. Cancelling preserves the original image and other edits. Network errors retain unsaved data for retry.
