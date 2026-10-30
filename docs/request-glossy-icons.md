# Glossy request icons

Generated with the built-in imagegen tool from the supplied five-card reference; no API-key/CLI fallback was used. A single transparent coordinated atlas was generated, then its five cells were cropped and encoded as 256px WebP assets.

Final project assets:
- public/public/assets/request/new-glossy-v1.webp
- public/public/assets/request/pending-glossy-v1.webp
- public/public/assets/request/mine-glossy-v1.webp
- public/public/assets/request/approved-glossy-v1.webp
- has/public/assets/request/camera-glossy-v1.webp

## Generation prompt

Create one production UI sprite atlas from this reference, as a single transparent PNG image 2560x512. Five equal 512x512 cells in a single horizontal row. In each cell center one large isolated 3D icon, consistent scale, within central 420x420 area, generous transparent padding. Left to right: 1 glossy light blue layered documents with blue circular white plus badge, 2 warm orange layered documents with orange clock badge, 3 purple tray inbox filled with lavender documents, 4 mint green layered documents with emerald circular white check mark badge, 5 photorealistic black DSLR camera with big blue-black lens. Match the supplied icons closely in shapes, colors, material, lighting and slightly elevated frontal three-quarter perspective. Remove ALL cards, backgrounds, borders, labels, text, captions. Transparent background throughout, subtle localized soft shadows only. Exact evenly spaced 5 column sprite layout so CSS background positions 0,25,50,75,100 percent yield centered individual icons. This is one coordinated sprite atlas asset.
