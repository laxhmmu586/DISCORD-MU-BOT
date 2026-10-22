# HAS employee status illustrations

Arrival and Departure use employee illustrations in four existing states: waiting for Spotter, Ready, Spotter signed, and both operators signed. The page structure, status copy, movement permission checks, names/EIDs, signatures, PDF download and Drive delivery behavior are retained. The legacy `pbb.html` flow is unchanged.

Each state rotates through three appropriate employee portraits, including Asian employees. Waiting always uses a raised open palm; Ready uses a thumbs-up; signed/completed views use a completed clipboard. Selection advances when a new checklist/run is shown, after returning to the bridge picker and reopening, or after a reload. A cached choice remains stable through shared-state rerenders and delivery updates. Rotation uses tab-local session storage with an in-memory fallback when storage is blocked; it does not alter employee identity or saved checklist data.

## Final assets

The production assets are transparent raster WebP images under `public/public/assets/pbb/staff/`:

- `wait-man-v1.webp`, `wait-woman-v1.webp`, `wait-asian-man-v1.webp`
- `ready-woman-v1.webp`, `ready-asian-woman-v1.webp`
- `signed-woman-v1.webp`, `signed-asian-woman-v1.webp`
- `complete-man-v1.webp`, `complete-asian-man-v1.webp`

The approved male clipboard/thumbs-up and female signed-clipboard portraits are also used in other compatible Ready/completion states. Each image is roughly 50–65 KB, fitted inside a responsive container with `object-fit: contain` so hands and accessories remain visible.

## Art generation

Generated with the built-in image generation tool. The user supplied company uniform photos and approved a four-character concept sheet. Men wear charcoal suits, white shirts and purple company-pattern ties. Women use the white or purple company-pattern silk scarf, tied in front with broad draped ends. Character faces are fictional; photographs guide uniforms rather than real-person identity.

Final prompt specifications used for the production set:

1. Correct the approved four-character transparent 2×2 gesture sheet using the company uniform photographs: purple patterned men's ties, white company-pattern women's scarves; preserve the open-palm, thumbs-up, clipboard/pen and clipboard/thumbs-up poses. Replace the top-right face with the approved brunette character. Keep original fictional faces, suits, lanyards, nameplates, lighting and premium 3D style. No text, UI, background or watermark.
2. Change only the top-right woman's scarf to the purple company scarf with pale bird/aircraft motifs from the group photograph. Preserve the bottom-left white scarf and all other character, gesture, material and composition details.
3. Adapt the approved purple-scarf woman into one standalone transparent waist-up WAIT pose: raised open palm facing the viewer, calm attentive expression, other hand at waist. Preserve her face, hairstyle and company uniform. Keep hands fully within the canvas; no clipboard, thumbs-up, UI, text or background.
4. Create a matching transparent 2×2 sheet of Asian male/female employees based on the supplied original employee illustration: top-left Asian man with raised open palm; top-right Asian woman with thumbs-up and white patterned scarf; bottom-left Asian woman with signed clipboard/pen and purple patterned scarf; bottom-right Asian man with clipboard and thumbs-up. Men use purple patterned ties. Preserve the approved premium 3D style, adult proportions, company uniform details, blank nameplates/IDs and transparent gutters. No captions, UI or background.

The generated sheets were separated into individual sprites, trimmed to their transparent bounds and encoded as WebP. No source photograph is shipped as a status illustration.

## Dashboard sidebar series

Six additional full-body transparent WebP portraits are stored in the same asset folder:

- `sidebar-tablet-asian-man-v1.webp`
- `sidebar-welcome-woman-v1.webp`
- `sidebar-wave-asian-woman-v1.webp`
- `sidebar-arms-asian-man-v1.webp`
- `sidebar-arms-woman-v1.webp`
- `sidebar-arms-asian-woman-v1.webp`

These were generated with the built-in image tool from the supplied full-body company employee illustration and the approved purple-scarf status portrait. Final prompt specifications: one three-person full-body series, in a row with transparent gutters, wearing charcoal suits, patterned purple ties or white/purple company scarves, gold nameplates and blue ID lanyards. The first series uses tablet-holding, welcoming and waving poses; the second series uses both arms folded across the chest for all three employees. Preserve complete hands, feet, adult proportions, soft studio lighting and the approved premium 3D character style; no text, UI, props beyond the first employee's tablet, scenery or background.

The six sidebar poses cycle on page entry using session storage. Statistics refreshes, filter changes and chart resizing do not change the selected employee. The illustration stays above the sidebar brand at the bottom of the desktop sidebar. The existing mobile navigation hides the bottom area; short desktop viewports hide only the illustration so navigation remains available.
