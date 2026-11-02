const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require.resolve('../index'), 'utf8');
const context = {};
vm.createContext(context);
vm.runInContext(source.slice(source.indexOf('function preflightCacheKey('), source.indexOf('async function syncFscRateFromTodaySyLog(')), context);

test('completed GD uses a final flight/date key despite later registration or crew changes', () => {
 const info={flightNo:'MU586',crewApis:{gdCheckQuery:{expectedFlight:{flightNo:'MU586',flightDate:'11OCT26',aircraftRegistration:'B7868'},crew:[{passport:'SE1234567'}]}}};
 const key=value=>context.preflightCacheKey(value,'2026-10-11','gdCheck');
 const changed=structuredClone(info);changed.crewApis.gdCheckQuery.expectedFlight.aircraftRegistration='B9999';changed.crewApis.gdCheckQuery.crew=[];assert.equal(key(changed),key(info));
 assert.notEqual(context.preflightCacheKey(info,'2026-10-12','gdCheck'),key(info));assert.notEqual(key({...info,flightNo:'MU9586'}),key(info));
});
