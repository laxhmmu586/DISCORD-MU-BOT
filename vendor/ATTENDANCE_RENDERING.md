# Bundled attendance PNG renderer

The attendance renderer loads only these tracked files. It makes no network requests and needs no native addons or system font installation. First-party orchestration lives in attendancePng.js; upstream distribution files are unmodified.

- resvg-wasm version 2.6.2: https://www.npmjs.com/package/@resvg/resvg-wasm/v/2.6.2
- Source at the matching tag: https://github.com/thx/resvg-js/tree/v2.6.2
- Runtime and CommonJS binding copied from the official npm tarball; license: resvg-wasm/LICENSE (MPL-2.0). Original package metadata retained in resvg-wasm/package.json. Upstream source for the covered runtime remains available at the tagged source URL above.
- Noto Sans variable font: https://github.com/google/fonts/tree/main/ofl/notosans
- Font downloaded from https://raw.githubusercontent.com/google/fonts/main/ofl/notosans/NotoSans%5Bwdth,wght%5D.ttf on 2026-10-14. License and copyright notice: fonts/OFL.txt (SIL Open Font License 1.1).

## SHA-256 of selected distribution files

- `vendor/resvg-wasm/index.js`: `0c1cd17c478a10ad891b147808c4f27b1023216f7726c49528c22c310c83ee6c`
- `vendor/resvg-wasm/index_bg.wasm`: `22bf6e9f9a100d972da0411a69c5ba504367fc1fa87b3b64e3f35e53926d2d70`
- `vendor/fonts/NotoSans.ttf`: `bfb7bb691513f12e734dc346c03a03f784912432d7e3fa8e56efcf906fe86b3d`

The static Noto Sans Bold face is bundled as fonts/NotoSans-Bold.ttf to provide actual weight 700 in resvg. Source: https://raw.githubusercontent.com/notofonts/noto-fonts/main/hinted/ttf/NotoSans/NotoSans-Bold.ttf (SIL OFL 1.1; fonts/OFL.txt).
