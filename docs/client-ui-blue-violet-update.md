# 2.1.10 blue/violet UI update

The signed UI release `ui-blue-violet-stable-checks-20261107` replaces completed green cards with blue glass and pending silver cards with violet glass. A small translucent SVG ribbon occupies only the lower-right corner (maximum 76px wide and 28px high); status geometry and original node handlers remain intact. Attention states retain their existing amber styling.

GD CHECK and Meal Order retain their latest authoritative Gmail result while the same inputs are rechecked in the background. GD is keyed by employee, flight/date, registration and normalized crew passports. Meal is keyed separately by employee, flight/date, reservations and local preorder counts. A changed GD expectation does not clear Meal, and changed meal counts do not clear GD. New authoritative results, including mismatches or missing mail, always replace the previous result. The cache is limited to the current client session, survives page reloads, and expires after 24 hours. No Gmail parsing or backend permissions change.

A small helper replaces the ambiguous “safe moment” message in Settings with concrete instructions: close Settings, return to flight selection or login, then leave the page idle for about 30 seconds. It does not alter the native updater's safety rules.

The 2.1.10 feed now serves signed sequence 3, bound to bundled-web baseline `ef2595b14a24ab0a3a6aa55250ef55203635c99577d590f6c73ea3de7bed3fbb`. Seven allowed frontend files total 428255 bytes; protected desktop/native files are unchanged. The UI release replaces sequence 2's earlier palette. Existing 2.1.10 clients download it through their configured update feed; no Core installer or version bump is required.

Validation: seven state-retention regressions; browser previews of completed, pending and attention states; clear-message DOM behavior; the actual 2.1.10 verifier downloaded, verified, activated and reloaded the signed snapshot in isolated directories, including live HTTPS verification. Preview data is simulated. The installed working employee session was not refreshed or modified.
