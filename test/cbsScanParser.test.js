const test = require('node:test');
const assert = require('node:assert/strict');
const { matchMuFlight } = require('../cbsScanParser');

test('reads MU586D when the carrier and Julian date touch adjacent BCBP fields', () => {
  assert.deepEqual(matchMuFlight('M1TEST/USER EPVGA KLMU0586D221Y001A0001'), {
    number: '0586D',
    supported: true
  });
});

test('continues to read MU586 without a suffix', () => {
  assert.deepEqual(matchMuFlight('M1TEST/USER EPVGA KLMU 0586 221Y001A0001'), {
    number: '0586',
    supported: true
  });
});

test('identifies a different MU flight as unsupported', () => {
  assert.deepEqual(matchMuFlight('M1TEST/USER EPVGA KLMU1234 221Y001A0001'), {
    number: '1234',
    supported: false
  });
});
