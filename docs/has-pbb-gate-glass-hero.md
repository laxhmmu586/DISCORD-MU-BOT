# HAS Gate Confirmation: pearl white

The entry hero uses the selected pearl-white treatment, blue glass edges, a large blue gate number with a fading floor reflection, and a polished Confirm Gate button.

The three blue dashes are replaced independently: `---`, `1--`, `13-`, `132`. Deleting characters restores the corresponding dashes. The real labeled text input remains the source of truth, and existing flexible gate validation, optional suffix, driver qualification, shared confirmation and Clear behavior are preserved.

Background asset: `public/public/assets/pbb/has-gate-terminal-132-205-v4.webp`.

Generated with built-in imagegen using the supplied airport reference. Prompt: bright blue-and-white airport apron with glass terminal buildings on both sides, a small departing aircraft and control tower at upper right, left Boeing 777-300ER, right Boeing 787 Dreamliner, accurate wings/engines/tail geometry, retracted jet bridges visibly separated from the aircraft, and black/yellow gate signs 132 left and 205 right. No interface in the photograph. The selected background rebuilds both complete aircraft with coherent fuselage, wing, tail and landing-gear proportions.

Validation:
- `node scripts/verify-has-gate-design.cjs`: progressive digits, deletion, optional suffix, confirm/Clear and 320/390/768/1440px layouts.
- `node --test test/hasPbb.test.js test/hasPbbProgress.test.js`: 30 passing tests.
- `git diff --check`.

The older broad `scripts/verify-has-pbb.cjs` stops on an expired-license DOM expectation against current main. The focused hero workflow uses the same local integration fixture and independently exercises the changed controls.

The gate number is centered in the inner pane. Confirm Gate sits at its right edge on desktop and at the lower right on mobile. On confirmation it disappears; Clear appears at the inner pane lower right.
