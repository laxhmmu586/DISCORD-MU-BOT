const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeOperationalFlightNo, normalizeJcsyFlightNo, sectionMatchesFlightOperationDate, matchesSyFlightRecord, hasUnclearedApiSourceRisk, extractPassportCountryCodes, extractInvoluntaryUpgrade, enrichCheckinAgentStatsFromLog } = require('../syParser');

test('normalizes delayed-flight numbers across SY and passenger record formats', () => {
  assert.equal(normalizeOperationalFlightNo('MU9586'), 'MU9586');
  assert.equal(normalizeOperationalFlightNo('MU09586'), 'MU9586');
});

test('formats delayed-flight numbers for JCSY lookups', () => {
  assert.equal(normalizeJcsyFlightNo('MU9586'), 'MU9586');
  assert.equal(normalizeJcsyFlightNo('MU09586'), 'MU9586');
  assert.equal(normalizeJcsyFlightNo('MU586'), 'MU0586');
});

test('keeps MU9586 records logged after the scheduled operation date', () => {
  const nextDaySection = { timestamp: '2026 August 10, 01:30:00' };
  assert.equal(sectionMatchesFlightOperationDate(nextDaySection, '2026-08-09', 'MU9586'), true);
  assert.equal(sectionMatchesFlightOperationDate(nextDaySection, '2026-08-09', 'MU586'), false);
});

test('matches MU9586 PR records stamped with the recovery operation date', () => {
  const sy = { flightNo: 'MU9586', flightDate: '09AUG26' };
  assert.equal(matchesSyFlightRecord('MU9586', '10AUG26', sy), true);
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

test('extracts the issuing country after the passport expiry date', () => {
  const section = 'PASSPORT :EP5073319/P/NAT/CHN/250409/350408/CHN/N/A';

  assert.deepEqual(extractPassportCountryCodes(section), ['CHN', 'CHN']);
});

test('classifies upgrades into A or O as involuntary upgrades', () => {
  assert.deepEqual(
    extractInvoluntaryUpgrade('1. PEI/GANG BN072 2A A PVG WEB ASR UPGO OSR/7A AQQ/FCL/USA'),
    { upgradedCabin: 'A', originalCabin: 'O', detail: 'Involuntary upgrade from O to A' }
  );
  assert.deepEqual(
    extractInvoluntaryUpgrade('1. TEST/PAX BN140 6A O PVG ASR UPGX AQQ/FCL/USA'),
    { upgradedCabin: 'O', originalCabin: 'X', detail: 'Involuntary upgrade from X to O' }
  );
});

test('does not classify UPG records whose new cabin is outside A and O', () => {
  assert.equal(extractInvoluntaryUpgrade('1. TEST/PAX BN140 31A Y PVG ASR UPGX'), null);
  assert.equal(extractInvoluntaryUpgrade('1. TEST/PAX BN140 2A A PVG ASR'), null);
});

test('counts unique active BNs by latest API agent and excludes AGT9 records', () => {
  const log = [
    '2026 August 26, Wednesday, 11:21:02',
    '> FB205',
    '> PR: MU586/26AUG26*LAX,BN205',
    '1. RUDERMAN/NOAHMR BN205 44B V PVG',
    'API LAX49011 AGT23305/26AUG0949/P1',
    'API LAX49019 AGT21451/26AUG1010/P1',
    '2026 August 26, Wednesday, 11:22:02',
    '> FB205',
    '> PR: MU586/26AUG26*LAX,BN205',
    '1. RUDERMAN/NOAHMR BN205 44B V PVG',
    'API LAX49019 AGT21451/26AUG1010/P1',
    '2026 August 26, Wednesday, 11:23:02',
    '> FB206',
    '> PR: MU586/26AUG26*LAX,BN206',
    '1. TEST/EXCLUDED BN206 45B V PVG',
    'API LAX49019 AGT93006/26AUG1011/P1',
    '2026 August 26, Wednesday, 11:24:02',
    '> FB207',
    '> PR: MU586/26AUG26*LAX,BN207',
    '1. TEST/DELETED BN207 DELETED',
    'API LAX49019 AGT21451/26AUG1012/P1'
  ].join('\n');
  const result = enrichCheckinAgentStatsFromLog(log, {
    flightNo: 'MU586', flightDate: '26AUG26', checkedInTicketed: ['', '000', '000', '001']
  }, '2026-08-26');

  assert.deepEqual(result, {
    agents: [{ agent: '21451', count: 1, bns: ['205'] }],
    total: 1,
    expectedTotal: 1,
    matchesCheckin: true
  });
});
