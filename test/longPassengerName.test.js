const test = require('node:test');
const assert = require('node:assert/strict');
const { findSYInfo } = require('../syParser');
const { passengers, parseIncrementalLog } = require('../flightParser');

// Synthetic identity and ticket retain the reported display layout.
const record = `2026 October 13, Tuesday, 09:22:25
>fb 161
 PR: MU586/13OCT26*LAX,BN161 PNR RL TESTXX
  1. EXAMPLE/VERYLONGNAMEMB4BN161  63B V PVG BAG2/19/0
     FBA/2PC ET TKNE/7810000000001/1 R63B
 PAXLST :EXAMPLE/VERYLONGNAME/
 PAX INFO :USA/DOB/910613/POB//GENDER/F
 PASSPORT :TEST123/P/NAT/USA//290612/USA/N/A
 CKIN TDAC DONE
 BAGTAG/0781000001/BKK /0781000002/BKK
 O/FM841/14OCT BN013 44B V BKK
 NAM EXAMPLE/VERYLONGNAME
 API LAX49011 AGT23239/13OCT0919/P1`;
const sy = `2026 October 13, Tuesday, 09:00:00
>sy
> SY: MU586/13OCT26 LAX/0 CI1145/NAM
> 777/773L/B7367 GTD/130 POS/GATE BN299 AK00000 CD00000
> BDT1145 SD1230 ED1230 CI1145`;

for (const ticket of ['ET TKNE/7810000000001/1', 'TKNE/7810000000001/1', 'TKNE/7810000000001']) {
  test('long passenger name and ticket: ' + ticket, () => {
    const log = sy + '\n' + record.replace('ET TKNE/7810000000001/1', ticket);
    parseIncrementalLog(log);
    assert.equal(passengers['161'].name, 'EXAMPLE/VERYLONGNAME');
    assert.equal(passengers['161'].seat, '63B');
    const row = findSYInfo(log, '13OCT26', { preferredFlightNo: 'MU586' }).bnAudit.find(p => p.bn === '161');
    assert.equal(row.tkStatus, 'pass');
    assert.equal(row.passengerRecord.ticketNo, '7810000000001');
    assert.equal(row.passengerRecord.name, 'EXAMPLE/VERYLONGNAME');
    assert.equal(row.passengerRecord.seat, '63B');
    assert.equal(row.passengerRecord.bagtags.length, 2);
  });
}
test('infant ticket and LKCK do not satisfy the adult ticket check', () => {
  for (const ticket of ['ET TKNE/INF7810000000001/1', 'CKIN HK1 LKCK/7810000000001/CHKLEG', '']) {
    const log = sy + '\n' + record.replace('ET TKNE/7810000000001/1', ticket);
    const row = findSYInfo(log, '13OCT26').bnAudit.find(p => p.bn === '161');
    assert.equal(row.tkStatus, 'fail');
    assert.match(row.tkReason, /adult ticket|Adult TKNE/i);
  }
});
