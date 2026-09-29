const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const source = fs.readFileSync(require.resolve('../googleDrive'), 'utf8');

test('today log downloads use bounded parallel workers and preserve file order', () => {
  assert.match(source, /const logs = new Array\(files\.length\)/);
  assert.match(source, /const workerCount = Math\.min\(6, files\.length\)/);
  assert.match(source, /logs\[index\] = await downloadLog\(file\.id\)/);
});

test('simultaneous SY requests share a short-lived latest-log read', () => {
  assert.match(source, /LATEST_FLIGHT_LOG_CACHE_MS/);
  assert.match(source, /latestFlightLogCache\.pending/);
  assert.match(source, /return latestFlightLogCache\.pending/);
});
