const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const server = fs.readFileSync(require.resolve('../index.js'), 'utf8');

test('SY search starts independent remote reads before awaiting them together', () => {
  const start = server.indexOf('const bagInfoPromise =');
  const finish = server.indexOf('try {\n          syInfo.bagRoomUnloadAlert = await notifyBagRoomUnloadAfterCc', start);
  const block = server.slice(start, finish);
  assert.ok(start >= 0 && finish > start);
  assert.match(block, /const bagInfoPromise =/);
  assert.match(block, /const mealEmailPromise =/);
  assert.match(block, /const authContextPromise =/);
  assert.match(block, /await Promise\.all\(/);
});

test('report sheet writes do not delay the initial SY response', () => {
  assert.match(server, /setImmediate\(\(\) => appendSpmlReportRows/);
  assert.match(server, /setImmediate\(\(\) => syncSalesDetailsFromTodaySy/);
  assert.doesNotMatch(server, /syInfo\.salesDetailsSheetSync = await syncSalesDetailsFromTodaySy/);
});
