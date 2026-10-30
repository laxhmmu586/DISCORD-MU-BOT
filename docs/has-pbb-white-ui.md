# HAS white workspace and default flights

This follow-up keeps the original PBB page unchanged. HAS and Dashboard use a white workspace, the supplied Hallmark company logo, the existing linked Profile avatar/menu, and an adjacent Dashboard entry restricted to the existing dashboard audience.

## Gate entry

The final reference is the pale airport illustration with a central blue gate sign. Gate is entered directly into that sign; there is one Gate input. Flight number and the current Account are below it. Spotter/Driver buttons occupy the second row. The business date and Arrival label are inside the Account card. Desktop and mobile show only the center gate marker. The repeated name badge, Arrival/Driver/Spotter subtitle and Today's shared checklists section are removed.

Operators enter the same flight, Gate and bridge to reopen the same shared checklist. Existing record identity, role ownership, SSE synchronization and signature gates remain unchanged.

## Default flights

`has_pbb_flights` persists flight numbers by station/account. Linked users can choose saved flights from the dropdown. Only employees whose current saved Position is `Manager` can add or delete defaults, enforced on every mutation by the server. Managers see an add button and an X beside each saved flight. Deleting a default never deletes past checklists. A user-supplied station, account or role cannot override the linked employee's saved permissions.

- `GET /has-pbb-api/flights`: read current scope's defaults.
- `POST /has-pbb-api/flights`: add a validated flight number, idempotently.
- `POST /has-pbb-api/flights/:flightNo/delete`: delete a default in the current scope. POST matches the application's supported cross-origin methods.

## Dashboard and personnel table

Dashboard follows Profile's topbar/sidebar/card structure in white. Daily bars compare expected flights with submitted checklist counts. The coverage ring uses unique covered flights, so multiple bridge forms for one flight cannot inflate coverage. For a single station/account over seven days, the default expectation is seven flights. Existing Station/Account/date filters update the cards, charts, tables and overall totals together. Late responses from older filter requests cannot replace newer results.

The personnel table assigns widths to every column, including Station, Account, PBB ID and expiry. It scrolls horizontally inside its card on desktop instead of squeezing headers into individual vertical letters. Existing mobile employee cards and canonical employee data are preserved.

## Assets

The supplied JPEG company logo is preserved in full as `has/public/assets/pbb/hallmark-logo-rgb-v1.webp`.

The built-in ImageGen tool produced the following raster WebP assets. The final consuming paths and prompts are retained here.

### Equipment inspection

Path: `has/public/assets/pbb/has-equipment-yellow-bumper-v4.webp`

Prompt: Edit Image 1, the photographic jet-bridge equipment montage, using Image 2 as the correct BUMPER reference. The user identifies BUMPER as the YELLOW HORIZONTAL THRESHOLD / FLOOR EDGE STRIP at the aircraft doorway, indicated by the red arrow in Image 2. It is NOT the black exterior rubber pad currently labelled Bumper in Image 1. Remove that incorrect Bumper label from the black pad. Recompose as a coherent photographic training montage: TOP HALF wide exterior scene showing the China Eastern aircraft and bridge canopy and roll-up Roller door, keeping Canopy and Roller door labels accurate. BOTTOM HALF three equal photographic closeups: first the YELLOW HORIZONTAL BUMPER STRIP across the bridge/aircraft doorway threshold, with blue-trimmed aircraft door visible at one side, no people; label exactly 'Bumper' with pointer to YELLOW STRIP. Second the black safety shoe SENSOR STORED UPRIGHT in its cream wall-mounted open-top metal storage box, as already shown in original, label 'Safety shoe'. Third a metal safety chain secured across the jetbridge entrance, label 'Safety chain'. Preserve realistic photography, industrial textures, matching daylight and English callout style. No cartoons, no UI. Do not put the safety shoe under a door. Do not call any wheels rollers. Roller door remains a vertically opening shutter with horizontal slats. Bumper arrow must point to yellow strip, NOT black pad. Do not reproduce the reference red arrow or people.

### Pale airport background

Path: `has/public/assets/pbb/has-gate-airport-pale-v1.webp`

Prompt: Create a clean pale-blue aviation illustration background for an editable airport gate confirmation banner, using this reference only for visual style and airport scene. Wide landscape 2.4:1 ratio. Near-white, very light icy-blue and subtle cyan palette with delicate flowing blue ribbon curves. Minimal architectural airport control tower silhouette on the far right. Along the lower third, a softly rendered 3D terminal concourse stretching horizontally with THREE PARKED AIRLINERS, one centered and one on each side, small jetbridges connected to them; perspective from above, aircraft tails toward bottom edge. Use soft realistic 3D dimensional airport miniatures with low contrast and light-blue/gray shading. IMPORTANT: OMIT all text, title, icons in square boxes, gate number, dark-blue input card, blue selection dots, connector lines and all UI from the reference. Leave the upper-left and middle of the image airy, almost-white and uncluttered for real HTML text and input to be rendered separately. The only rendered items should be airport architecture, three small airplanes along bottom, control tower far right, tiny subtle airplane silhouette to left-middle, and faint curved ribbons. No labels, numbers, watermarks or borders. Keep full illustration with nothing cropped.

## Validation

58 focused service/employee/legacy PBB tests pass, including Manager-only mutations, account isolation, normalized/idempotent flight saves, deletion without checklist loss and immediate permission revocation. The HAS browser verifier covers direct gate input, adding/selecting/deleting defaults, ordinary-user restrictions, one marker, duplicate-name/list removal, shared continuation through the entry form, chart filtering, and 320/390/1440 layouts. Profile and personnel-admin browser verifiers pass. Drive is simulated; these checks do not deploy or write to production.
