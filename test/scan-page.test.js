const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const scanPage = fs.readFileSync(path.join(__dirname, '..', 'public', 'public', 'scan.html'), 'utf8');

test('camera preview fills its scanning viewport on mobile', () => {
  assert.match(scanPage, /\.camera-wrap\s*\{[^}]*aspect-ratio:4 \/ 3/);
  assert.match(scanPage, /video\s*\{[^}]*width:100%;[^}]*height:100%;[^}]*object-fit:cover/);
  assert.match(scanPage, /\.camera-wrap\{aspect-ratio:3 \/ 4;max-height:68vh\}/);
});

test('camera setup only applies supported continuous controls', () => {
  assert.doesNotMatch(scanPage, /targetZoom|\{ zoom:/);
  assert.match(scanPage, /\['focusMode', 'exposureMode', 'whiteBalanceMode'\]/);
  assert.match(scanPage, /capabilities\[mode\][^\n]*includes\('continuous'\)/);
});
