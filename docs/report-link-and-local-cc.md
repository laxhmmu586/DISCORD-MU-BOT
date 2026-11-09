# Report navigation and local CC verification

The website and MUFC sidebar Report entry links to `https://has-station.com/has-report`. MUFC opens that exact HTTPS address in the system browser; other external navigation keeps its existing restrictions. Request is removed from the sidebar menu and static page fallbacks.

MUFC 2.1.13 starts from the published 2.1.12 installer (SHA-256 `089c2fda9abdc4dbd4bfa4b92a094b989494f3a0a48b62d3412804bb31cc6c60`), preserves its server changes, and includes the previously published blue/violet palette and completed email-check retention. Apply `scripts/prepare-report-link-desktop.cjs` to an extracted desktop source before packaging.

CC already uses local terminal logs. `/search` reads `LogStore`, and `local-search.js` scopes the combined logs by flight/date before passing them to `findSYInfo`. CC completes from an accepted `AIRPORT CLOSED` response or a matching SY CC status. Gmail enrichment only updates GD CHECK and Meal Order; it does not supply CC. No Drive lookup is involved in this desktop CC path.

Validation against the packaged source confirmed that a newly appended local CC response changes the cached result to complete, while another flight's CC response remains excluded. The existing parser and local-refresh suites passed all 25 tests. Website and desktop menu execution verified the exact Report address, active state, Request removal, and the desktop browser-opening handler. Packaged source bytes and the installer Authenticode signature were checked.
