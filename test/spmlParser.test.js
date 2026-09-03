const test = require('node:test');
const assert = require('node:assert/strict');
const { parseSpmlLog, parseMealOrderEmail } = require('../spmlParser');

test('parses a continued PD SPML list and keeps the newest query', () => {
  const log = `2026 September 02, Wednesday, 09:14:05
> pd*,spml
> PD: MU586/02SEP26*LAX,SPML
1. 1GAO/XIA             BN122  34A    T PVG
   SPML-VOML VOML HK1
2. 1GUAN/LING           BN047  71J    T PVG
   SPML-SFML SFML HK1
3. 1LI/AIGU             BN124  65H    T PVG
2026 September 02, Wednesday, 09:14:06
> pn1
> PD: MU586/02SEP26*LAX,SPML
   SPML-VGML VGML HK1
4. 1LIN/RUIQ                  39L    T PVG
   SPML-VGML VGML HK1`;
  const result = parseSpmlLog(log, { flightNo: 'MU586', flightDate: '02SEP26' });
  assert.deepEqual(result.preorderCounts, { VOML: 1, SFML: 1, VGML: 2 });
  assert.deepEqual(result.preorderByCabin, { F:{}, J:{}, Y:{ VOML:1, SFML:1, VGML:2 } });
  assert.deepEqual(result.preorder.map((row) => [row.passenger, row.seat, row.confirmed]), [['GAO/XIA', '34A', true], ['GUAN/LING', '71J', true], ['LI/AIGU', '65H', true], ['LIN/RUIQ', '39L', true]]);
});

test('parses FB meal rows for reporting', () => {
  const result = parseSpmlLog(`2026 September 02, Wednesday, 09:20:26
> fb 122
> PR: MU586/02SEP26*LAX,BN122
1. GAO/XIA              BN122  34A    T PVG
SPML-VOML VOML HK1`);
  assert.deepEqual({ passenger:result.report[0].passenger, bn:result.report[0].bn, seat:result.report[0].seat, meal:result.report[0].meal, status:result.report[0].status, confirmed:result.report[0].confirmed }, { passenger:'GAO/XIA', bn:'122', seat:'34A', meal:'VOML', status:'HK1', confirmed:true });
});

test('extracts the emailed economy special-meal totals', () => {
  assert.deepEqual(parseMealOrderEmail('MU586/02SEP26\nF - 4\nC - 50\nY - 231 + 6 VOML + 1 SFML + 2 VGML = 240'), { flightNo:'MU586', flightDate:'02SEP26', cabinCounts:{ F:4, J:50, Y:231 }, countsByCabin:{ F:{}, J:{}, Y:{ VOML:6, SFML:1, VGML:2 } }, economyBase:231, counts:{ VOML:6, SFML:1, VGML:2 }, economyTotal:240 });
});

test('uses booking class rather than seat row to assign the physical cabin', () => {
  const log = `2026 September 03, Thursday, 09:08:25
> pd*,spml\\n> PD: MU586/04SEP2026*LAX,SPML
1. 1JIN/ZHE                    34D    R PVG MKCXYQ
   SPML-SFML SFML HK1
2. 1LI/GUAN                           V PVG PX3HY8
   SPML-DBML DBML HK1
3. 1BUSINESS/PAX              62H    J PVG MEN2GS
   SPML-CHML CHML HK1
4. 1FIRST/PAX                 64H    A PVG MWY9S3
   SPML-LFML LFML HK1`;
  const result = parseSpmlLog(log, { flightNo:'MU586', flightDate:'04SEP26' });
  assert.deepEqual(result.preorder.map(({ bookingClass, cabin }) => [bookingClass, cabin]), [['R', 'Y'], ['V', 'Y'], ['J', 'J'], ['A', 'F']]);
  assert.deepEqual(result.preorderByCabin, { F:{ LFML:1 }, J:{ CHML:1 }, Y:{ SFML:1, DBML:1 } });
});

test('extracts special meals per F/J/Y line and accepts a four-digit year', () => {
  const result = parseMealOrderEmail('MU586/04SEP2026\nF - 4 + 1 FPML = 5\nJ - 50 + 2 MOML = 52\nY - 231 + 3 VGML = 234');
  assert.equal(result.flightDate, '04SEP26');
  assert.deepEqual(result.countsByCabin, { F:{ FPML:1 }, J:{ MOML:2 }, Y:{ VGML:3 } });
});
