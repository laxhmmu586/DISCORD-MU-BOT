# CBS service card artwork

## Approved 3D refresh (2026-10-18)

The approved concept is implemented with five standalone, text-free illustrations generated using the built-in imagegen tool. These are raster WebP assets, not SVG vectors. Transparent header illustrations retain their alpha channel. Live HTML supplies all bilingual copy, links, and focus states. New filenames and a versioned stylesheet avoid reusing cached previous artwork.

| Asset | Placement |
| --- | --- |
| `cbs-3d-hero.webp` | Airport and silver-blue suitcase family in the service banner |
| `cbs-3d-delayed.webp` | Blue delayed/lost selection card |
| `cbs-3d-damaged.webp` | Purple damaged selection card |
| `cbs-3d-delayed-header.webp` | Transparent suitcase and clock in AHL form heading |
| `cbs-3d-damaged-header.webp` | Transparent damaged suitcase and wheel in DPR form heading |

All files live in `public/public/assets/`. The approved preview board was supplied as a visual reference to each generation call.

Prompt set: premium sculpted 3D metallic ribbed suitcases; midnight navy, cyan/violet rim light, warm golden orbital light trails; no text, numbers, logos, UI, or borders. Hero: panoramic airport twilight, silver-blue luggage family toward the right, passenger plane and tower, dark left side for live title. Delayed card: blue upright suitcase, blank tag and glass clock without numerals, dark left side. Damaged card: purple cracked suitcase, detached wheel and blank tag, dark left side. Header prompts use the corresponding isolated object on a genuinely transparent background with generous margins and a subtle light orbit, without a floor or scene.

Visual check: `node scripts/verify-cbs-artwork.cjs` (requires Playwright). It checks 320/390/900/1280 px in both languages across the service page and AHL/DPR forms, including image loading, full-card destinations, language switching, type-dependent artwork, horizontal overflow, and heading text/image separation. It writes desktop/mobile screenshots under `.verification/cbs-3d-artwork/`. This local check does not prove hosted deployment or report submission.

## Previous artwork

Generated with the built-in imagegen tool using the approved blue/purple page preview as a composition and style reference. Full-bleed scene artwork is exported to 1040 × 640 WebP. Labels, buttons, borders and MUFC wordmark are rendered in HTML/CSS, not baked into the artwork. The header has no graphic logo before MUFC.

- Delayed/lost: `public/public/assets/cbs-delayed-scene.webp`
- Damaged: `public/public/assets/cbs-damaged-scene.webp`

## Delayed/lost prompt

Create ONLY the artwork for the TOP BLUE baggage service card in the supplied reference image, closely matching its composition and realistic polished style. Landscape aspect ratio about 1.65:1. White ribbed rolling suitcase standing upright slightly left of center on a curved dark metallic airport baggage carousel, extended blue handle, blank white baggage tag. Luminous transparent glass clock floating upper right and a flowing translucent cyan light ribbon. Bright airport windows, defocused blue baggage flight display at left. Rich fresh sky-blue and azure palette, photorealistic premium 3D render. Lower 23 percent transitions to a smooth vivid royal blue curved translucent band with enough uncluttered space for white website text that will be added in HTML. Full bleed rectangular artwork. NO text, letters, numbers, logos, MUFC, watermark, UI arrows, UI border, rounded corners, buttons, page header or surrounding page. The supplied image is a composition/style reference only.

## Damaged prompt

Create ONLY the artwork for the LOWER PURPLE damaged baggage service card in the supplied reference, closely matching its composition and photorealistic premium style. Landscape aspect ratio about 1.65:1. A large lavender purple ribbed hard shell suitcase lying horizontally angled across a glossy airport floor, obvious deep cracked/dented shell around the lower front corner, a detached black caster wheel on the ground to the right, blank white luggage tag and a flowing translucent lavender ribbon. Soft airport windows behind with fresh cool lilac and blue light, minimal warm colors. Realistic tactile suitcase materials, believable detailed damage, polished cinematic 3D product render. Lower 23 percent transitions to a smooth saturated violet curved translucent band with uncluttered space for white website text to be added later in HTML. Full bleed rectangular artwork. NO text, letters, numbers, logos, MUFC, watermark, UI arrows, UI border, rounded corners, buttons, page header or surrounding page. Supplied image is a composition/style reference only.
