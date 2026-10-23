const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { findSYInfo } = require('../syParser');
const { parseIncrementalLog, passengers } = require('../flightParser');
const { scopedLog } = require('../flightContext');
const { passengerBn } = require('../passengerRecordValidity');

const sy = `2026 October 23, Friday, 13:40:00
>sy
> SY: MU586/23OCT26 LAX/0 CI1300/NAM
777/773L/B7367 GTD/130 POS/GATE BN299 AK00000 CD00000`;
const payload = `  1. SOSA/RICKYLEE S5 BN148 *62K S PVG EDI SNR62K BAG1/18/0 M1/0
 FBA/2PC WCHR
 ET TKNE/7810000000000/2
 BAGTAG/7006792894/YNT
 XI/MU8812/23OCT S SFO
 I/DL1598/23OCT BN999 SFO
 O/MU6984/24OCT BN033 37L B YNT`;
const seatQuery = `2026 October 23, Friday, 13:42:00
>pr1pd
 PR: MU586/23OCT26*LAX,1PD
${payload.replace('BN148 *62K', '62K')}`;
const empty = `2026 October 23, Friday, 13:44:43
>fb 999
PSGR ID`;
const fb = `2026 October 23, Friday, 13:44:47
>fb 148
 PR: MU586/23OCT26*LAX,BN148
${payload}`;
const pn = `2026 October 23, Friday, 13:44:49
>pn1
 PR: MU586/23OCT26*LAX,BN148
 RES AUTO 21OCT1230
 API LAX49014 AGT21450/23OCT1156/P1`;

function duplicateBags(info) {
  const html = fs.readFileSync(require.resolve('../public/public/index.html'), 'utf8');
  const names = ['passengerName', 'allPassengerRecords', 'splitBagTag', 'bagEntriesForRow', 'hasUnknownPassengerName', 'duplicateBagRows'];
  const source = names.map(name => html.slice(html.indexOf(`      function ${name}(`)).split(/\n      (?:async )?function /)[0]).join('\n');
  const context = vm.createContext({ info });
  return vm.runInContext(`${source}\nduplicateBagRows(info)`, context);
}

for (const newestFirst of [false, true]) {
  for (const scoped of [false, true]) {
    test(`connection BN cannot create duplicate baggage (newestFirst=${newestFirst}, scoped=${scoped})`, () => {
      const parts = [sy, seatQuery, empty, fb, pn];
      const raw = (newestFirst ? parts.reverse() : parts).join('\n');
      const log = scoped ? scopedLog(raw, 'MU586', '23OCT26') : raw;
      const info = findSYInfo(log, '23OCT26', { preferredFlightNo: 'MU586' });
      assert.deepEqual(info.bnAudit.map(row => row.bn), ['148']);
      assert.ok(info.seatMapRecords.every(row => row.bn !== '999' && row.bn !== '033'));
      assert.equal(duplicateBags(info).length, 0);
      parseIncrementalLog(log);
      assert.equal(passengers['999'], undefined);
      assert.equal(passengers['033'], undefined);
      assert.equal(passengers['148'].name, 'SOSA/RICKYLEE');
    });
  }
}

test('a real second passenger sharing the exact bag tag still triggers DUP BAG', () => {
  const second = fb.replace('13:44:47', '13:45:00').replaceAll('148', '149').replace('SOSA/RICKYLEE', 'TEST/SECOND');
  const info = findSYInfo([sy, fb, second].join('\n'), '23OCT26');
  assert.equal(duplicateBags(info).length, 2);
});

test('local identity accepts real BN999 and never falls back to either connection', () => {
  assert.equal(passengerBn(' PR: MU586/23OCT26*LAX,BN999\n I/DL1598/23OCT BN148 SFO'), '999');
  assert.equal(passengerBn(' PR: MU586/23OCT26*LAX,SN62K\n 1. TEST/PAX BN148 62K S PVG\n I/DL1598/23OCT BN999 SFO'), '148');
  assert.equal(passengerBn(seatQuery), '');
  assert.equal(passengerBn(seatQuery.replace(' I/DL1598/23OCT BN999 SFO', '')), '');
  assert.equal(passengerBn(empty), '');
});
