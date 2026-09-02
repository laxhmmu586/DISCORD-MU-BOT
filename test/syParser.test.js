const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeOperationalFlightNo, normalizeJcsyFlightNo, sectionMatchesFlightOperationDate, matchesSyFlightRecord, hasUnclearedApiSourceRisk } = require('../syParser');

test('normalizes delayed-flight numbers across SY and passenger record formats', () => {
  assert.equal(normalizeOperationalFlightNo('MU586D'), 'MU586D');
  assert.equal(normalizeOperationalFlightNo('MU0586D'), 'MU586D');
});

test('formats delayed-flight numbers for JCSY lookups without dropping the suffix', () => {
  assert.equal(normalizeJcsyFlightNo('MU586D'), 'MU0586D');
  assert.equal(normalizeJcsyFlightNo('MU0586D'), 'MU0586D');
  assert.equal(normalizeJcsyFlightNo('MU586'), 'MU0586');
});

test('keeps MU586D records logged after the scheduled operation date', () => {
  const nextDaySection = { timestamp: '2026 August 10, 01:30:00' };
  assert.equal(sectionMatchesFlightOperationDate(nextDaySection, '2026-08-09', 'MU586D'), true);
  assert.equal(sectionMatchesFlightOperationDate(nextDaySection, '2026-08-09', 'MU586'), false);
});

test('matches MU586D PR records stamped with the recovery operation date', () => {
  const sy = { flightNo: 'MU586D', flightDate: '09AUG26' };
  assert.equal(matchesSyFlightRecord('MU586D', '10AUG26', sy), true);
  assert.equal(matchesSyFlightRecord('MU586', '10AUG26', sy), false);
  assert.equal(matchesSyFlightRecord('MU586', '10AUG26', { flightNo: 'MU586', flightDate: '09AUG26' }), false);
});

test('keeps a non-whitelisted latest API agent flagged after later GOV and BC operations', () => {
  const section = [
    'API LAX100840 AGT9940/15AUG0036/P1',
    'GOV LAX104918 AGT93006/15AUG0036/ALL',
    'BC  LAX104749 AGT93006/15AUG1024'
  ].join('\n');

  assert.equal(hasUnclearedApiSourceRisk(section), true);
});

test('uses the latest API operation when checking the agent whitelist', () => {
  const section = [
    'API LAX100840 AGT9940/15AUG0036/P1',
    'GOV LAX104918 AGT93006/15AUG0036/ALL',
    'API LAX100996 AGT21472/15AUG0450/P1'
  ].join('\n');

  assert.equal(hasUnclearedApiSourceRisk(section), false);
});
