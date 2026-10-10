const test = require('node:test');
const assert = require('node:assert/strict');

const { findSYInfo, parseJcsyRows } = require('../syParser');

test('reads the October 11 JCSY report queried on October 10 with a repeated final page', () => {
  const firstPage = `MU5411 /TFU/            00/00/001
MU0547 /BKK/     2115+1 00/00/002
MU6017 /CMB/     1425+2 00/00/001
MU5818 /KMG/     1855+1 00/00/003
MU5163 /PEK/     1930+1 00/02/035
FM9223 /URC/     1950+1 00/00/002
MU5673 /DLC/     1955+1 00/00/001
FM9341 /DYG/     2025+1 00/00/002
ZH9528 /SZX/     2025+1 00/00/002
MU5441 /TFU/     2045+1 00/00/005
MU5433 /CKG/     2050+1 00/00/006
MU5541 /FOC/     2115+1 00/02/002
MU9027 /KHN/     2120+1 00/00/004
FM9459 /KWE/     2125+1 00/02/002
MU2193 /XIY/     2130+1 00/01/005
MU5165 /PEK/     2135+1 00/00/006
MU5603 /SHE/     2135+1 00/00/004
MU5220 /TYN/     2140+1 00/00/001
FM9383 /NNG/     2145+1 00/00/003
MU5359 /SZX/     2145+1 00/00/002
MU6984 /YNT/     2155+1 00/00/002`;
  const lastPage = `FM9323 /CGO/     2205+1 00/00/003
MU5470 /CTU/     2210+1 00/00/001
FM9119 /TSN/     2215+1 00/00/002
MU5521 /TAO/     2215+1 00/00/002
MU2544 /WUH/     2220+1 00/00/001
FM9529 /WNZ/     2225+1 00/00/001
MU2882 /NKG/     2230+1 00/01/003
MU5533 /TNA/     2300+1 00/00/003
MU6367 /TNA/     0955+2 00/00/001
FM9465 /KMG/     1050+2 00/00/001
MU5329 /CAN/     1330+2 00/04/000
##TOTAL##  /            00/12/109`;
  const log = `2026 October 10, Saturday, 05:25:48
>SY
SY: MU586/11OCT26 LAX/0 OP/NAM
RET000/012/109
2026 October 10, Saturday, 05:25:50
>JCSY:,O
JCSY:MU0586/11OCT/LAX,O
${firstPage}
2026 October 10, Saturday, 05:25:52
>PN1
JCSY:MU0586/11OCT/LAX,O                                                        -
${lastPage}
2026 October 10, Saturday, 05:25:54
>PN1
JCSY:MU0586/11OCT/LAX,O                                                        -
${lastPage}`;
  const info = findSYInfo(log, '11OCT', { preferredFlightNo: 'MU586', strictPreferredFlight: true });
  assert.equal(info.jcsy.complete, true);
  assert.equal(info.jcsy.rows.length, 32);
  assert.equal(info.jcsy.rows.reduce((sum, row) => sum + row.business, 0), 12);
  assert.equal(info.jcsy.rows.reduce((sum, row) => sum + row.economy, 0), 109);
  assert.equal(info.jcsy.time, '05:25:50');
});

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

test('does not count an identical pasted JCSY page twice', () => {
  const firstPage = [
    'MU1113 /HZD/            00/00/002 00/00/000+00 00/00/000+00 00/00/002 000/0000',
    'MU5163 /PEK/     1930+1 00/00/009 00/00/000+00 00/00/000+00 00/00/009 000/0000'
  ];
  const repeatedPage = [
    'MU5359 /SZX/     2145+1 00/00/003 00/00/000+00 00/00/000+00 00/00/003 000/0000',
    'MU5651 /YNJ/     0640+2 00/01/000 00/00/000+00 00/00/000+00 00/01/000 000/0000'
  ];
  const rows = parseJcsyRows([...firstPage, ...repeatedPage, ...repeatedPage].join('\n'));

  assert.equal(rows.length, 4);
  assert.deepEqual(rows.map((row) => row.flightNo), ['MU1113', 'MU5163', 'MU5359', 'MU5651']);
  assert.equal(rows.reduce((sum, row) => sum + row.total, 0), 15);
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
