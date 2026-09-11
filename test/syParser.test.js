const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeOperationalFlightNo, normalizeJcsyFlightNo, sectionMatchesFlightOperationDate, matchesSyFlightRecord, hasUnclearedApiSourceRisk, extractPassportCountryCodes, extractInvoluntaryUpgrade, enrichCheckinAgentStatsFromLog, hasChdServiceCode, isCcAirportClosedContent } = require('../syParser');

test('CC only completes after the ACCEPTED/AIRPORT CLOSED response', () => {
  assert.equal(isCcAirportClosedContent('> CC:\\n> CC: MU586/04SEP26,Y\\n> WARNING - PAX/BAG NOT RECONCILED\\n> 4 BAGS TO BE REMOVED'), false);
  assert.equal(isCcAirportClosedContent('> CC: MU586/04SEP26,Y\\n> ACCEPTED/AIRPORT CLOSED'), true);
  assert.equal(isCcAirportClosedContent('> CC:\\n> ACCEPTED/AIRPORT CLOSED'), true);
  assert.equal(isCcAirportClosedContent('> CC: MU586/04SEP26,Y\\n> ACCEPTED'), false);
});

test('restores CC completion from the latest SY CC status', () => {
  const log = [
    '2026 September 05, Saturday, 13:42:37',
    '> sy',
    '> SY: MU586/05SEP26 LAX/0  CL1219/NAM',
    '> 777/773L/B7367      GTD/130  POS/GATE BN299 AK00000 CD00000',
    '> BDT1145   SD1230   ED1230   CI1219',
    '2026 September 05, Saturday, 13:42:45',
    '> sy',
    '> SY: MU586/05SEP26 LAX/0  CC1342/NAM',
    '> 777/773L/B7367      GTD/130  POS/GATE BN299 AK00000 CD00000',
    '> BDT1145   SD1230   ED1230   CI1219   CC1342'
  ].join('\n');

  const info = require('../syParser').findSYInfo(log, '05SEP26', { preferredFlightNo: 'MU586' });
  const cc = info.crewApis.steps.find((step) => step.key === 'cc');

  assert.equal(cc.complete, true);
  assert.equal(cc.time, '13:42');
  assert.equal(cc.tooltip, 'CC 13:42');
});

test('does not merge another flight SY status into the preferred flight', () => {
  const log = [
    '2026 September 10, Thursday, 08:13:15',
    '>sy mu583/10sep26pvg',
    '> SY: MU583/10SEP26 PVG/0  CC1816/NAM',
    '> 777/773L/B2002      GTD/G118 POS/GATE BN304 AK00000 CD00000',
    '> BDT1705   SD1310   ED1750   CI1640   CC1816',
    '2026 September 10, Thursday, 08:14:15',
    '>sy mu586/10sep26lax',
    '> SY: MU586/10SEP26 LAX/0  CI1014/NAM',
    '> 777/773L/B7367      GTD/130 POS/GATE BN299 AK00000 CD00000',
    '> BDT1145   SD1230   ED1230   CI1014'
  ].join('\n');

  const info = require('../syParser').findSYInfo(log, '10SEP26', { preferredFlightNo: 'MU586' });
  const cc = info.crewApis.steps.find((step) => step.key === 'cc');

  assert.equal(info.flightNo, 'MU586');
  assert.equal(cc.complete, false);
  assert.equal(cc.time, '');
});

test('accepts any numeric CHD1 service-code value', () => {
  assert.equal(hasChdServiceCode('SSR CHD1/0'), true);
  assert.equal(hasChdServiceCode('SSR CHD1/7'), true);
  assert.equal(hasChdServiceCode('SSR CHD1/125'), true);
  assert.equal(hasChdServiceCode('SSR CHD1/A'), false);
  assert.equal(hasChdServiceCode('SSR CHD2/7'), false);
});

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

test('accepts AGT28398 as a whitelisted API agent', () => {
  assert.equal(hasUnclearedApiSourceRisk('API LAX100996 AGT28398/03SEP1200/P1'), false);
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
