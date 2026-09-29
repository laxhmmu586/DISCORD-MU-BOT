const test = require('node:test');
const assert = require('node:assert/strict');
const { extractPnr, buildBcbp, buildManualRecords, parseManualBoardingLog, flightDayOfYear } = require('../manualBoarding');
const { matchMuFlight } = require('../cbsScanParser');

test('extracts the PNR locator following PNR RL', () => {
  assert.equal(extractPnr('PR: MU586/29SEP26*LAX,BN150 PNR RL  NB80MY'), 'NB80MY');
});

test('creates a scan-compatible BCBP with seat and BN', () => {
  const raw = buildBcbp({ name:'WANG/YING', pnr:'PW5GVT', flight:'MU586', flightDate:'29SEP26', cabin:'Business', seat:'7D', bn:'154' });
  assert.equal(matchMuFlight(raw)?.supported, true);
  assert.match(raw, /007D0154\b/);
  assert.equal(flightDayOfYear('29SEP26'), '272');
});

test('includes every active BN passenger and extracts PNR when available', () => {
  const records = buildManualRecords({
    '150': { bn:'150', name:'WANG/CHANGCHUN', seat:'67G', flight:'MU586', flightDate:'29SEP26', ticketNumber:'7819484330368', ffCarrier:'MU', ffNumber:'123', sourceText:'PNR RL NB80MY' },
    '151': { bn:'151', name:'NO/PNR', seat:'68A', sourceText:'' },
  }, { gate:'148', bdt:'1145' });
  assert.equal(records.length, 2);
  assert.deepEqual({ pnr:records[0].pnr, gate:records[0].gate, bdt:records[0].bdt }, { pnr:'NB80MY', gate:'148', bdt:'1145' });
});

test('manual log parsing does not use the shared passenger parser state', () => {
  const log = `2026 September 29, Tuesday, 09:01:32
>FB150
 PR: MU586/29SEP26*LAX,BN150 PNR RL NB80MY
 1. WANG/CHANGCHUN BN150 67G V PVG FBA/1PC ET TKNE/7819484330368/2
 FF/MU 610500212313/G`;
  const records = parseManualBoardingLog(log, { gate:'148', bdt:'1145' });
  assert.equal(records.length, 1);
  assert.deepEqual({ name:records[0].name, bn:records[0].bn, pnr:records[0].pnr, seat:records[0].seat }, { name:'WANG/CHANGCHUN', bn:'150', pnr:'NB80MY', seat:'67G' });
});
