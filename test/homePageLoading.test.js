const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const html = fs.readFileSync(require.resolve('../public/public/index.html'), 'utf8');

test('home page removes THINKING when the initial SY request completes', () => {
  assert.match(html, /const showLoading = !currentSy && !protectedView/);
  assert.match(html, /finally \{[\s\S]*?if \(showLoading\) setLoadingState\(false\)/);
});

test('home page reports an initial SY failure while automatic retries continue', () => {
  assert.match(html, /function showInitialSyLoadFailure\(error\)/);
  assert.match(html, /Unable to load SY · retrying automatically/);
  assert.match(html, /if \(showLoading\) showInitialSyLoadFailure\(error\)/);
});
