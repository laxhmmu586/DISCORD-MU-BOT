const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');

test('retired IRR pages and flight-service entry are absent', () => {
  for (const file of ['irr.html', 'irr-form.html']) {
    assert.equal(fs.existsSync(path.join(root, 'public/public', file)), false);
  }
  const home = fs.readFileSync(path.join(root, 'public/public/flights.html'), 'utf8');
  assert.doesNotMatch(home, /irr\.html|>IRR</);
});

test('retired IRR endpoints cannot expose records or accept submissions', () => {
  const server = fs.readFileSync(path.join(root, 'index.js'), 'utf8');
  assert.doesNotMatch(server, /app\.(?:get|post)\('\/irr-/);
  assert.doesNotMatch(server, /recordPassengerByBn|broadcastIrrCaseUpdate/);
});
