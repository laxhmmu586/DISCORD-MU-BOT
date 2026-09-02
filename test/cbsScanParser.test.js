const test = require('node:test');
const assert = require('node:assert/strict');
const { matchMuFlight } = require('../cbsScanParser');

test('reads delayed flight MU9586 when the Julian date touches the flight number', () => {
  assert.deepEqual(matchMuFlight('M1TEST/USER EPVGA KLMU9586221Y001A0001'), {
    number: '9586',
    supported: true
  });
});

test('continues to read scheduled flight MU586', () => {
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
