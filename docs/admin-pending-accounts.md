# Pending accounts and unsaved employee edits

The owner can open and refresh Pending even while the employee table has unsaved edits. The dialog lists newly loaded unassigned Firebase accounts and explains that employee changes must be saved before assigning an account. Configure is disabled while edits are unsaved; Save employee changes uses the existing employee-save path and then reloads the pending list and its employee revision. Failed saves leave assignment blocked. The final assignment handler checks for unsaved edits again.

Opening and Refresh both force a fresh directory read. There are no initial/background Firebase-list requests. Existing pending eligibility filters, owner-only access, disabled-account exclusions and revision checks remain in place.
