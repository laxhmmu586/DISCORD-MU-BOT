const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const page = fs.readFileSync(require.resolve('../public/public/index.html'), 'utf8');
const server = fs.readFileSync(require.resolve('../index.js'), 'utf8');

test('home page uses SY server events with a 30-second backup refresh', () => {
  assert.match(page, /new EventSource\(`\$\{resolveApiBase\(\)\}\/sy-live-stream`\)/);
  assert.match(page, /const SY_BACKUP_REFRESH_MS = 30 \* 1000/);
  assert.match(page, /setInterval\(refreshSy, SY_BACKUP_REFRESH_MS\)/);
  assert.doesNotMatch(page, /SY_AUTO_REFRESH_MS/);
});

test('home page pauses both the event stream and backup refresh when hidden', () => {
  assert.match(page, /syLiveStream\?\.close\(\)/);
  assert.match(page, /if \(document\.hidden\) \{\s*stopSyAutoRefresh\(\)/);
});

test('server publishes lightweight SY change invalidations', () => {
  assert.match(server, /app\.get\('\/sy-live-stream'/);
  assert.match(server, /publishSyRefresh\(rawQuery, \{ \.\.\.syPayload, permissions: undefined \}\)/);
  assert.match(server, /if \(syStreamSignatures\.get\(normalizedQuery\) === signature\) return/);
});
