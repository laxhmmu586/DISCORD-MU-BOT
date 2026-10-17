# Desktop employee Profile

The Profile page follows the supplied desktop reference: a fixed workspace sidebar, horizontal airport/photo identity banner, and a single Personal Information module. Navigation only links to existing pages; Employees is visible to the existing employee administrator allowlist. No work schedule, duty status, team, job title, certificates or other example-only data is introduced.

Personal Information defaults to a read view. Either Edit action opens the existing editable contact fields in an accessible dialog. Closing or pressing Escape discards edits; saving persists nickname, phone, contact email and avatar through the existing API and updates both the read view and account menu. Full name and EID remain read-only. Avatar selection opens the editor for saving. External @mu.com users retain the existing no-EID flow.

The page no longer imports the flight-selection stylesheet, whose global main layout constrained the old page. Desktop uses the available width next to the sidebar; mobile uses a scrollable navigation bar with Profile first.

## Airport background

Tool: built-in imagegen. New generated image, used as a photographic background behind real HTML/CSS. Final workspace asset: `public/public/assets/profile-airport-night-v1.webp`. The original generated PNG is preserved outside the repository. The project asset is WebP encoded at quality 88.

Final generation prompt:

> Use case: photorealistic-natural. Asset type: wide photographic background for MUFC employee profile website banner. Create a premium realistic airport apron at Los Angeles International Airport at blue hour into night, deep navy sky, warmly illuminated glass international terminal and control tower, wet tarmac reflecting golden apron lamps. A China Eastern Boeing 777-300ER is parked on the RIGHT half, seen side-on facing right, white fuselage and recognizable red blue tail livery. Composition: extra-wide panoramic 3:1 image, airplane and terminal right two thirds, LEFT third very dark navy unobtrusive negative space for a separately coded employee portrait and name. Aircraft and terminal occupy middle horizontal band so a 260px-tall CSS background crop remains useful. Photographic realism, restrained cinematic navy/amber color palette, professional airline portal. No UI, no panels, no people, no portrait, no watermark, no invented interface text.

## Verification

The existing mocked browser suite checks 1920, 1440, 1024, 768, 390 and 320px layouts, no horizontal overflow, read-only identity fields, editing/cancel/save, contact/avatar persistence, Google match/EID/cancel, Gmail administrator menus, and external @mu.com entry. Screenshots use synthetic employee information and are saved under `.verification/profile/`. Deployment is separate from this PR.
