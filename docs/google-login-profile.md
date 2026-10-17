# Google login and employee profiles

Google sign-in uses the existing Firebase project and web SDK. Before deploying, enable the Google provider in Firebase Authentication, set its support email, and ensure the production web domains are authorized. See [Firebase Google sign-in setup](https://firebase.google.com/docs/auth/web/google-signin).

Deploy the backend and Firebase Hosting assets together. This PR does not deploy them. The backend automatically creates `employee_accounts`, `employee_avatars`, and `employee_link_attempts` in the existing employee database (EP.DB); existing employee rows and password accounts are retained.

A verified Google identity first matches an employee's contact email, ignoring case and surrounding spaces. The employee confirms full name, nickname, EID, phone, and email. An unmatched identity must enter an exact existing EID, including leading zeroes, then confirm that record. Unknown or ambiguous EIDs, duplicate Google links, removed employee records, and unverified Google identities are rejected with an administrator contact message. EID lookup/link attempts are limited to five per identity per 15 minutes. Successful links persist by Firebase UID and employee record ID, so changing a contact email does not break an existing link. No Firebase account is created by entering an EID.

Existing password sign-in remains available. External employee accounts whose Firebase sign-in email ends in the exact `@mu.com` domain keep the original entry flow, without employee matching, confirmation or EID verification. This exception applies to password and verified Google sign-in, including backend authenticated API access; lookalike domains do not qualify. If an external account has no linked employee record, Profile displays an external-account message instead of the EID form. Password users on other domains can associate their employee record from Profile. When Firebase reports an existing account with another provider, the login page asks for its password before linking Google and signing in with the Google credential.

`/profile-api` only returns the caller's employee details. Full name and EID are read-only. Nickname, phone and contact email are updated in the shared employee store with revision checks, so administration sees those changes and stale admin/profile saves cannot overwrite each other. The editable email is the employee contact address; it does not change the Firebase sign-in email or administrator permissions. Account menus show nickname, with full name or Account as fallback.

Avatars accept PNG, JPEG and WebP, up to 2 MB and 16 megapixels. The server decodes, rotates, crops and re-encodes them as 256×256 JPEGs. They are stored separately in EP.DB, survive admin edits, and can be removed. Account menus and Profile use the saved avatar, falling back to initials.

Validation:

```powershell
node --test test/googleEmployeeAuth.test.js test/employeeProfiles.test.js test/employeeDatabase.test.js test/employeeContacts.test.js test/pbb.test.js test/pbbPermissions.test.js
$env:PLAYWRIGHT_MODULE='path/to/playwright'
node test/employeeProfile.browser.cjs
git diff --check
```

Use a Node runtime compatible with the installed `better-sqlite3` binary. Browser checks use synthetic Firebase/API responses; they do not sign into a real Google account or prove production configuration. Screenshots are written to `.verification/profile/`.
