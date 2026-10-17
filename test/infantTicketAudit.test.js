const test = require('node:test');
const assert = require('node:assert/strict');
const { findSYInfo } = require('../syParser');

// Sanitized 16OCT26 incident: PD shortened names, paginated ticket lines,
// FB full names, and a later PR1PD with only historical infant references.
const sy = `2026 October 16, Friday, 08:00:00
>sy
SY: MU586/16OCT26 LAX/0 CI0700/NAM
777/773L/B7367 GTD/134 POS/GATE BN299 AK00000 CD00000
BDT1145 SD1230 ED1230 CI0700`;
const passengers = [
  ['LIN/HUAN+', 'LIN/HUANFENG', '61D'],
  ['WU/SHUJ+', 'WU/SHUJUN', '31D'],
  ['TEST/DA+', 'TEST/DANIELA', '72J'],
  ['ZHOU/YI', 'ZHOU/YI', '8D'],
  ['ZHOU/CHAO', 'ZHOU/CHAO', '8H'],
  ['LU/GUOT+', 'LU/GUOTIANYUAN', '35A']
];
const adultTicket = (i) => `78100000000${i}1`;
const infantTicket = (i) => `78100000000${i}2`;
const pr = (time, name, ticket, payload = '', flight = 'MU586') =>
  `2026 October 16, Friday, ${time}
>PR1PD
PR: ${flight}/16OCT26SLAX,1PD PNR RL TEST01
1. ${name} 66L S PVG ASR FBA/2PC
ET TKNE/${ticket}/1 SNR66L
${payload}`;
const pd = `2026 October 16, Friday, 08:47:46
>pd*,inf,etwn
PD: MU586/16OCT26*LAX,INF,ETWN OP/NAM
${passengers.map(([short, , seat], i) => {
  const page = i === 2 || i === 4
    ? `2026 October 16, Friday, 08:47:${i === 2 ? '53' : '56'}\n>pn\nPD: MU586/16OCT26*LAX,INF,ETWN OP/NAM-\n` : '';
  return `${page}${i + 1}. 1${short} ${seat} S PVG IFBA FBA/1PC INF PSM
    BSCT ASR PSPT ET CTC
    ET NUMBER:${adultTicket(i)}/1 ET NUMBER:INF${infantTicket(i)}/1`;
}).join('\n')}`;
const audit = (...parts) => findSYInfo([sy, ...parts].join('\n'), '16OCT26', { preferredFlightNo: 'MU586' }).infTicketAudit;

test('PD pagination and FB full names merge into six infant tickets', () => {
  const fb = passengers.map(([, full], i) => pr(`08:4${i}:00`, full, adultTicket(i),
    `INF-BABY/TEST\nET TKNE/INF${infantTicket(i)}/1`));
  for (const parts of [[...fb, pd], [pd, ...fb]]) {
    const rows = audit(...parts);
    assert.equal(rows.length, 6);
    for (const [, full] of passengers) assert.ok(rows.some((row) => row.adultName === full));
    assert.equal(new Set(rows.map((row) => row.infantTicketNo)).size, 6);
  }
});

test('latest PR clears removed infant despite PSM DOCS and MOD INF history', () => {
  const old = pr('08:30:00', 'QIN/DECL', adultTicket(6), 'INF-BABY/TEST');
  const removed = pr('08:50:32', 'QIN/DECLANYOUCHENFA', adultTicket(6),
    `PSM-//DOCS HK1/////15JUL25/M//QIN/DECLAN/YOUCHEN /INF -HK1 INFQIN/DECLAN15JUL25
    OCCUPYING SEAT /TEST AGENCY
CKIN HK1 LKCK/${adultTicket(6)}/CHKLEG
SPML-CHML CHML HK1
     RES AUTO 14OCT1230
     MOD LAX00000 AGT00000/16OCT0646/INF`);
  for (const parts of [[old, pd, removed], [removed, old, pd]]) {
    const rows = audit(...parts);
    assert.equal(rows.length, 6);
    assert.ok(rows.every((row) => row.infantTicketNo));
    assert.ok(rows.every((row) => !row.adultName.startsWith('QIN/')));
  }
});

test('infant ticket alone establishes active infant and merges with PD', () => {
  const rows = audit(pd, pr('08:49:00', passengers[0][1], adultTicket(0), `ET TKNE/INF${infantTicket(0)}/1`));
  assert.equal(rows.length, 6);
  assert.equal(rows.find((row) => row.adultTicketNo === adultTicket(0)).adultName, passengers[0][1]);
});

test('current infant without ticket still warns, while later removal clears it', () => {
  const active = pr('08:49:00', 'QIN/DECLAN', adultTicket(6), 'INF-BABY/TEST');
  assert.equal(audit(active)[0].infantTicketNo, '');
  assert.equal(audit(active).length, 1);
  assert.deepEqual(audit(active, pr('08:50:00', 'QIN/DECLAN', adultTicket(6))), []);
});

test('history-only PR does not clear infant and other flights do not clear it', () => {
  const fragment = `2026 October 16, Friday, 08:50:00
>fb 1
PR: MU586/16OCT26*LAX,BN001 PNR RL TEST01
MOD LAX00000 AGT00000/16OCT0646/INF`;
  assert.equal(audit(pd, fragment).length, 6);
  assert.equal(audit(pd, pr('08:51:00', passengers[0][1], adultTicket(0), '', 'MU583')).length, 6);
});

test('new active infant can be added after removal without reviving its old ticket', () => {
  const old = pr('08:30:00', 'QIN/DECLAN', adultTicket(6), `INF-BABY/OLD\nET TKNE/INF${infantTicket(6)}/1`);
  const removed = pr('08:40:00', 'QIN/DECLAN', adultTicket(6));
  const restored = pr('08:50:00', 'QIN/DECLAN', adultTicket(6), 'INF-BABY/NEW');
  const rows = audit(restored, old, removed);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].infantName, 'BABY/NEW');
  assert.equal(rows[0].infantTicketNo, '');
});
