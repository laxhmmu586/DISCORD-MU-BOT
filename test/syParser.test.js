const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeOperationalFlightNo, normalizeJcsyFlightNo } = require('../syParser');

test('normalizes delayed-flight numbers across SY and passenger record formats', () => {
  assert.equal(normalizeOperationalFlightNo('MU586D'), 'MU586D');
  assert.equal(normalizeOperationalFlightNo('MU0586D'), 'MU586D');
});

test('formats delayed-flight numbers for JCSY lookups without dropping the suffix', () => {
  assert.equal(normalizeJcsyFlightNo('MU586D'), 'MU0586D');
  assert.equal(normalizeJcsyFlightNo('MU0586D'), 'MU0586D');
  assert.equal(normalizeJcsyFlightNo('MU586'), 'MU0586');
});
