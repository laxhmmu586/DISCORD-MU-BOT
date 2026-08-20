const test = require('node:test');
const assert = require('node:assert/strict');

const { findSYInfo, parseJcsyRows } = require('../syParser');

test('parses JCSY rows whose business count uses two digits', () => {
  const rows = parseJcsyRows([
    'MU1111 /HHL/            00/00/002 00/00/000+00 00/00/000+00 00/00/002 000/0000',
    'MU0725 /HKG/     2100+1 00/01/003 00/00/000+00 00/00/000+00 00/01/003 000/0000',
    'FM9529 /WNZ/     2225+1 00/03/001 00/00/000+00 00/00/000+00 00/03/001 000/0000'
  ].join('\n'));

  assert.equal(rows.length, 3);
  assert.deepEqual(rows.map(({ first, business, economy, total }) => ({ first, business, economy, total })), [
    { first: 0, business: 0, economy: 2, total: 2 },
    { first: 0, business: 1, economy: 3, total: 4 },
    { first: 0, business: 3, economy: 1, total: 4 }
  ]);
});

test('uses RET cabin counts and all pasted JCSY pages even without a total footer', () => {
  const log = `2026 August 20, Thursday, 05:25:48
>SY
 SY: MU586/21AUG26 LAX/0  OP/NAM
CNF/F6J52Y258  CAP/F4J46Y227   AV/F4J46Y227
*LAXPVG R003/050/237   C000/000/000  B0000/000000
        RET002/050/230               CET000/000/000

2026 August 20, Thursday, 05:25:51
>JCSY:,O
JCSY:MU0586/21AUG/LAX,O
FLT/DEST/GTD   DEPT   BKD        CHK(NTC)
FM9083 /SHE/          00/000/001 00/000/000+00
FM9233 /WEH/          00/000/001 00/000/000+00
FM9525 /WNZ/          00/000/005 00/000/000+00
MU0509 /HKG/          00/000/002 00/000/000+00
MU0541 /BKK/          00/000/001 00/000/000+00
MU1129 /NBD/          00/000/001 00/000/000+00
MU5343 /SZX/          00/001/002 00/000/000+00
MU5527 /YNT/          00/000/001 00/000/000+00
MU9019 /KWL/          00/000/001 00/000/000+00
MU9029 /DSN/          00/000/001 00/000/000+00

2026 August 20, Thursday, 05:25:53
>PN1
JCSY:MU0586/21AUG/LAX,O
MU0720 /LHW/   2015+1 00/000/001 00/000/000+00
MU0547 /BKK/   2115+1 00/000/002 00/000/000+00
MU0211 /MNL/   2135+1 00/000/002 00/000/000+00
MU0281 /SGN/   2215+1 00/000/004 00/000/000+00
MU5163 /PEK/   1930+1 00/003/021 00/000/000+00
MU5441 /TFU/   2045+1 00/004/000 00/000/000+00
MU5359 /SZX/   2145+1 00/002/008 00/000/000+00`;

  const info = findSYInfo(log, '21AUG', { preferredFlightNo: 'MU586' });

  assert.deepEqual(info.reservationTicketed.slice(1), ['002', '050', '230']);
  assert.equal(info.jcsy.complete, true);
  assert.equal(info.jcsy.rows.length, 17);
  assert.equal(info.jcsy.groups.pvgOnly.reduce((sum, row) => sum + row.total, 0), 17);
  assert.equal(info.jcsy.groups.international.reduce((sum, row) => sum + row.total, 0), 8);
  assert.equal(info.jcsy.groups.domestic.reduce((sum, row) => sum + row.total, 0), 39);
});

test('parses the latest RET and transfer totals from a paged operational report', () => {
  const log = `2026 August 20, Thursday, 10:03:32
> SY
SY: MU586/21AUG26 LAX/0 OP/NAM
CNF/F6J52Y258 CAP/F4J46Y251 AV/F4J45Y249
*LAXPVG R003/050/238 C000/001/002 B0000/000000
RET002/049/230 CET000/001/002

2026 August 20, Thursday, 10:04:02
> JCSY:,O
JCSY:MU0586/21AUG/LAX,O
MU1129 /NBD/            00/00/001 00/00/000+00
MU0547 /BKK/     2115+1 00/00/002 00/00/000+00
MU5163 /PEK/     1930+1 00/03/021 00/00/000+00
MU0541 /BKK/     0905+2 00/00/001 00/00/000+00

2026 August 20, Thursday, 10:04:04
> PN1
JCSY:MU0586/21AUG/LAX,O
MU0281 /SGN/     2215+1 00/00/004 00/00/001+00
MU5343 /SZX/     1500+2 00/01/002 00/00/000+00
##TOTAL##  /            00/04/031 00/00/001+00`;

  const info = findSYInfo(log, '21AUG', {
    preferredFlightNo: 'MU586',
    strictPreferredFlight: true
  });

  assert.deepEqual(info.reservationTicketed.slice(1), ['002', '049', '230']);
  assert.equal(info.jcsy.rows.length, 6);
  assert.equal(info.jcsy.groups.pvgOnly.reduce((sum, row) => sum + row.total, 0), 1);
  assert.equal(info.jcsy.groups.international.reduce((sum, row) => sum + row.total, 0), 6);
  assert.equal(info.jcsy.groups.domestic.reduce((sum, row) => sum + row.total, 0), 24);
  assert.equal(info.jcsy.groups.overnight.reduce((sum, row) => sum + row.total, 0), 4);
});
