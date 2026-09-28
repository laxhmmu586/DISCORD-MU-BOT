const test = require('node:test');
const assert = require('node:assert/strict');
const { findSYInfo } = require('../syParser');
const { passengers, parseIncrementalLog } = require('../flightParser');
const fs = require('node:fs');
const vm = require('node:vm');

const empty137 = `2026 September 27, Sunday, 15:01:20
>fb 137
PSGR ID
           2026 September 27, Sunday, 15:00:58
>pr1pd
 PR: MU586/27SEP26VLAX,1PD          PNR RL  MLTVVK
                                    CRS RL  VQFZ97
  1. ZHANG/WEIPING               68J    V PVG FBA/2PC WCHR
                                        ET TKNE/0062467107596/2 IET R68J ABP
CTC-SHA771-04SEP26-1213-T SHA/SHA/T 021-62530461/ SHANGHAI EFLY AVIATION
    SERVICE CO /CTC  T SHA/-  LTD/TAN/JIANYING /CTC  B YOP/T SHA771-63
    2026/09/04
PSPT-ER0839346/CHN/04AUG67/F/
 PAXLST   :ZHANG/WEIPING/
 PAX INFO :/DOB/670804/POB//GENDER/F
 PASSPORT :ER0839346/P/NAT/CHN//360125/CHN/N/A

CKIN HK1 LKCK/7819474268405/CHKLEG
CKIN SPFL
      I/DL3716/27SEP                    Y SAN
      O/MU720/28SEP              34C    V LHW
     RES AUTO 27SEP0916
     JPU LAX105741 AGT9940/27SEP0916/FBA
     JPU LAX105741 AGT9940/27SEP0916/FBA`;

const sy = `2026 September 27, Sunday, 14:00:00
>sy
> SY: MU586/27SEP26 LAX/0 CI1400/NAM
> 777/773L/B7367 GTD/130 POS/GATE BN299 AK00000 CD00000
> BDT1445 SD1530 ED1530 CI1400`;

function record(bn, time = '14:30:00', flight = 'MU586', day = '27') {
  return `2026 September ${day}, Sunday, ${time}
>fb ${bn}
 PR: ${flight}/${day}SEP26*LAX,BN${bn}
 1. ZHANG/WEIPING BN${bn} 68J V PVG FBA/2PC WCHR
 PAX INFO :/DOB/670804/POB//GENDER/F
 PASSPORT :ER0839346/P/NAT/CHN//360125/CHN/N/A
 CKIN WEB/EDI/RESWIPE
 RES AUTO 27SEP0916`;
}

for (const newestFirst of [false, true]) {
  test(`empty FB removes stale passenger and dashboard alerts (${newestFirst ? 'newest' : 'oldest'} first)`, () => {
    const parts = [sy, record('137'), record('138'), empty137];
    const log = (newestFirst ? parts.reverse() : parts).join('\n');
    parseIncrementalLog(log);
    assert.equal(passengers['137'], undefined);
    assert.equal(passengers['138'].name, 'ZHANG/WEIPING');
    const info = findSYInfo(log, '27SEP26', { preferredFlightNo: 'MU586' });
    assert.ok(!info.bnAudit.some(p => p.bn === '137'));
    assert.ok(!info.govAqq.missingApiBnList.includes('137'));
    assert.ok(!info.wchList.some(p => p.bn === '137'));
    assert.ok(info.bnAudit.some(p => p.bn === '138'));
  });
}

test('provided empty FB and PD alone cannot create passenger 137', () => {
  parseIncrementalLog(empty137);
  assert.equal(passengers['137'], undefined);
});

test('later successful FB restores the BN', () => {
  const log = [sy, record('137'), empty137, record('137', '15:02:00')].join('\n');
  parseIncrementalLog(log);
  assert.equal(passengers['137'].name, 'ZHANG/WEIPING');
  assert.ok(findSYInfo(log, '27SEP26').bnAudit.some(p => p.bn === '137'));
});

test('empty FB does not invalidate the same BN on another flight or day', () => {
  for (const [flight, day] of [['MU583', '27'], ['MU586', '26']]) {
    parseIncrementalLog([record('137', '14:30:00', flight, day), empty137].join('\n'));
    assert.equal(passengers['137'].flight, flight);
    assert.equal(passengers['137'].flightDate, `${day}SEP`);
  }
});

test('prompt-prefixed PR responses retain their FB timestamp and are invalidated', () => {
  const log = [sy, record('137').replace(' PR:', '> PR:'), empty137].join('\n');
  parseIncrementalLog(log);
  assert.equal(passengers['137'], undefined);
  const info = findSYInfo(log, '27SEP26');
  assert.ok(!info.bnAudit.some(p => p.bn === '137'));
  assert.ok(!info.govAqq.missingApiBnList.includes('137'));
});

// Exercise the real fallback functions without starting Express/Discord or
// touching remote services.
function loadFunctions(file, names, dependencies = {}) {
  const source = fs.readFileSync(require.resolve(file), 'utf8');
  const functions = names.map(name => {
    const start = source.indexOf(`function ${name}(`);
    assert.ok(start >= 0, name);
    const end = source.indexOf('\n}', start) + 2;
    return source.slice(start, end);
  }).join('\n');
  return vm.runInNewContext(`${functions}\nfindPassengerFromPRRecord`, dependencies);
}

test('web and Discord fallback lookups cannot revive an unavailable BN', () => {
  const web = loadFunctions('../index.js', ['extractSeatAfterBnText', 'findPassengerFromPRRecord'], {
    splitLogicalSections: require('../flightParser').splitLogicalSections
  });
  const discord = loadFunctions('../fbLookup.js', [
    'monthNameToNumber', 'timestampToMs', 'splitLogicalSections', 'findPassengerFromPRRecord'
  ], { require: () => require('../passengerRecordValidity') });
  for (const lookup of [web, discord]) {
    const log = [sy, record('137'), record('138'), empty137].join('\n');
    assert.equal(lookup(log, 'BN', '137'), null);
    assert.equal(lookup(log, 'BN', '138').bn, '138');
    assert.equal(lookup([log, record('137', '15:02:00')].join('\n'), 'BN', '137').bn, '137');
  }
});
