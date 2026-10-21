# HAS checklist and light Profile follow-up

The HAS checklist shows one saved question at a time, automatically advancing only after the server accepts the answer. Previous/Next and Review allow corrections. NO remains an explicit answer and blocks Ready/signing. Reload resumes the first unanswered question. Combined aircraft-stop/chocks displays the existing chocks photograph and atomically saves both original audit fields; existing PDF rows and legacy records are retained.

Admin uses the full available desktop width. Profile has an isolated light stylesheet, Hallmark branding, and a daylight TBIT-inspired banner. Existing canonical employee names, IDs and edit/access rules are unchanged. The original PBB pages and assets are unchanged.

## Generated raster assets

- `public/public/assets/pbb/has-cables-stowed-v1.webp`: photorealistic, derived from the user cable-position reference; cables stored above the apron. Generated PNG optimized to WebP at 1400px, quality 88.
- `public/public/assets/profile-tbit-daylight-v2.webp`: generated daylight artwork inspired by TBIT architecture; an illustration, not a location photograph. Architectural reference: https://populous.com/showcases/lax-tom-bradley-international-terminal . No airline branding. PNG optimized to WebP, quality 88.

### Cable prompt

Create a photorealistic wide airport ground-operation training reference photograph. Use the attached airport jet bridge reference for equipment location and realistic appearance. Show a close clear view of thick black aircraft ground-power cables PROPERLY STOWED AND SECURED on purpose-built cable hangers/reels along the OUTSIDE SIDE WALL of a passenger boarding bridge, loops neatly retained above ground with connector plugs secured in holders. No cable touching or stretching across the apron. The concrete movement path below is entirely clear. Include a realistic passenger aircraft in the background, daylight, natural materials, realistic proportions, documentary photography matching existing jet bridge checklist photographs. No red circle, no arrows, no writing, no UI, no checkmark, no loose cables on the ground. Landscape 3:2 composition.

### Initial banner prompt

Generate a wide photorealistic corporate employee portal banner, landscape 3:1 composition. Bright clean daytime airport terminal apron, modern glass terminal and control tower on far right, one realistic plain white passenger jet parked at a jet bridge in right third, aircraft and equipment proportionally correct. NO airline logos, no Chinese Eastern logo or wording, no branding or text anywhere. Left half airy pale white and very light blue sky and runway, soft white luminous fade with plenty of uncluttered space for profile portrait and navy text overlay. Calm professional natural photography with subtle sky blue and warm sunrise light. No people in foreground, no UI, no words, no icons.

### Final TBIT edit prompt

Edit this airport portal banner. Keep its 3:1 wide layout, pale luminous left half with lots of clear space for employee portrait/text, photorealistic daylight, plain white unbranded passenger aircraft and airport apron in the right half. CHANGE the terminal architecture to convincingly reference the AIRSIDE of LAX TOM BRADLEY INTERNATIONAL TERMINAL (TBIT): its distinctive repeated tall sweeping wave-shaped curved silver roof vaults, arching roof edges, large glass curtain wall facade, layered concourse and jet bridges. Show at least three recognizable curved roof bays above the glass terminal to the right; this is the signature Fentress TBIT architecture, NOT a generic straight flat-roof terminal. Use the architectural description of official Fentress/Populous LAX TBIT photos. Remove the generic control tower from this image. Keep the terminal visible above and behind aircraft. No China Eastern logo, no airline branding or text, no UI. Realistic scale and ground equipment, elegant soft white/lightblue employee portal background. Preserve the left half of composition as uncluttered light space.

### User-reference correction prompt

Edit image 1 employee portal banner using image 2 as the AUTHORITATIVE architectural reference for LAX TBIT. Replace image 1's inaccurate terminal building. Exactly match image 2's distinctive TBIT airside silhouette: repeated ASYMMETRICAL sloping shell / sail roof modules, highest on their tall tilted glass clerestory end, sweeping downward like ocean waves, large central higher overlapping curved shells with slanted glass end walls; smaller lower roofs running along concourse. The roofs are NOT a row of symmetrical barrel arches. Preserve the recognizable proportions, roof shapes, metallic cladding, glass structural ribs and perspective from supplied image 2. Recompose in the right half of the very wide 3:1 banner behind a realistically scaled plain white unbranded aircraft and jet bridge. Daylight luminous pale blue sky, professional photorealistic airport photography. Left half fades softly to near-white open apron/sky for readable employee portrait and text. No airline logos, no text including 'More Information About LAX', no company words, no UI. Keep all major terminal roof modules clearly visible above the plane, not cut off. Reference image 2 is for architecture only, preserve clean light daytime banner styling of image 1.

The final edit uses the user's supplied TBIT architectural reference, including its asymmetric sloping roof shells and glazed clerestory ends. Later airside and aerial photographs supplied by the user corroborate this geometry. The earlier generic straight terminal and symmetric arches were discarded.

## Validation

59 focused HAS/employee/PBB tests; real Express/SQLite browser workflow with simulated Google Drive, sequential answer save failure/recovery, NO/back/edit/reload, four visible Spotter checks, combined check photo, shared readiness/signatures, automatic submission, 320/390/1440 layouts. Profile browser checks cover 320 through 2560px and save/cancel/avatar/access flows. Admin checks cover 390/1440/1920/2560px. No production deployment or real Drive upload performed.

