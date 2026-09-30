const test = require('node:test');
const assert = require('node:assert/strict');
const { matchMuFlight, parseEmergencyBoardScan } = require('../cbsScanParser');

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


test('parses emergency BN and infant barcodes through shared flight matching', () => {
  assert.deepEqual(parseEmergencyBoardScan('MU0586|BN001'), {
    flight: '0586', seat: '', bn: '1', rawScan: 'MU0586|BN001', isInfant: false
  });
  assert.deepEqual(parseEmergencyBoardScan('MU 09586 221|INF|INF01'), {
    flight: '9586', seat: 'INF', bn: '1', rawScan: 'MU 09586 221|INF|INF01', isInfant: true
  });
  assert.deepEqual(parseEmergencyBoardScan('MU0586|INF|BN001'), {
    flight: '0586', seat: 'INF', bn: '1', rawScan: 'MU0586|INF|BN001', isInfant: true
  });
  assert.deepEqual(parseEmergencyBoardScan('\u0000MUO586|BN001\n'), {
    flight: '0586', seat: '', bn: '1', rawScan: 'MUO586|BN001', isInfant: false
  });
});

test('emergency barcodes reject unsupported flights and malformed identifiers', () => {
  assert.throws(() => parseEmergencyBoardScan('MU1234|BN001'), (error) => error.code === 'WRONG_FLIGHT');
  assert.throws(() => parseEmergencyBoardScan('MU0586|001'), (error) => error.code === 'SCAN_FORMAT');
});
