const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeOperationalFlightNo, normalizeJcsyFlightNo, sectionMatchesFlightOperationDate, matchesSyFlightRecord } = require('../syParser');

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
