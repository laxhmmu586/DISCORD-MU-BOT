const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const html = fs.readFileSync(require.resolve('../public/public/index.html'), 'utf8');

test('home page keeps THINKING visible until currentSy is available', () => {
  assert.match(html, /const showLoading = !currentSy && !protectedView/);
  assert.match(html, /finally \{[\s\S]*?if \(showLoading && currentSy\) setLoadingState\(false\)/);
});

test('home page continues showing THINKING while an initial SY retry is pending', () => {
  assert.doesNotMatch(html, /initialSyLoadAttempted/);
  assert.doesNotMatch(html, /Unable to load SY\. Retrying automatically/);
});
