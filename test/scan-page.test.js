const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const scanPages = ['scan.html', 'scan2.html'].map((file) => ({
  file,
  html: fs.readFileSync(path.join(__dirname, '..', 'public', 'public', file), 'utf8')
}));

test('camera preview fills its scanning viewport on mobile', () => {
  for (const { file, html } of scanPages) {
    assert.match(html, /\.camera-wrap\s*\{[^}]*aspect-ratio:(?:4 \/ 3|16 \/ 9)/, file);
    assert.match(html, /video\s*\{[^}]*width:100%;[^}]*height:100%;[^}]*object-fit:cover/, file);
    assert.match(html, /\.camera-wrap\{aspect-ratio:(?:3 \/ 4;max-height:68vh|4 \/ 3;max-height:42vh)\}/, file);
  }
});

test('camera setup only applies supported continuous controls', () => {
  for (const { file, html } of scanPages) {
    assert.doesNotMatch(html, /targetZoom|\{ zoom:/, file);
    if (file === 'scan.html') {
      assert.match(html, /\['focusMode', 'exposureMode', 'whiteBalanceMode'\]/, file);
      assert.match(html, /capabilities\[mode\][^\n]*includes\('continuous'\)/, file);
    } else {
      for (const mode of ['focusMode', 'exposureMode', 'whiteBalanceMode']) {
        assert.match(html, new RegExp(`Array\\.isArray\\(capabilities\\.${mode}\\).*includes\\('continuous'\\)`), file);
      }
    }
  }
});
