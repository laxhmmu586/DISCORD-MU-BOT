# Glass workspace design

The Home design is shared by Profile, Request, Report, Read & Sign, Briefing, Schedule, and Admin. The page shell decorates the existing content without replacing editors, forms, dialogs, or permission APIs.

## Navigation and routes

- Clean paths: /home, /profile, /has-form, /has-report, /read-sign, /briefing, /schedule, /admin. Firebase and Express redirect legacy .html URLs and preserve query parameters. Early client normalization also retains fragments.
- The Home page remains a development preview and has no incoming navigation links. Its Home tab is hidden; HR and Finance remain on that development page only. Other workspace pages show the brand, mobile drawer, and account controls. Every brand logo links to /profile.
- Briefing and Schedule appear first in the sidebar under their existing operations permission checks, followed by Report, Request, and Read & Sign. PBB checklist is the last navigation item. Admin retains its account-menu permission checks. Profile stays available through the account menu.
- The desktop sidebar remembers its compact view. Mobile uses a centered logo above the menu/navigation row and a drawer with keyboard focus handling.
- Employee art is selected randomly on page entry, excludes the previous portrait, and remains unchanged until navigation.
- Schedule and Coverage share a 240px desktop identity/label column; day widths and the mobile calendar geometry are retained.

## Artwork

Runtime assets live under public/public/assets/home-*. The supplied Hallmark logo has alpha transparency; the supplied airport team illustration is compressed as home-team-banner-v1.webp. Blue/white 3D icons use separate normalized transparent WebP canvases. The menu and collapse controls are vector drawings.

Raster logo extraction and icon generation used the built-in imagegen tool. The original sprite sheet was split into individual 256px icons for consistent spacing.

## Logo prompt

Use case: background-extraction. Edit target: provided Hallmark Aviation Services logo. Remove only the white background to actual alpha transparency. Preserve the exact navy and gold airplane mark, exact HALLMARK AVIATION SERVICES lettering and Providing Peace of Mind. slogan, proportions, shapes and colors. Do not redesign or add elements. Output tightly framed complete logo on transparent background.

## Icon prompt

Use case: stylized-concept. Create a polished UI icon sprite sheet on transparent background, 4 columns and 2 rows, eight icons total in exactly equal square cells, centered with generous consistent spacing and no overlaps. All icons identical icy white and luminous cobalt blue palette, soft rounded 3D glass/clay material, light from upper left, subtle blue contact shadows, front three-quarter view. Reference style: premium 3D file folders with thick rounded layered white faces and blue edges. Row 1 left to right: home/house, calendar, document with pencil (request), stack of reports with bar chart. Row 2 left to right: signed document with blue check badge, airplane, person profile bust, airport jet bridge. Each icon fills about 70% of its square cell. Absolutely no text, no labels, no background tiles, no extra objects. Wide sheet ratio 2:1. Intended for a pale blue glass aviation dashboard.


## Request icon prompt

Use case: stylized-concept. Create one new Request icon using the existing Read & Sign icon as a style reference: two slightly staggered rounded white file folders/documents with cobalt blue side edges and a large glossy blue circular plus badge at the lower right. Match icy white/cobalt blue glossy 3D material, soft bevels, front three-quarter view and upper-left light. Compact centered silhouette with transparent padding; no text, letters, checkmark, pencil, or extra UI. Output: home-icon-request-v3.webp.

## Briefing and Schedule icon prompt

Create a two-icon horizontal sprite sheet with two equal square cells and a transparent background. Match the Request icon's icy-white/cobalt-blue glossy 3D material, rounded bevels, upper-left light and small blue contact shadows. Left: aviation Briefing clipboard with three lines and an airplane badge. Right: rounded Schedule calendar with chunky blue rings and a three-by-three blue date grid. No text, numbers, watermark or surrounding tiles. Consistent centered size with transparent padding. Outputs: home-icon-briefing-v1.webp and home-icon-schedule-v1.webp.

## Checks

Node tests exercise canonical routes and query/fragment preservation, preservation of existing page controls/dialogs, role-gated navigation, sidebar state and drawer behavior, action-only approval lists, unsigned documents and empty badges, entry-only portrait changes, and shared Schedule/Coverage sizing. Existing backend regression tests cover profile, roles, requests, reports, Read & Sign, Briefing and Schedule.

Final live-browser visual QA is unavailable while local browser access is disabled in Work settings. No deployment is performed by this change.

## Account and status polish

The date and account controls share a right-aligned header group. The avatar menu uses a rounded glass pill, a circular portrait, and the existing menu behavior.

Schedule status assets: public/public/assets/home-icon-status-pending-v1.webp (red clock/documents) and home-icon-status-ok-v1.webp (green check/documents). Generated using the built-in imagegen tool, with home-icon-request-v3.webp as a style reference.

Prompt: two equal square icons on a transparent horizontal 2:1 sheet, matching the rounded glossy 3D white-document family and colored beveled sides. Pending uses red document accents and a red circular clock badge; OK uses green document accents and a green circular badge with a white check. Match size, viewpoint, upper-left lighting, subtle contact shadows and transparent padding. No text, numbers, background tiles or extra objects.

Mobile drawer follow-up: explicitly override the legacy 55px navigation-bar height with 100vh/100dvh, allow vertical scrolling, and reserve safe-area padding. Mobile avatar controls use a 44px circular glass button with a 34px circular portrait.


## Schedule standing Notice

Schedule now displays a permanent Notice card above the roster/calendar, including on mobile. The legacy fixed-header top margin is removed for the glass layout. The three initial reminders are stored once in SQLite; later updates survive restarts and are not replaced during initialization. Only existing Schedule Supervisor+ editors may save, with revision checks to protect concurrent edits. Rendering supports plain text and **bold** spans without injecting HTML. Expiring announcements remain separate.

The date field and Today control are hidden; History toggles back to the current schedule so removing Today does not remove the return path. Focused validation: 70 Schedule, request, route, shell and Notice UI tests passed. Live browser/iPhone visual verification remains unavailable because browser access is disabled in Work settings.
