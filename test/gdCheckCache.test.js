const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require.resolve('../index'), 'utf8');
const context = {};
vm.createContext(context);
vm.runInContext(source.slice(source.indexOf('function preflightCacheKey('), source.indexOf('async function syncFscRateFromTodaySyLog(')), context);

test('GD cache changes when the SY flight, date, registration or crew changes', () => {
  const info = {
    flightNo: 'MU586',
    crewApis: { gdCheckQuery: {
      expectedFlight: { flightNo: 'MU586', flightDate: '11OCT26', aircraftRegistration: 'B7868' },
      crew: [{ passport: 'SE1234567' }]
    } }
  };
  const key = value => context.preflightCacheKey(value, '2026-10-11', 'gdCheck');
  for (const field of ['flightNo', 'flightDate', 'aircraftRegistration']) {
    const changed = structuredClone(info);
    changed.crewApis.gdCheckQuery.expectedFlight[field] += 'X';
    assert.notEqual(key(changed), key(info));
  }
  const changed = structuredClone(info);
  changed.crewApis.gdCheckQuery.crew[0].passport = 'SE7654321';
  assert.notEqual(key(changed), key(info));
  assert.equal(context.preflightCacheKey(info, '2026-10-11', 'ccl'), 'MU586|2026-10-11|ccl');
});
